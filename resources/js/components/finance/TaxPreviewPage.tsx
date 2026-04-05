'use client'

import currency from 'currency.js'
import { ClipboardList } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import Form1040Preview from '@/components/finance/Form1040Preview'
import ScheduleBPreview from '@/components/finance/ScheduleBPreview'
import ScheduleCPreview from '@/components/finance/ScheduleCPreview'
import TaxDocumentReviewModal from '@/components/finance/TaxDocumentReviewModal'
import TaxDocuments1099Section from '@/components/finance/TaxDocuments1099Section'
import TaxDocumentsSection from '@/components/finance/TaxDocumentsSection'
import type { fin_payslip } from '@/components/payslip/payslipDbCols'
import TotalsTable from '@/components/payslip/TotalsTable.client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import type { TaxDocument } from '@/types/finance/tax-document'

import { YearSelectorWithNav } from './YearSelectorWithNav'

/** Small reusable data-source modal showing contributing payslip rows. */
function PayslipDataSourceModal({
  open,
  label,
  payslips,
  valueGetter,
  onClose,
}: {
  open: boolean
  label: string
  payslips: fin_payslip[]
  valueGetter: (p: fin_payslip) => currency
  onClose: () => void
}) {
  const rows = payslips
    .map(p => ({ payslip: p, value: valueGetter(p) }))
    .filter(r => r.value.value !== 0)
  const total = rows.reduce((acc, r) => acc.add(r.value), currency(0))

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Data Source — {label}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[60vh]">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No payslip contributions found for this field.</p>
          ) : (
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Pay Date</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono">{r.payslip.pay_date}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.payslip.period_start} – {r.payslip.period_end}
                    </TableCell>
                    <TableCell className="text-right font-mono">{r.value.format()}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold bg-muted/30">
                  <TableCell colSpan={2}>Total ({rows.length} payslips)</TableCell>
                  <TableCell className="text-right font-mono">{total.format()}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** W-2 income summary table derived from payslips. */
function W2IncomeSummary({ payslips }: { payslips: fin_payslip[] }) {
  const [dataSourceRow, setDataSourceRow] = useState<{
    label: string
    getter: (p: fin_payslip) => currency
  } | null>(null)

  if (payslips.length === 0) return null

  const sum = (fn: (row: fin_payslip) => currency) =>
    payslips.reduce((acc, row) => acc.add(fn(row)), currency(0))

  const wagesGetter = (r: fin_payslip) => currency(r.ps_salary ?? 0)
  const bonusGetter = (r: fin_payslip) => currency(r.earnings_bonus ?? 0)
  const rsuGetter = (r: fin_payslip) => currency(r.earnings_rsu ?? 0)
  const vacationGetter = (r: fin_payslip) => currency(r.ps_vacation_payout ?? 0)
  const imputedGetter = (r: fin_payslip) =>
    currency(r.imp_ltd ?? 0)
      .add(r.imp_legal ?? 0)
      .add(r.imp_fitness ?? 0)
      .add(r.imp_other ?? 0)
  const fedWHGetter = (r: fin_payslip) =>
    currency(r.ps_fed_tax ?? 0)
      .add(r.ps_fed_tax_addl ?? 0)
      .subtract(r.ps_fed_tax_refunded ?? 0)
  const stateWHGetter = (r: fin_payslip) =>
    currency(r.ps_state_tax ?? 0).add(r.ps_state_tax_addl ?? 0)
  const oasdiGetter = (r: fin_payslip) => currency(r.ps_oasdi ?? 0)
  const medicareGetter = (r: fin_payslip) => currency(r.ps_medicare ?? 0)
  const sdiGetter = (r: fin_payslip) => currency(r.ps_state_disability ?? 0)

  const wages = sum(wagesGetter)
  const bonus = sum(bonusGetter)
  const rsu = sum(rsuGetter)
  const vacationPayout = sum(vacationGetter)
  const imputed = sum(imputedGetter)
  const gross = wages.add(bonus).add(rsu).add(vacationPayout).add(imputed)

  const fedWH = sum(fedWHGetter)
  const stateWH = sum(stateWHGetter)
  const oasdi = sum(oasdiGetter)
  const medicare = sum(medicareGetter)
  const sdi = sum(sdiGetter)

  const grossGetter = (r: fin_payslip) =>
    wagesGetter(r).add(bonusGetter(r)).add(rsuGetter(r)).add(vacationGetter(r)).add(imputedGetter(r))

  const rows = [
    { label: 'Wages / Salary', value: wages, getter: wagesGetter },
    bonus.value > 0 ? { label: 'Bonus', value: bonus, getter: bonusGetter } : null,
    rsu.value > 0 ? { label: 'RSU Vesting', value: rsu, getter: rsuGetter } : null,
    vacationPayout.value > 0 ? { label: 'Vacation Payout', value: vacationPayout, getter: vacationGetter } : null,
    imputed.value > 0 ? { label: 'Imputed Income (benefits)', value: imputed, getter: imputedGetter } : null,
    { label: 'Total Gross W-2 Income', value: gross, bold: true, getter: grossGetter },
    { label: '', value: null, getter: null },
    { label: 'Federal Income Tax Withheld', value: fedWH, getter: fedWHGetter },
    { label: 'State Income Tax Withheld', value: stateWH, getter: stateWHGetter },
    { label: 'OASDI / Social Security Tax', value: oasdi, getter: oasdiGetter },
    { label: 'Medicare Tax', value: medicare, getter: medicareGetter },
    sdi.value > 0 ? { label: 'State Disability Insurance (SDI)', value: sdi, getter: sdiGetter } : null,
  ].filter(Boolean) as { label: string; value: currency | null; bold?: boolean; getter: ((p: fin_payslip) => currency) | null }[]

  return (
    <>
      <div>
        <h2 className="text-lg font-semibold mb-2">W-2 Income Summary</h2>
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line Item</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) =>
                row.label === '' ? (
                  <TableRow key={i} className="border-t-2">
                    <TableCell colSpan={2} className="py-0 h-px bg-muted/30" />
                  </TableRow>
                ) : (
                  <TableRow key={i} className={row.bold ? 'font-semibold bg-muted/30' : ''}>
                    <TableCell className="text-sm">{row.label}</TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {row.value !== null && row.getter ? (
                        <button
                          type="button"
                          className="underline decoration-dotted cursor-pointer hover:text-primary"
                          onClick={() => setDataSourceRow({ label: row.label, getter: row.getter! })}
                          title="View data sources"
                        >
                          {row.value.format()}
                        </button>
                      ) : row.value !== null ? (
                        row.value.format()
                      ) : ''}
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {dataSourceRow && (
        <PayslipDataSourceModal
          open
          label={dataSourceRow.label}
          payslips={payslips}
          valueGetter={dataSourceRow.getter}
          onClose={() => setDataSourceRow(null)}
        />
      )}
    </>
  )
}

/**
 * Tax Preview page — comprehensive tax analysis and planning view.
 * Shows W-2 income (from payslips), Federal and State tax estimates,
 * and Schedule C data for each sch_c employment entity.
 */
export default function TaxPreviewPage() {
  const [hadExplicitYearParamOnLoad, setHadExplicitYearParamOnLoad] = useState(false)
  const [hadInvalidYearParamOnLoad, setHadInvalidYearParamOnLoad] = useState(false)
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [isYearsLoading, setIsYearsLoading] = useState(true)

  // Review modal
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [pendingReviewCount, setPendingReviewCount] = useState(0)

  // Read initial year from URL query string, default to current year
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const y = params.get('year')
      if (y === 'all') return 'all'
      const parsed = y ? parseInt(y, 10) : NaN
      return isNaN(parsed) ? new Date().getFullYear() : parsed
    } catch {
      return new Date().getFullYear()
    }
  })

  // Payslip data for the selected year (used for W-2 income and tax tables)
  const [payslips, setPayslips] = useState<fin_payslip[]>([])
  const [payslipsLoading, setPayslipsLoading] = useState(false)

  // Net Schedule C income for the selected year (emitted by ScheduleCPreview)
  const [scheduleCNetIncome, setScheduleCNetIncome] = useState({
    total: 0,
    byQuarter: {
      q1: 0,
      q2: 0,
      q3: 0,
      q4: 0,
    },
  })

  // 1099 income totals (from confirmed parsed documents)
  const [income1099, setIncome1099] = useState({
    interestIncome: currency(0),
    dividendIncome: currency(0),
    qualifiedDividends: currency(0),
  })

  // Refresh trigger — increment to force child sections to reload after a review
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const handle1099TotalsChange = useCallback((totals: {
    interestIncome: currency
    dividendIncome: currency
    qualifiedDividends: currency
  }) => {
    setIncome1099(totals)
  }, [])

  const setYearInUrl = useCallback((year: number | 'all', mode: 'push' | 'replace' = 'push') => {
    const url = new URL(window.location.href)
    const defaultYear = new Date().getFullYear()
    if (typeof year === 'number' && year === defaultYear) {
      url.searchParams.delete('year')
    } else {
      url.searchParams.set('year', String(year))
    }
    if (mode === 'replace') {
      window.history.replaceState(null, '', url.toString())
      return
    }
    window.history.pushState(null, '', url.toString())
  }, [])

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const y = params.get('year')
      setHadExplicitYearParamOnLoad(y !== null)
      setHadInvalidYearParamOnLoad(y !== null && y !== 'all' && Number.isNaN(parseInt(y, 10)))
    } catch {
      setHadExplicitYearParamOnLoad(false)
      setHadInvalidYearParamOnLoad(false)
    }
  }, [])

  // Push browser history when the user changes year (so Back button works)
  const handleYearChange = useCallback((year: number | 'all') => {
    setSelectedYear(year)
    setYearInUrl(year, 'push')
  }, [setYearInUrl])

  // Restore selected year when the user navigates with Back / Forward
  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search)
      const y = params.get('year')
      if (y === 'all') {
        setSelectedYear('all')
      } else {
        const parsed = y ? parseInt(y, 10) : NaN
        setSelectedYear(isNaN(parsed) ? new Date().getFullYear() : parsed)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const handleAvailableYearsChange = useCallback((years: number[], isLoading: boolean) => {
    setAvailableYears(years)
    setIsYearsLoading(isLoading)
  }, [])

  const handleScheduleCNetIncomeChange = useCallback((netIncome: {
    total: number
    byQuarter: {
      q1: number
      q2: number
      q3: number
      q4: number
    }
  }) => {
    setScheduleCNetIncome(netIncome)
  }, [])

  // Normalize invalid year query values so URL always matches the selected state.
  useEffect(() => {
    if (!hadInvalidYearParamOnLoad) return
    setYearInUrl(selectedYear, 'replace')
  }, [hadInvalidYearParamOnLoad, selectedYear, setYearInUrl])

  // If year wasn't explicitly set in URL, default to newest available year when current year has no data.
  useEffect(() => {
    if ((hadExplicitYearParamOnLoad && !hadInvalidYearParamOnLoad) || isYearsLoading || availableYears.length === 0) return
    if (typeof selectedYear !== 'number') return
    if (availableYears.includes(selectedYear)) return
    const newestYear = availableYears[0]
    if (newestYear === undefined) return
    setSelectedYear(newestYear)
    setYearInUrl(newestYear, 'replace')
  }, [availableYears, hadExplicitYearParamOnLoad, hadInvalidYearParamOnLoad, isYearsLoading, selectedYear, setYearInUrl])

  // Fetch payslips for the selected year
  useEffect(() => {
    if (selectedYear === 'all') {
      setPayslips([])
      return
    }
    let cancelled = false
    setPayslipsLoading(true)
    fetchWrapper.get(`/api/payslips?year=${selectedYear}`)
      .then((data: unknown) => {
        if (!cancelled) setPayslips(Array.isArray(data) ? data as fin_payslip[] : [])
      })
      .catch(() => { if (!cancelled) setPayslips([]) })
      .finally(() => { if (!cancelled) setPayslipsLoading(false) })
    return () => { cancelled = true }
  }, [selectedYear])

  // Fetch count of documents ready for review (parsed but not confirmed)
  useEffect(() => {
    if (typeof selectedYear !== 'number') {
      setPendingReviewCount(0)
      return
    }
    let cancelled = false
    const params = new URLSearchParams({ year: String(selectedYear), genai_status: 'parsed', is_reviewed: '0' })
    fetchWrapper.get(`/api/finance/tax-documents?${params.toString()}`)
      .then((data: unknown) => {
        if (!cancelled) setPendingReviewCount(Array.isArray(data) ? (data as TaxDocument[]).length : 0)
      })
      .catch(() => { if (!cancelled) setPendingReviewCount(0) })
    return () => { cancelled = true }
  }, [selectedYear, refreshTrigger])

  // Build quarterly payslip series in a single pass (same logic as PayslipClient)
  const year = typeof selectedYear === 'number' ? selectedYear : null
  const { data, dataThroughQ1, dataThroughQ2, dataThroughQ3 } = (() => {
    if (!year) return { data: [], dataThroughQ1: [], dataThroughQ2: [], dataThroughQ3: [] }
    const start = `${year}-01-01`
    const end = `${year + 1}-01-01`
    const q1end = `${year}-04-01`
    const q2end = `${year}-07-01`
    const q3end = `${year}-10-01`
    const data: fin_payslip[] = []
    const dataThroughQ1: fin_payslip[] = []
    const dataThroughQ2: fin_payslip[] = []
    const dataThroughQ3: fin_payslip[] = []
    for (const r of payslips) {
      const pd = r.pay_date!
      if (pd <= start || pd >= end) continue
      data.push(r)
      if (pd < q1end) dataThroughQ1.push(r)
      if (pd < q2end) dataThroughQ2.push(r)
      if (pd < q3end) dataThroughQ3.push(r)
    }
    return { data, dataThroughQ1, dataThroughQ2, dataThroughQ3 }
  })()

  const dataSeries = year ? [
    ['Q1', dataThroughQ1],
    dataThroughQ2.length > dataThroughQ1.length ? ['Q2', dataThroughQ2] : undefined,
    dataThroughQ3.length > dataThroughQ2.length ? ['Q3', dataThroughQ3] : undefined,
    data.length > dataThroughQ3.length ? ['Q4 (Full Year)', data] : undefined,
  ].filter(Boolean) as [string, fin_payslip[]][] : []

  const scheduleCIncomeBySeries = {
    Q1: scheduleCNetIncome.byQuarter.q1,
    Q2: scheduleCNetIncome.byQuarter.q2,
    Q3: scheduleCNetIncome.byQuarter.q3,
    'Q4 (Full Year)': scheduleCNetIncome.byQuarter.q4,
  }

  const showTaxTables = typeof selectedYear === 'number' && !payslipsLoading && data.length > 0

  // Compute W-2 gross income for 1040 preview using currency.js for precise arithmetic
  const w2GrossIncome = data.reduce((acc, r) => acc
    .add(r.ps_salary ?? 0)
    .add(r.earnings_bonus ?? 0)
    .add(r.earnings_rsu ?? 0)
    .add(r.ps_vacation_payout ?? 0)
    .add(r.imp_ltd ?? 0)
    .add(r.imp_legal ?? 0)
    .add(r.imp_fitness ?? 0)
    .add(r.imp_other ?? 0), currency(0))

  return (
    <div>
      <div className="flex items-center gap-4 px-4 pt-4 pb-2 flex-wrap">
        <h1 className="text-2xl font-bold">Tax Preview</h1>
        {typeof selectedYear === 'number' && pendingReviewCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setReviewModalOpen(true)}
          >
            <ClipboardList className="h-4 w-4" />
            Review Documents
            <Badge variant="destructive" className="text-xs px-1.5 py-0 h-4">
              {pendingReviewCount}
            </Badge>
          </Button>
        )}
        <div className="ml-auto">
          <YearSelectorWithNav
            selectedYear={selectedYear}
            availableYears={availableYears}
            isLoading={isYearsLoading && availableYears.length === 0}
            onYearChange={handleYearChange}
          />
        </div>
      </div>

      {/* Review modal */}
      {typeof selectedYear === 'number' && (
        <TaxDocumentReviewModal
          open={reviewModalOpen}
          taxYear={selectedYear}
          onClose={() => setReviewModalOpen(false)}
          onDocumentReviewed={() => setRefreshTrigger(t => t + 1)}
        />
      )}

      {/* Row 1: W-2 Income Summary (1/3) + W-2 Upload & Reconciliation (2/3) */}
      {showTaxTables && typeof selectedYear === 'number' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-4 pb-4">
          <div className="lg:col-span-1">
            <W2IncomeSummary payslips={data} />
          </div>
          <div className="lg:col-span-2">
            <TaxDocumentsSection 
              selectedYear={selectedYear} 
              payslips={data} 
              onDocumentReviewed={() => setRefreshTrigger(t => t + 1)} 
            />
          </div>
        </div>
      )}

      {/* Show W-2 documents section even without payslip data */}
      {!showTaxTables && typeof selectedYear === 'number' && (
        <div className="px-4 pb-4">
          <TaxDocumentsSection 
            selectedYear={selectedYear} 
            payslips={data} 
            onDocumentReviewed={() => setRefreshTrigger(t => t + 1)} 
          />
        </div>
      )}

      {/* Row 2: Form 1040 Preview */}
      {typeof selectedYear === 'number' && (
        <Form1040Preview
          w2Income={w2GrossIncome}
          interestIncome={income1099.interestIncome}
          dividendIncome={income1099.dividendIncome}
          scheduleCIncome={scheduleCNetIncome.total}
          selectedYear={selectedYear}
        />
      )}

      {/* Row 3: Schedule B Preview (1/3) + 1099 Upload (2/3) */}
      {typeof selectedYear === 'number' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-4 pb-4">
          <div className="lg:col-span-1">
            <ScheduleBPreview
              interestIncome={income1099.interestIncome}
              dividendIncome={income1099.dividendIncome}
              qualifiedDividends={income1099.qualifiedDividends}
              selectedYear={selectedYear}
            />
          </div>
          <div className="lg:col-span-2">
            <TaxDocuments1099Section
              selectedYear={selectedYear}
              onTotalsChange={handle1099TotalsChange}
            />
          </div>
        </div>
      )}

      {/* Federal & State Tax Tables */}
      {showTaxTables && (
        <div className="px-4 pb-6">
          <h2 className="text-lg font-semibold mt-4 mb-2">Federal Taxes</h2>
          <TotalsTable
            series={dataSeries}
            taxConfig={{
              year: String(selectedYear),
              state: '',
              filingStatus: 'Single',
              standardDeduction: 13850,
            }}
            extraIncome={scheduleCIncomeBySeries}
          />
          <h2 className="text-lg font-semibold mt-6 mb-2">California State Taxes</h2>
          <TotalsTable
            series={dataSeries}
            taxConfig={{
              year: String(selectedYear),
              state: 'CA',
              filingStatus: 'Single',
              standardDeduction: 13850,
            }}
            extraIncome={scheduleCIncomeBySeries}
          />
        </div>
      )}

      <ScheduleCPreview
        selectedYear={selectedYear}
        onAvailableYearsChange={handleAvailableYearsChange}
        onScheduleCNetIncomeChange={handleScheduleCNetIncomeChange}
      />
    </div>
  )
}
