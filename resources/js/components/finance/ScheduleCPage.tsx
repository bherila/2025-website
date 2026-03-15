'use client'
import { ExternalLink } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import { useEffect } from 'react'


interface ScheduleCTransaction {
  t_id: number
  t_date: string
  t_description: string | null
  t_amt: number
  t_account: number
}

interface CategoryTotal {
  label: string
  total: number
  transactions?: ScheduleCTransaction[]
}

interface YearData {
  year: string
  schedule_c_income?: Record<string, CategoryTotal>
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

interface TransactionListModalProps {
  label: string
  transactions: ScheduleCTransaction[]
  onClose: () => void
}

function TransactionListModal({ label, transactions, onClose }: TransactionListModalProps) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((t) => (
              <TableRow key={t.t_id}>
                <TableCell className="text-sm font-mono">{t.t_date}</TableCell>
                <TableCell className="text-sm">{t.t_description ?? '—'}</TableCell>
                <TableCell className="text-right text-sm font-mono">{formatCurrency(t.t_amt)}</TableCell>
                <TableCell>
                  <a
                    href={`/finance/account/${t.t_account}/transactions#t_id=${t.t_id}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Go to transaction"
                  >
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  )
}

function CategoryTable({
  title,
  categories,
}: {
  title: string
  categories: Record<string, CategoryTotal>
}) {
  const [selectedEntry, setSelectedEntry] = useState<{ label: string; transactions: ScheduleCTransaction[] } | null>(null)
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
                <TableRow
                  key={key}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedEntry({ label: cat.label, transactions: cat.transactions ?? [] })}
                  title="Click to view transactions"
                >
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
      {selectedEntry && (
        <TransactionListModal
          label={selectedEntry.label}
          transactions={selectedEntry.transactions}
          onClose={() => setSelectedEntry(null)}
        />
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
    <div className="px-4 pb-8">
      <h1 className="text-2xl font-bold mb-2">Schedule C View</h1>
      <p className="text-muted-foreground mb-6">
        Totals of transactions tagged with Schedule C tax characteristics, grouped by year.
        Click any row to see the individual transactions. Tag transactions with a tax characteristic on the{' '}
        <a href="/finance/tags" className="text-blue-600 hover:underline">
          Manage Tags
        </a>{' '}
        page.
      </p>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
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
              {yearData.schedule_c_income && Object.keys(yearData.schedule_c_income).length > 0 && (
                <div className="mb-6">
                  <CategoryTable
                    title="Schedule C: Income"
                    categories={yearData.schedule_c_income}
                  />
                </div>
              )}
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
  )
}
