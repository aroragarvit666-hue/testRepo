/*
* <license header>
*/

/**
 * Adobe Analytics action.
 *
 * Two modes in one action:
 *  - No `rsid` param  -> returns the list of available report suites (for a Picker)
 *  - With `rsid` + `startDate` + `endDate` -> runs a daily report and returns rows
 */

const fetch = require('node-fetch')
const { Core } = require('@adobe/aio-sdk')
const { generateAccessToken } = require('@adobe/aio-lib-core-auth')
const sdk = require('@adobe/aio-lib-analytics')

async function main (params) {
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

  try {
    logger.info('Calling the analytics action')

    if (!params.apiKey) {
      return { statusCode: 500, body: { error: 'Missing apiKey configuration (SERVICE_API_KEY)' } }
    }

    // 1. OAuth access token (creds injected via include-ims-credentials: true)
    const tokenResponse = await generateAccessToken(params)
    const accessToken = tokenResponse.access_token
    const apiKey = params.apiKey

    // 2. Discover globalCompanyId
    const discoveryRes = await fetch('https://analytics.adobe.io/discovery/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-api-key': apiKey
      }
    })
    if (!discoveryRes.ok) {
      const text = await discoveryRes.text()
      throw new Error(`discovery/me failed with status ${discoveryRes.status}: ${text}`)
    }
    const { imsOrgs } = await discoveryRes.json()
    const globalCompanyId = imsOrgs[0].companies[0].globalCompanyId

    // 3. Init the Analytics SDK
    const analyticsClient = await sdk.init(globalCompanyId, apiKey, accessToken)

    // ---- Mode A: list report suites ----
    if (!params.rsid) {
      logger.info('Fetching report suites')
      const res = await analyticsClient.getCollections({ limit: 100 })
      const suites = (res.body.content || []).map(s => ({ rsid: s.rsid, name: s.name }))
      return { statusCode: 200, body: { suites } }
    }

    // ---- Mode B: run a report ----
    const missing = ['startDate', 'endDate'].filter(p => !params[p])
    if (missing.length > 0) {
      return { statusCode: 400, body: { error: `Missing required params: ${missing.join(', ')}` } }
    }

    logger.info(`Running report for rsid=${params.rsid}`)

    const dateRange = `${params.startDate}T00:00:00.000/${params.endDate}T00:00:00.000`

    const reportBody = {
      rsid: params.rsid,
      globalFilters: [
        { type: 'dateRange', dateRange }
      ],
      metricContainer: {
        metrics: [
          { columnId: '0', id: 'metrics/pageviews' },
          { columnId: '1', id: 'metrics/visits' },
          { columnId: '2', id: 'metrics/visitors' }
        ]
      },
      dimension: 'variables/daterangeday',
      settings: { limit: 400, page: 0, nonesBehavior: 'exclude-nones' }
    }

    const res = await analyticsClient.getReport(reportBody)
    const report = res.body

    const metricNames = ['Page Views', 'Visits', 'Visitors']

    const rows = (report.rows || []).map(r => ({
      id: r.itemId,
      day: r.value,
      pageviews: r.data[0] || 0,
      visits: r.data[1] || 0,
      visitors: r.data[2] || 0
    }))

    // Column totals for the summary cards
    const totals = report.summaryData && report.summaryData.totals
      ? report.summaryData.totals
      : rows.reduce(
        (acc, r) => {
          acc[0] += r.pageviews
          acc[1] += r.visits
          acc[2] += r.visitors
          return acc
        },
        [0, 0, 0]
      )

    return {
      statusCode: 200,
      body: {
        rsid: params.rsid,
        metricNames,
        totals,
        rows
      }
    }
  } catch (error) {
    logger.error(error)
    return { statusCode: 500, body: { error: error.message || 'server error' } }
  }
}

exports.main = main
