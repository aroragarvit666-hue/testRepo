/*
* <license header>
*/

import React, { useState, useEffect, useCallback } from 'react'
import {
  Flex,
  View,
  Heading,
  Content,
  Text,
  Picker,
  Item,
  Button,
  ProgressCircle,
  InlineAlert,
  TableView,
  TableHeader,
  TableBody,
  Column,
  Row,
  Cell,
  IllustratedMessage,
  Divider
} from '@adobe/react-spectrum'
import GraphBarVertical from '@spectrum-icons/workflow/GraphBarVertical'
import NotFound from '@spectrum-icons/illustrations/NotFound'
import actions from '../config.json'
import actionWebInvoke from '../utils'

const DATE_RANGES = [
  { id: '7', name: 'Last 7 days' },
  { id: '30', name: 'Last 30 days' },
  { id: '90', name: 'Last 90 days' }
]

// Returns YYYY-MM-DD in local time
function toDateString (date) {
  return date.toISOString().slice(0, 10)
}

function computeRange (days) {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - Number(days))
  return { startDate: toDateString(start), endDate: toDateString(end) }
}

export default function AnalyticsDashboard (props) {
  const { ims } = props
  const actionUrl = actions['analytics']

  const [suites, setSuites] = useState([])
  const [selectedSuite, setSelectedSuite] = useState(null)
  const [selectedRange, setSelectedRange] = useState('30')

  const [loadingSuites, setLoadingSuites] = useState(false)
  const [loadingReport, setLoadingReport] = useState(false)
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)

  const headers = {
    Authorization: `Bearer ${ims.token}`,
    'x-gw-ims-org-id': ims.org
  }

  // 1. Load report suites on mount
  useEffect(() => {
    let cancelled = false
    async function loadSuites () {
      if (!actionUrl) return
      setLoadingSuites(true)
      setError(null)
      try {
        const res = await actionWebInvoke(actionUrl, headers, {}, { method: 'POST' })
        if (!cancelled) setSuites(res.suites || [])
      } catch (e) {
        if (!cancelled) setError(`Failed to load report suites: ${e.message}`)
      } finally {
        if (!cancelled) setLoadingSuites(false)
      }
    }
    loadSuites()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionUrl])

  // 2 + 3. Load the report for the selected suite + date range
  const loadReport = useCallback(async () => {
    if (!actionUrl || !selectedSuite) return
    setLoadingReport(true)
    setError(null)
    setReport(null)
    try {
      const { startDate, endDate } = computeRange(selectedRange)
      const res = await actionWebInvoke(
        actionUrl,
        headers,
        { rsid: selectedSuite, startDate, endDate },
        { method: 'POST' }
      )
      setReport(res)
    } catch (e) {
      setError(`Failed to load report: ${e.message}`)
    } finally {
      setLoadingReport(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionUrl, selectedSuite, selectedRange])

  const nf = new Intl.NumberFormat('en-US')

  return (
    <View>
      <Heading level={1}>Adobe Analytics Dashboard</Heading>
      <Content>
        <Text>Select a report suite and date range, then load traffic metrics.</Text>
      </Content>

      {!actionUrl && (
        <View marginTop='size-200'>
          <InlineAlert variant='info'>
            <Heading>Not deployed yet</Heading>
            <Content>
              The analytics action URL is not available. Run <code>aio app deploy</code> or the
              Heron preview to populate it.
            </Content>
          </InlineAlert>
        </View>
      )}

      <Divider size='S' marginY='size-200' />

      {/* Controls */}
      <Flex direction='row' gap='size-200' alignItems='end' wrap>
        <Picker
          label='Report suite'
          placeholder={loadingSuites ? 'Loading…' : 'Select a report suite'}
          items={suites}
          selectedKey={selectedSuite}
          onSelectionChange={setSelectedSuite}
          isDisabled={loadingSuites || suites.length === 0}
          width='size-3600'
        >
          {(item) => <Item key={item.rsid}>{item.name}</Item>}
        </Picker>

        <Picker
          label='Date range'
          items={DATE_RANGES}
          selectedKey={selectedRange}
          onSelectionChange={setSelectedRange}
          width='size-2400'
        >
          {(item) => <Item key={item.id}>{item.name}</Item>}
        </Picker>

        <Button
          variant='accent'
          onPress={loadReport}
          isDisabled={!selectedSuite || !actionUrl}
          isPending={loadingReport}
        >
          Load Report
        </Button>
      </Flex>

      {loadingSuites && (
        <Flex alignItems='center' gap='size-100' marginTop='size-200'>
          <ProgressCircle aria-label='Loading report suites' isIndeterminate size='S' />
          <Text>Loading report suites…</Text>
        </Flex>
      )}

      {error && (
        <View marginTop='size-200'>
          <InlineAlert variant='negative'>
            <Heading>Error</Heading>
            <Content>{error}</Content>
          </InlineAlert>
        </View>
      )}

      {/* Report loading */}
      {loadingReport && (
        <Flex alignItems='center' justifyContent='center' height='size-3000'>
          <ProgressCircle aria-label='Loading report' isIndeterminate size='L' />
        </Flex>
      )}

      {/* Report display */}
      {!loadingReport && report && (
        <View marginTop='size-300'>
          {/* Summary cards */}
          <Flex direction='row' gap='size-200' wrap marginBottom='size-300'>
            {report.metricNames.map((name, i) => (
              <View
                key={name}
                backgroundColor='gray-100'
                borderRadius='medium'
                padding='size-200'
                width='size-2400'
                borderWidth='thin'
                borderColor='gray-300'
              >
                <Text>{name}</Text>
                <Heading level={2} margin='size-0'>
                  {nf.format(Math.round(report.totals[i] || 0))}
                </Heading>
              </View>
            ))}
          </Flex>

          {/* Daily breakdown table */}
          <TableView
            aria-label='Daily analytics breakdown'
            height='size-4600'
            renderEmptyState={() => (
              <IllustratedMessage>
                <NotFound />
                <Heading>No data</Heading>
                <Content>No results for the selected suite and date range.</Content>
              </IllustratedMessage>
            )}
          >
            <TableHeader>
              <Column key='day'>Day</Column>
              <Column key='pageviews' align='end'>Page Views</Column>
              <Column key='visits' align='end'>Visits</Column>
              <Column key='visitors' align='end'>Visitors</Column>
            </TableHeader>
            <TableBody items={report.rows}>
              {(item) => (
                <Row key={item.id}>
                  <Cell>{item.day}</Cell>
                  <Cell>{nf.format(item.pageviews)}</Cell>
                  <Cell>{nf.format(item.visits)}</Cell>
                  <Cell>{nf.format(item.visitors)}</Cell>
                </Row>
              )}
            </TableBody>
          </TableView>
        </View>
      )}

      {/* Initial empty state */}
      {!loadingReport && !report && !error && !loadingSuites && (
        <Flex direction='column' alignItems='center' justifyContent='center' height='size-3000' marginTop='size-200'>
          <IllustratedMessage>
            <GraphBarVertical size='XL' />
            <Heading>No report loaded</Heading>
            <Content>Choose a report suite and date range, then select Load Report.</Content>
          </IllustratedMessage>
        </Flex>
      )}
    </View>
  )
}
