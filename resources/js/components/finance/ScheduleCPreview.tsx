'use client'
import { ExternalLink } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  ordinary_income?: Record<string, CategoryTotal>
  w2_income?: Record<string, CategoryTotal>
}

interface YearData {
  year: number
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

function sumCategories(cats: Record<string, CategoryTotal>): number {
  return Object.values(cats).reduce((sum, c) => sum + c.total, 0)
}

interface HomeOfficeCalc {
  allowable: number
  disallowed: number
  priorCarryForward: number
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

/** Ordinary Income section (interest, dividends, other income not tied to Schedule C) */
function OrdinaryIncomeSection({ yearData, showInline }: { yearData: YearData; showInline: boolean }) {
  // Collect all ordinary_income and w2_income across all entities for this year
  const ordinaryIncome: Record<string, CategoryTotal> = {}
  const w2Income: Record<string, CategoryTotal> = {}

  for (const entity of yearData.entities) {
    if (entity.ordinary_income) {
      for (const [key, cat] of Object.entries(entity.ordinary_income)) {
        if (!ordinaryIncome[key]) {
          ordinaryIncome[key] = { label: cat.label, total: 0, transactions: [] }
        }
        ordinaryIncome[key]!.total += cat.total
        ordinaryIncome[key]!.transactions = [...(ordinaryIncome[key]!.transactions ?? []), ...(cat.transactions ?? [])]
      }
    }
    if (entity.w2_income) {
      for (const [key, cat] of Object.entries(entity.w2_income)) {
        if (!w2Income[key]) {
          w2Income[key] = { label: cat.label, total: 0, transactions: [] }
        }
        w2Income[key]!.total += cat.total
        w2Income[key]!.transactions = [...(w2Income[key]!.transactions ?? []), ...(cat.transactions ?? [])]
      }
    }
  }

  const hasOrdinary = Object.keys(ordinaryIncome).length > 0
  const hasW2 = Object.keys(w2Income).length > 0

  if (!hasOrdinary && !hasW2) return null

  return (
    <div className="mb-8">
      <div className="border-l-4 border-blue-500 pl-3 mb-4">
        <h3 className="text-lg font-semibold">Ordinary Income</h3>
      </div>
      <div className="flex flex-col md:flex-row gap-6">
        {hasOrdinary && (
          <div className="flex-1">
            <CategoryTable title="Interest &amp; Dividends" categories={ordinaryIncome} showInline={showInline} />
          </div>
        )}
        {hasW2 && (
          <div className="flex-1">
            <CategoryTable title="W-2 Income" categories={w2Income} showInline={showInline} />
          </div>
        )}
      </div>
    </div>
  )
}

/** Props for ScheduleCPreview — year selection is managed by the parent TaxPreviewPage. */
interface ScheduleCPreviewProps {
  /** The currently selected tax year to display, or 'all' to show every year. */
  selectedYear: number | 'all'
  /** Callback to notify the parent of available years and loading state after data is fetched. */
  onAvailableYearsChange: (years: number[], isLoading: boolean) => void
  /**
   * Callback emitting the net Schedule C income for the currently selected year.
   * Net income = sum of all sch_c entity (income - expenses - allowable home office).
   * Emitted after data loads and when the selected year changes.
   */
  onScheduleCNetIncomeChange?: (netIncome: number) => void
}

export default function ScheduleCPreview({ selectedYear, onAvailableYearsChange, onScheduleCNetIncomeChange }: ScheduleCPreviewProps) {
  const [allData, setAllData] = useState<YearData[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showInline, setShowInline] = useState(false)

  // Load ALL years upfront — year selector only filters the display
  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        onAvailableYearsChange([], true)
        const response = (await fetchWrapper.get('/api/finance/schedule-c')) as ScheduleCResponse
        setAllData(response.years ?? [])
        if (response.available_years) {
          const years = response.available_years.map(Number).filter((y) => !isNaN(y)).sort((a, b) => b - a)
          onAvailableYearsChange(years, false)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load Tax Preview data')
        onAvailableYearsChange([], false)
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [onAvailableYearsChange]) // only load once; onAvailableYearsChange is stable (useCallback in parent)

  // Filter displayed data based on selectedYear (client-side)
  const data = useMemo(() => {
    if (!allData) return null
    if (selectedYear === 'all') return allData
    return allData.filter((yd) => Number(yd.year) === selectedYear)
  }, [allData, selectedYear])

  // Compute home-office carry-forward per entity across all years
  const homeOfficeCalcs = useMemo(() => {
    if (!allData) return new Map<string, HomeOfficeCalc>()

    const map = new Map<string, HomeOfficeCalc>()
    const carryForwardByEntity = new Map<string, number>()

    // Process chronologically (oldest first) — allData is sorted descending
    const chronological = [...allData].reverse()

    for (const yearData of chronological) {
      for (const entity of yearData.entities) {
        const entityKey = String(entity.entity_id ?? 'unassigned')
        const mapKey = `${yearData.year}-${entityKey}`

        const incomeTotal = sumCategories(entity.schedule_c_income ?? {})
        const expenseTotal = sumCategories(entity.schedule_c_expense)
        const homeOfficeTotal = sumCategories(entity.schedule_c_home_office)

        const priorCF = carryForwardByEntity.get(entityKey) ?? 0
        const netIncome = incomeTotal - expenseTotal
        const limit = Math.max(0, netIncome)
        const totalClaim = homeOfficeTotal + priorCF
        const allowable = Math.min(totalClaim, limit)
        const disallowed = totalClaim - allowable

        map.set(mapKey, { allowable, disallowed, priorCarryForward: priorCF })
        carryForwardByEntity.set(entityKey, disallowed)
      }
    }
    return map
  }, [allData])

  // Compute and emit Schedule C net income for the selected year
  useEffect(() => {
    if (!onScheduleCNetIncomeChange) return
    if (!data || selectedYear === 'all') {
      onScheduleCNetIncomeChange(0)
      return
    }
    const yearData = data[0]
    if (!yearData) {
      onScheduleCNetIncomeChange(0)
      return
    }
    let netTotal = 0
    for (const entity of yearData.entities) {
      const entityKey = String(entity.entity_id ?? 'unassigned')
      const mapKey = `${yearData.year}-${entityKey}`
      const calc = homeOfficeCalcs.get(mapKey)
      const income = sumCategories(entity.schedule_c_income ?? {})
      const expense = sumCategories(entity.schedule_c_expense)
      const allowableHO = calc?.allowable ?? 0
      netTotal += income - expense - allowableHO
    }
    onScheduleCNetIncomeChange(netTotal)
  }, [data, homeOfficeCalcs, selectedYear, onScheduleCNetIncomeChange])

  return (
    <div className="px-4 pb-8">
      <div className="flex justify-end mb-2">
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
      </div>
      <p className="text-muted-foreground mb-6">
        Totals of transactions tagged with tax characteristics, grouped by year.
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
          <p className="mb-2 font-medium">No tax data found{selectedYear !== 'all' ? ` for ${selectedYear}` : ''}.</p>
          <p className="text-sm">
            Tag your transactions with tax characteristics to see totals here.
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

              {/* Ordinary Income shown above Schedule C items */}
              <OrdinaryIncomeSection yearData={yearData} showInline={showInline} />

              {/* Schedule C entities */}
              {yearData.entities
                .filter((entity) =>
                  Object.keys(entity.schedule_c_income ?? {}).length > 0 ||
                  Object.keys(entity.schedule_c_expense).length > 0 ||
                  Object.keys(entity.schedule_c_home_office).length > 0,
                )
                .map((entity, idx) => {
                  const hasHomeOffice = Object.keys(entity.schedule_c_home_office).length > 0
                  const entityKey = String(entity.entity_id ?? 'unassigned')
                  const calc = homeOfficeCalcs.get(`${yearData.year}-${entityKey}`)
                  const showHomeOfficeSummary = hasHomeOffice || (calc != null && calc.priorCarryForward > 0)
                  return (
                    <div key={entity.entity_id ?? `unassigned-${idx}`} className="mb-8">
                      {(yearData.entities.length > 1 || entity.entity_name) && (
                        <div className="border-l-4 border-primary pl-3 mb-4">
                          <h3 className="text-lg font-semibold">
                            {entity.entity_name ?? 'Unassigned (No Business Entity)'}
                          </h3>
                        </div>
                      )}

                      {/* Cards: full-width when showing inline transactions or on small screens; otherwise 2–3 column grid */}
                      <div className={`grid gap-6 ${showInline ? 'grid-cols-1' : (hasHomeOffice ? 'md:grid-cols-3' : 'md:grid-cols-2')}`}>
                        {/* Column 1: Schedule C Income */}
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base">Schedule C: Income</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <CategoryTable
                              title=""
                              categories={entity.schedule_c_income ?? {}}
                              showInline={showInline}
                            />
                          </CardContent>
                        </Card>

                        {/* Column 2: Schedule C Expenses + Home Office Deduction Summary */}
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base">Schedule C: Expenses</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <CategoryTable
                              title=""
                              categories={entity.schedule_c_expense}
                              showInline={showInline}
                            />
                            {showHomeOfficeSummary && calc && (
                              <div className="mt-4 space-y-1 border-t pt-3 text-sm">
                                {calc.priorCarryForward > 0 && (
                                  <div className="flex justify-between text-muted-foreground">
                                    <span>Prior Year Home Office Carry-Forward</span>
                                    <span className="font-mono">{formatCurrency(calc.priorCarryForward)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between font-medium">
                                  <span>Allowable Home Office Expense</span>
                                  <span className="font-mono">{formatCurrency(calc.allowable)}</span>
                                </div>
                                {calc.disallowed > 0 && (
                                  <div className="flex justify-between text-amber-600 dark:text-amber-400">
                                    <span>Disallowed Home Office (Carry-Forward)</span>
                                    <span className="font-mono">{formatCurrency(calc.disallowed)}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        {/* Column 3: Home Office (only if data exists) */}
                        {hasHomeOffice && (
                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-base">Home Office Deduction</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0">
                              <CategoryTable
                                title=""
                                categories={entity.schedule_c_home_office}
                                showInline={showInline}
                              />
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
