'use client'

import { AlertTriangle, ArrowLeftRight, CheckCircle2, Loader2, RefreshCw, Scale, ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Callout, fmtAmt } from '@/components/finance/tax-preview-primitives'
import TaxLotReconciliationPanel from '@/components/finance/TaxLotReconciliationPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchWrapper } from '@/fetchWrapper'

// ============================================================================
// Types (mirror backend WashSaleAdjustment shape)
// ============================================================================

interface WashSaleAdjustment {
  id: string
  loss_sale_id: string
  replacement_purchase_id: string
  symbol: string
  sale_date: string
  replacement_date: string
  disallowed_loss: number
  sale_account_id: number | null
  sale_account_name: string | null
  replacement_account_id: number | null
  replacement_account_name: string | null
  is_cross_account: boolean
  reason: string
  sale_lot_id: number | null
  replacement_lot_id: number | null
}

interface WashSaleResponse {
  tax_year: number
  total: number
  cross_account_count: number
  same_account_count: number
  adjustments: WashSaleAdjustment[]
}

interface Form8949Row {
  form_8949_box: string
  description: string
  date_acquired: string | null
  date_sold: string
  proceeds: number
  cost_basis: number
  adjustment_code: string | null
  adjustment_amount: number
  gain_or_loss: number
  is_short_term: boolean
  is_covered: boolean | null
  is_summary_row: boolean
  account_name: string | null
  tax_document_id: number | null
  source_transaction_id: string | null
}

interface ScheduleDRollup {
  form_8949_box: string
  is_short_term: boolean
  schedule_d_line: string
  total_proceeds: number
  total_cost_basis: number
  total_adjustment: number
  net_gain_or_loss: number
  row_count: number
}

interface Form8949Response {
  tax_year: number
  reporting_mode: string
  rows: Form8949Row[]
  schedule_d_rollup: ScheduleDRollup[]
}

// ============================================================================
// Main component
// ============================================================================

interface CapitalGainsReconciliationPanelProps {
  selectedYear: number
}

