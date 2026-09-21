/*
* <license header>
*/

jest.mock('@adobe/aio-sdk', () => ({
  Core: {
    Logger: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), error: jest.fn() }))
  }
}))

const mockGenerateAccessToken = jest.fn()
jest.mock('@adobe/aio-lib-core-auth', () => ({
  generateAccessToken: (...args) => mockGenerateAccessToken(...args)
}))

const mockGetCollections = jest.fn()
const mockGetReport = jest.fn()
const mockInit = jest.fn()
jest.mock('@adobe/aio-lib-analytics', () => ({
  init: (...args) => mockInit(...args)
}))

const fetch = require('node-fetch')
jest.mock('node-fetch')

const { main } = require('../actions/analytics/index.js')

const baseParams = { apiKey: 'test-key', LOG_LEVEL: 'info' }

function mockDiscoveryOk () {
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ imsOrgs: [{ companies: [{ globalCompanyId: 'gco123' }] }] })
  })
}

describe('analytics action', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGenerateAccessToken.mockResolvedValue({ access_token: 'tok' })
    mockInit.mockResolvedValue({
      getCollections: mockGetCollections,
      getReport: mockGetReport
    })
  })

  it('returns 500 when apiKey is missing', async () => {
    const res = await main({})
    expect(res.statusCode).toBe(500)
    expect(res.body.error).toContain('apiKey')
  })

  it('lists report suites when no rsid is provided (200)', async () => {
    mockDiscoveryOk()
    mockGetCollections.mockResolvedValue({
      body: { content: [{ rsid: 'rs1', name: 'Suite One' }, { rsid: 'rs2', name: 'Suite Two' }] }
    })

    const res = await main({ ...baseParams })
    expect(res.statusCode).toBe(200)
    expect(res.body.suites).toEqual([
      { rsid: 'rs1', name: 'Suite One' },
      { rsid: 'rs2', name: 'Suite Two' }
    ])
  })

  it('returns 400 when rsid is provided but date range is missing', async () => {
    mockDiscoveryOk()
    const res = await main({ ...baseParams, rsid: 'rs1' })
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toContain('Missing')
  })

  it('runs a report and returns rows + totals (200)', async () => {
    mockDiscoveryOk()
    mockGetReport.mockResolvedValue({
      body: {
        rows: [
          { itemId: '1', value: 'Jul 1, 2026', data: [100, 40, 30] },
          { itemId: '2', value: 'Jul 2, 2026', data: [200, 80, 60] }
        ]
      }
    })

    const res = await main({ ...baseParams, rsid: 'rs1', startDate: '2026-07-01', endDate: '2026-07-03' })
    expect(res.statusCode).toBe(200)
    expect(res.body.rows).toHaveLength(2)
    expect(res.body.rows[0]).toMatchObject({ day: 'Jul 1, 2026', pageviews: 100, visits: 40, visitors: 30 })
    expect(res.body.totals).toEqual([300, 120, 90])
    expect(res.body.metricNames).toEqual(['Page Views', 'Visits', 'Visitors'])
  })

  it('returns 500 when the SDK throws', async () => {
    mockDiscoveryOk()
    mockGetCollections.mockRejectedValue(new Error('sdk boom'))
    const res = await main({ ...baseParams })
    expect(res.statusCode).toBe(500)
    expect(res.body.error).toContain('sdk boom')
  })
})
