'use client'

import { useCallback, useEffect, useState } from 'react'

import ScheduleCPreview from '@/components/finance/ScheduleCPreview'
import type { fin_payslip } from '@/components/payslip/payslipDbCols'
import TotalsTable from '@/components/payslip/TotalsTable.client'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'

import { YearSelectorWithNav } from './YearSelectorWithNav'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

/** W-2 income summary table derived from payslips. */
function W2IncomeSummary({ payslips }: { payslips: fin_payslip[] }) {
  if (payslips.length === 0) return null

  const sum = (fn: (row: fin_payslip) => number) =>
    payslips.reduce((acc, row) => acc + fn(row), 0)

  const wages = sum(r => Number(r.ps_salary ?? 0))
  const bonus = sum(r => Number(r.earnings_bonus ?? 0))
  const rsu = sum(r => Number(r.earnings_rsu ?? 0))
  const vacationPayout = sum(r => Number(r.ps_vacation_payout ?? 0))
  const imputed = sum(r =>
    Number(r.imp_ltd ?? 0) + Number(r.imp_legal ?? 0) + Number(r.imp_fitness ?? 0) + Number(r.imp_other ?? 0),
  )
  const gross = wages + bonus + rsu + vacationPayout + imputed

  const fedWH = sum(r =>
    Number(r.ps_fed_tax ?? 0) + Number(r.ps_fed_tax_addl ?? 0) - Number(r.ps_fed_tax_refunded ?? 0),
  )
  const stateWH = sum(r => Number(r.ps_state_tax ?? 0) + Number(r.ps_state_tax_addl ?? 0))
  const oasdi = sum(r => Number(r.ps_oasdi ?? 0))
  const medicare = sum(r => Number(r.ps_medicare ?? 0))
  const sdi = sum(r => Number(r.ps_state_disability ?? 0))

  const rows = [
    { label: 'Wages / Salary', value: wages },
    bonus > 0 ? { label: 'Bonus', value: bonus } : null,
    rsu > 0 ? { label: 'RSU Vesting', value: rsu } : null,
    vacationPayout > 0 ? { label: 'Vacation Payout', value: vacationPayout } : null,
    imputed > 0 ? { label: 'Imputed Income (benefits)', value: imputed } : null,
    { label: 'Total Gross W-2 Income', value: gross, bold: true },
    { label: '', value: null },
    { label: 'Federal Income Tax Withheld', value: fedWH },
    { label: 'State Income Tax Withheld', value: stateWH },
    { label: 'OASDI / Social Security Tax', value: oasdi },
    { label: 'Medicare Tax', value: medicare },
    sdi > 0 ? { label: 'State Disability Insurance (SDI)', value: sdi } : null,
  ].filter(Boolean) as { label: string; value: number | null; bold?: boolean }[]

  return (
    <div className="px-4 pb-4">
      <h2 className="text-lg font-semibold mt-2 mb-2">W-2 Income Summary</h2>
      <div className="border rounded-md overflow-hidden inline-block min-w-[320px]">
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
                    {row.value !== null ? formatCurrency(row.value) : ''}
                  </TableCell>
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>
      </div>
    </div>
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
  const [scheduleCNetIncome, setScheduleCNetIncome] = useState(0)

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

  const handleScheduleCNetIncomeChange = useCallback((netIncome: number) => {
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

  // Build quarterly payslip series (same logic as PayslipClient)
  const year = typeof selectedYear === 'number' ? selectedYear : null
  const data = year ? payslips.filter(
    (r) => r.pay_date! > `${year}-01-01` && r.pay_date! < `${year + 1}-01-01`,
  ) : []
  const dataThroughQ1 = year ? payslips.filter(
    (r) => r.pay_date! > `${year}-01-01` && r.pay_date! < `${year}-04-01`,
  ) : []
  const dataThroughQ2 = year ? payslips.filter(
    (r) => r.pay_date! > `${year}-01-01` && r.pay_date! < `${year}-07-01`,
  ) : []
  const dataThroughQ3 = year ? payslips.filter(
    (r) => r.pay_date! > `${year}-01-01` && r.pay_date! < `${year}-10-01`,
  ) : []

  const dataSeries = year ? [
    ['Q1', dataThroughQ1],
    dataThroughQ2.length > dataThroughQ1.length ? ['Q2', dataThroughQ2] : undefined,
    dataThroughQ3.length > dataThroughQ2.length ? ['Q3', dataThroughQ3] : undefined,
    data.length > dataThroughQ3.length ? ['Q4 (Full Year)', data] : undefined,
  ].filter(Boolean) as [string, fin_payslip[]][] : []

  const showTaxTables = typeof selectedYear === 'number' && !payslipsLoading && data.length > 0

  return (
    <div>
      <div className="flex items-center gap-4 px-4 pt-4 pb-2 flex-wrap">
        <h1 className="text-2xl font-bold">Tax Preview</h1>
        <div className="ml-auto">
          <YearSelectorWithNav
            selectedYear={selectedYear}
            availableYears={availableYears}
            isLoading={isYearsLoading && availableYears.length === 0}
            onYearChange={handleYearChange}
          />
        </div>
      </div>

      {showTaxTables && (
        <>
          <W2IncomeSummary payslips={data} />
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
              extraIncome={scheduleCNetIncome}
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
              extraIncome={scheduleCNetIncome}
            />
          </div>
        </>
      )}

      <ScheduleCPreview
        selectedYear={selectedYear}
        onAvailableYearsChange={handleAvailableYearsChange}
        onScheduleCNetIncomeChange={handleScheduleCNetIncomeChange}
      />
    </div>
  )
}