export default function CapitalGainsReconciliationPanel({ selectedYear }: CapitalGainsReconciliationPanelProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Capital Gains Reconciliation</h2>
        <p className="text-xs text-muted-foreground">
          Reconcile 1099-B imports, detect cross-account wash sales, and review Form 8949 adjustments for {selectedYear}.
        </p>
      </div>

      <Tabs defaultValue="reconcile-lots">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="reconcile-lots" className="gap-1.5">
            <Scale className="h-3.5 w-3.5" />
            Reconcile Lots
          </TabsTrigger>
          <TabsTrigger value="wash-sales" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Wash Sales
          </TabsTrigger>
          <TabsTrigger value="adjustments" className="gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" />
            Adjustments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reconcile-lots" className="mt-4">
          <TaxLotReconciliationPanel selectedYear={selectedYear} />
        </TabsContent>

        <TabsContent value="wash-sales" className="mt-4">
          <WashSalesPanel selectedYear={selectedYear} />
        </TabsContent>

        <TabsContent value="adjustments" className="mt-4">
          <Form8949AdjustmentsPanel selectedYear={selectedYear} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============================================================================
// Wash Sales tab
// ============================================================================

function WashSalesPanel({ selectedYear }: { selectedYear: number }) {
  const [data, setData] = useState<WashSaleResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetchWrapper.get(`/api/finance/capital-gains/wash-sales?tax_year=${selectedYear}`)
      setData(response as WashSaleResponse)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [selectedYear])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Analyzing wash sales…
      </div>
    )
  }

  if (error) {
    return (
      <Callout kind="warn" title="Unable to load wash-sale analysis">
        <p>{error}</p>
        <Button className="mt-3 gap-1.5" variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </Callout>
    )
  }

  if (!data) {
    return null
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Wash-Sale Analysis — {selectedYear}</h3>
        <p className="text-xs text-muted-foreground">
          Detected wash sales across all taxable accounts. Cross-account adjustments are taxpayer-level
          facts that may not appear on any single 1099-B.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <SummaryCard label="Total Wash Sales" value={data.total} />
        <SummaryCard label="Same-Account" value={data.same_account_count} />
        <SummaryCard label="Cross-Account" value={data.cross_account_count} highlight={data.cross_account_count > 0} />
      </div>

      {data.adjustments.length === 0 ? (
        <div className="rounded-md border border-border bg-muted/30 py-10 text-center text-sm text-muted-foreground">
          <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
          No wash sales detected for {selectedYear}.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Sale Date</TableHead>
                <TableHead>Sale Account</TableHead>
                <TableHead>Replacement Date</TableHead>
                <TableHead>Replacement Account</TableHead>
                <TableHead className="text-right">Disallowed Loss</TableHead>
                <TableHead>Rule</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.adjustments.map(adj => (
                <TableRow key={adj.id}>
                  <TableCell>
                    {adj.is_cross_account ? (
                      <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300">
                        <ArrowLeftRight className="mr-1 h-3 w-3" />
                        Cross-Account
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                        Same-Account
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{adj.symbol}</TableCell>
                  <TableCell className="text-xs">{adj.sale_date}</TableCell>
                  <TableCell className="text-xs">{adj.sale_account_name ?? '—'}</TableCell>
                  <TableCell className="text-xs">{adj.replacement_date}</TableCell>
                  <TableCell className="text-xs">{adj.replacement_account_name ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-red-700 dark:text-red-300">
                    {fmtAmt(adj.disallowed_loss, 2)}
                  </TableCell>
                  <TableCell>
                    <span className="line-clamp-2 max-w-xs text-xs text-muted-foreground" title={adj.reason}>
                      {adj.reason}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Adjustments tab (Form 8949 preview + Schedule D rollup)
// ============================================================================

function Form8949AdjustmentsPanel({ selectedYear }: { selectedYear: number }) {
  const [data, setData] = useState<Form8949Response | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetchWrapper.get(
        `/api/finance/capital-gains/form-8949?tax_year=${selectedYear}&reporting_mode=form_8949_transactions`,
      )
      setData(response as Form8949Response)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [selectedYear])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Building Form 8949 adjustments…
      </div>
    )
  }

  if (error) {
    return (
      <Callout kind="warn" title="Unable to load Form 8949 adjustments">
        <p>{error}</p>
        <Button className="mt-3 gap-1.5" variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </Callout>
    )
  }

  if (!data) {
    return null
  }

  const totalNetGain = data.schedule_d_rollup.reduce((acc, r) => acc + r.net_gain_or_loss, 0)
  const totalAdjustment = data.schedule_d_rollup.reduce((acc, r) => acc + r.total_adjustment, 0)

  return (
    <div className="space-y-6">
      {/* Schedule D Rollup Summary */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Schedule D Rollup — {selectedYear}</h3>
        <p className="text-xs text-muted-foreground">
          Net capital gain/loss per Form 8949 box, including all wash-sale adjustments.
        </p>

        {data.schedule_d_rollup.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/30 py-8 text-center text-sm text-muted-foreground">
            No account lots found for {selectedYear}.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Box</TableHead>
                  <TableHead>Sch D Line</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead className="text-right">Proceeds</TableHead>
                  <TableHead className="text-right">Basis</TableHead>
                  <TableHead className="text-right">Adjustment</TableHead>
                  <TableHead className="text-right">Net G/L</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.schedule_d_rollup.map(rollup => (
                  <TableRow key={rollup.form_8949_box}>
                    <TableCell className="font-mono font-semibold">{rollup.form_8949_box}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{rollup.schedule_d_line}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={rollup.is_short_term
                        ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'}>
                        {rollup.is_short_term ? 'Short-term' : 'Long-term'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{fmtAmt(rollup.total_proceeds, 2)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{fmtAmt(rollup.total_cost_basis, 2)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {rollup.total_adjustment !== 0 ? (
                        <span className="text-amber-700 dark:text-amber-300">{fmtAmt(rollup.total_adjustment, 2)}</span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className={`text-right font-mono tabular-nums ${rollup.net_gain_or_loss >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                      {fmtAmt(rollup.net_gain_or_loss, 2)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{rollup.row_count}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30 font-semibold">
                  <TableCell colSpan={5}>Total</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {totalAdjustment !== 0 ? (
                      <span className="text-amber-700 dark:text-amber-300">{fmtAmt(totalAdjustment, 2)}</span>
                    ) : '—'}
                  </TableCell>
                  <TableCell className={`text-right font-mono tabular-nums ${totalNetGain >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                    {fmtAmt(totalNetGain, 2)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {data.schedule_d_rollup.reduce((acc, r) => acc + r.row_count, 0)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Individual Form 8949 rows */}
      {data.rows.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Form 8949 — Individual Transactions</h3>
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Box</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Acquired</TableHead>
                  <TableHead>Sold</TableHead>
                  <TableHead className="text-right">Proceeds</TableHead>
                  <TableHead className="text-right">Basis</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead className="text-right">Adjustment</TableHead>
                  <TableHead className="text-right">G/L</TableHead>
                  <TableHead>Account</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row, i) => (
                  <TableRow key={`${row.source_transaction_id ?? i}-${row.date_sold}`}>
                    <TableCell className="font-mono font-semibold">{row.form_8949_box}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-xs" title={row.description}>{row.description}</TableCell>
                    <TableCell className="text-xs">{row.date_acquired ?? '—'}</TableCell>
                    <TableCell className="text-xs">{row.date_sold}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs">{fmtAmt(row.proceeds, 2)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs">{fmtAmt(row.cost_basis, 2)}</TableCell>
                    <TableCell className="font-mono text-xs">{row.adjustment_code ?? '—'}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs">
                      {row.adjustment_amount !== 0 ? (
                        <span className="text-amber-700 dark:text-amber-300">{fmtAmt(row.adjustment_amount, 2)}</span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className={`text-right font-mono tabular-nums text-xs ${row.gain_or_loss >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                      {fmtAmt(row.gain_or_loss, 2)}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs text-muted-foreground">{row.account_name ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Shared UI atoms
// ============================================================================

function SummaryCard({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${highlight && value > 0 ? 'border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950' : 'border-border bg-card'}`}>
      <div className="text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}
