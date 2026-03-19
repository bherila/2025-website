'use client'
import { ExternalLink } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import { transactionsUrl } from '@/lib/financeRouteBuilder'

import { YearSelectorWithNav } from './YearSelectorWithNav'

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

interface EntityData {
  entity_id: number | null
  entity_name: string | null
  schedule_c_income?: Record<string, CategoryTotal>
  schedule_c_expense: Record<string, CategoryTotal>
  schedule_c_home_office: Record<string, CategoryTotal>
}

interface YearData {
  year: string
  entities: EntityData[]
}

interface ScheduleCResponse {
  available_years: string[]
  years: YearData[]
  entities?: { id: number; display_name: string; type: string }[]
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
                    href={transactionsUrl(t.t_account, { hash: `t_id=${t.t_id}` })}
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

/** Inline transaction rows rendered beneath a category row when showInline is true */
function InlineTransactions({ transactions }: { transactions: ScheduleCTransaction[] }) {
  return (
    <>
      {transactions.map((t) => (
        <TableRow key={`inline-${t.t_id}`} className="bg-muted/30 hover:bg-muted/30">
          <TableCell className="pl-8 text-xs font-mono text-muted-foreground">{t.t_date}</TableCell>
          <TableCell className="text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              {t.t_description ?? '—'}
              <a
                href={transactionsUrl(t.t_account, { hash: `t_id=${t.t_id}` })}
                target="_blank"
                rel="noreferrer"
                title="Go to transaction"
                className="ml-1 shrink-0"
              >
                <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </a>
            </span>
          </TableCell>
          <TableCell className="text-right text-xs font-mono text-muted-foreground">
            {formatCurrency(t.t_amt)}
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}

interface CategoryTableProps {
  title: string
  categories: Record<string, CategoryTotal>
  showInline: boolean
}

function CategoryTable({ title, categories, showInline }: CategoryTableProps) {
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
                <Fragment key={key}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedEntry({ label: cat.label, transactions: cat.transactions ?? [] })}
                    title="Click to view transactions"
                  >
                    <TableCell className="text-sm">{cat.label}</TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {formatCurrency(cat.total)}
                    </TableCell>
                  </TableRow>
                  {showInline && cat.transactions && cat.transactions.length > 0 && (
                    <InlineTransactions transactions={cat.transactions} />
                  )}
                </Fragment>
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
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(() => new Date().getFullYear())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showInline, setShowInline] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        const params = selectedYear !== 'all' ? `?year=${selectedYear}` : ''
        const response = (await fetchWrapper.get(`/api/finance/schedule-c${params}`)) as ScheduleCResponse
        setData(response.years ?? [])
        if (response.available_years) {
          setAvailableYears(response.available_years.map(Number).filter((y) => !isNaN(y)).sort((a, b) => b - a))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load Schedule C data')
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [selectedYear])

  return (
    <div className="px-4 pb-8">
      <div className="flex items-center gap-4 mb-2 flex-wrap">
        <h1 className="text-2xl font-bold">Tax Preview</h1>
        <div className="ml-auto flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch
              id="show-inline"
              checked={showInline}
              onCheckedChange={setShowInline}
            />
            <Label htmlFor="show-inline" className="text-sm cursor-pointer">
              List transactions in-line
            </Label>
          </div>
          <YearSelectorWithNav
            selectedYear={selectedYear}
            availableYears={availableYears}
            isLoading={isLoading && availableYears.length === 0}
            onYearChange={setSelectedYear}
          />
        </div>
      </div>
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
              {yearData.entities.map((entity, idx) => (
                <div key={entity.entity_id ?? `unassigned-${idx}`} className="mb-8">
                  {(yearData.entities.length > 1 || entity.entity_name) && (
                    <div className="border-l-4 border-primary pl-3 mb-4">
                      <h3 className="text-lg font-semibold">
                        {entity.entity_name ?? 'Unassigned (No Business Entity)'}
                      </h3>
                    </div>
                  )}
                  {entity.schedule_c_income && Object.keys(entity.schedule_c_income).length > 0 && (
                    <div className="mb-6">
                      <CategoryTable
                        title="Schedule C: Income"
                        categories={entity.schedule_c_income}
                        showInline={showInline}
                      />
                    </div>
                  )}
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="md:w-1/2">
                      <CategoryTable
                        title="Schedule C: Expenses"
                        categories={entity.schedule_c_expense}
                        showInline={showInline}
                      />
                    </div>
                    <div className="md:w-1/2">
                      <CategoryTable
                        title="Schedule C: Home Office Deduction"
                        categories={entity.schedule_c_home_office}
                        showInline={showInline}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
