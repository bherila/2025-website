'use client'

import currency from 'currency.js'
import { ChevronLeft, Download } from 'lucide-react'
import React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import { type CsvCell, downloadCsv, serializeCsvRows } from '@/lib/csv'

interface AllStatementsViewProps {
  isOpen: boolean
  onClose: () => void
  accountId: number
  fullScreen?: boolean
}

interface GroupedData {
  [section: string]: {
    [line_item: string]: {
      is_percentage: boolean
      values: { [date: string]: number }
      last_ytd_value: number
    }
  }
}

export default function AllStatementsView({ isOpen, onClose, accountId, fullScreen = false }: AllStatementsViewProps) {
  const [dates, setDates] = useState<string[]>([])
  const [groupedData, setGroupedData] = useState<GroupedData>({})
  const [isLoading, setIsLoading] = useState(false)
  const hasComparisonRows = useMemo(
    () => Object.values(groupedData).some((lineItems) => Object.keys(lineItems).length > 0),
    [groupedData],
  )

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true)
      fetchWrapper.get(`/api/finance/${accountId}/all-statement-details`)
        .then(fetchedData => {
          setDates(fetchedData.dates)
          setGroupedData(fetchedData.groupedData)
        })
        .finally(() => setIsLoading(false))
    }
  }, [isOpen, accountId])

  const buildComparisonCsv = useCallback((): string => {
    const rows: CsvCell[][] = [
      ['Section', 'Line Item', ...dates.map(formatStatementDate), 'Last YTD'],
    ]

    Object.entries(groupedData).forEach(([section, lineItems]) => {
      Object.entries(lineItems).forEach(([lineItem, detail]) => {
        rows.push([
          section,
          lineItem,
          ...dates.map((date) => formatComparisonValue(detail.values[date], detail.is_percentage)),
          formatComparisonValue(detail.last_ytd_value, detail.is_percentage),
        ])
      })
    })

    return serializeCsvRows(rows)
  }, [dates, groupedData])

  const handleDownloadCsv = useCallback(() => {
    downloadCsv(buildComparisonCsv(), buildComparisonFilename(accountId))
  }, [accountId, buildComparisonCsv])

  const content = (
    <>
      <div className={`${fullScreen ? 'mb-6' : ''}`}>
        {fullScreen && (
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <Button variant="ghost" size="sm" onClick={onClose}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <h2 className="text-2xl font-bold">All Statements Comparison</h2>
            <Button
              className="ml-auto gap-1.5"
              disabled={isLoading || !hasComparisonRows}
              onClick={handleDownloadCsv}
              variant="outline"
              size="sm"
            >
              <Download className="h-4 w-4" />
              Download CSV
            </Button>
          </div>
        )}
        
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px] sticky left-0 bg-background z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    Line Item
                  </TableHead>
                  {dates.map(date => (
                    <TableHead key={date} className="text-right whitespace-nowrap px-4">
                      {formatStatementDate(date)}
                    </TableHead>
                  ))}
                  <TableHead className="text-right whitespace-nowrap px-4 bg-muted/30 font-bold">Last YTD</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(groupedData).map(([section, lineItems]) => (
                  <React.Fragment key={section}>
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={dates.length + 2} className="font-bold py-2 sticky left-0 z-10">{section}</TableCell>
                    </TableRow>
                    {Object.entries(lineItems).map(([lineItem, { is_percentage, values, last_ytd_value }]) => (
                      <TableRow key={lineItem}>
                        <TableCell className="sticky left-0 bg-background z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                          {lineItem}
                        </TableCell>
                        {dates.map(date => (
                          <TableCell key={date} className="text-right px-4">
                            {formatComparisonValue(values[date], is_percentage)}
                          </TableCell>
                        ))}
                        <TableCell className="text-right px-4 bg-muted/10 font-medium">
                          {formatComparisonValue(last_ytd_value, is_percentage)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  )

  if (!fullScreen) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-7xl overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <DialogTitle>All Statements Comparison</DialogTitle>
              <Button
                className="gap-1.5"
                disabled={isLoading || !hasComparisonRows}
                onClick={handleDownloadCsv}
                variant="outline"
                size="sm"
              >
                <Download className="h-4 w-4" />
                Download CSV
              </Button>
            </div>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <div className="px-4 md:px-8 py-4">
      {content}
    </div>
  )
}

function formatComparisonValue(value: number | undefined, isPercentage: boolean): string {
  if (value === undefined) {
    return '-'
  }

  return isPercentage ? `${value.toFixed(2)}%` : currency(value).format()
}

function formatStatementDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function buildComparisonFilename(accountId: number): string {
  const now = new Date()
  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `statements-comparison-${accountId}-${year}${month}${day}.csv`
}
