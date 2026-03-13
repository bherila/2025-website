'use client'
import { useEffect, useState } from 'react'

import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'

import FinanceSubNav from './FinanceSubNav'

interface CategoryTotal {
  label: string
  total: number
}

interface YearData {
  year: string
  schedule_c_expense: Record<string, CategoryTotal>
  schedule_c_home_office: Record<string, CategoryTotal>
}

interface ScheduleCResponse {
  years: YearData[]
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

function CategoryTable({
  title,
  categories,
}: {
  title: string
  categories: Record<string, CategoryTotal>
}) {
  const entries = Object.entries(categories)
  const total = entries.reduce((sum, [, cat]) => sum + cat.total, 0)

  return (
    <div className="w-full">
      <h3 className="text-base font-semibold mb-2">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 border rounded-md text-center">
          No tagged transactions in this category.
        </p>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map(([key, cat]) => (
                <TableRow key={key}>
                  <TableCell className="text-sm">{cat.label}</TableCell>
                  <TableCell className="text-right text-sm font-mono">
                    {formatCurrency(cat.total)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold bg-muted/50">
                <TableCell>Total</TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(total)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

export default function ScheduleCPage() {
  const [data, setData] = useState<YearData[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        const response = (await fetchWrapper.get('/api/finance/schedule-c')) as ScheduleCResponse
        setData(response.years ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load Schedule C data')
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [])

  return (
    <FinanceSubNav activeSection="schedule-c">
      <div className="px-4 pb-8">
        <h1 className="text-2xl font-bold mb-2">Schedule C View</h1>
        <p className="text-muted-foreground mb-6">
          Totals of transactions tagged with Schedule C tax characteristics, grouped by year.
          Tag transactions with a tax characteristic on the{' '}
          <a href="/finance/tags" className="text-blue-600 hover:underline">
            Manage Tags
          </a>{' '}
          page.
        </p>

        {isLoading && (
          <div className="flex items-center gap-2 py-8">
            <Spinner size="large" />
            <span>Loading Schedule C data…</span>
          </div>
        )}

        {error && (
          <div className="text-red-600 dark:text-red-400 py-4">{error}</div>
        )}

        {!isLoading && !error && data && data.length === 0 && (
          <div className="text-center py-12 text-muted-foreground border rounded-md">
            <p className="mb-2 font-medium">No Schedule C data found.</p>
            <p className="text-sm">
              Tag your transactions with Schedule C tax characteristics to see totals here.
            </p>
          </div>
        )}

        {!isLoading && !error && data && data.length > 0 && (
          <div className="space-y-10">
            {data.map((yearData) => (
              <div key={yearData.year}>
                <div className="w-full bg-muted rounded-md px-4 py-2 mb-4">
                  <h2 className="text-xl font-bold">{yearData.year}</h2>
                </div>
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="md:w-1/2">
                    <CategoryTable
                      title="Schedule C: Expenses"
                      categories={yearData.schedule_c_expense}
                    />
                  </div>
                  <div className="md:w-1/2">
                    <CategoryTable
                      title="Schedule C: Home Office Deduction"
                      categories={yearData.schedule_c_home_office}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </FinanceSubNav>
  )
}
