'use client'
import { Code, FileSpreadsheet, PlusCircle } from 'lucide-react'
import React, { useEffect, useState } from 'react'

import Container from '@/components/container'
import { Button } from '@/components/ui/button'
import { fetchPayslips, fetchPayslipYears, savePayslip } from '@/lib/api'

import FinanceNavbar from '../finance/FinanceNavbar'
import type { fin_payslip } from './payslipDbCols'
import { PayslipImportModal } from './PayslipImportModal'
import PayslipJsonModal from './PayslipJsonModal'
import { PayslipTable } from './PayslipTable'
import TotalsTable from './TotalsTable.client'

interface PayslipClientProps {
  selectedYear: string
  initialData: fin_payslip[]
  initialYears: string[]
}

const EmptyState = ({ selectedYear }: { selectedYear: string }) => (
  <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
    <p className="font-mono text-sm text-muted-foreground">No payslips found for {selectedYear}</p>
    <Button asChild size="sm">
      <a href={`/finance/payslips/entry?year=${selectedYear}`}>
        <PlusCircle className="mr-2 h-4 w-4" /> Add Payslip
      </a>
    </Button>
  </div>
)

export default function PayslipClient({
  selectedYear: initialSelectedYear,
  initialData: initialPayslipData,
  initialYears: initialAvailableYears,
}: PayslipClientProps): React.ReactElement {
  const [selectedYear, setSelectedYear] = useState(initialSelectedYear)
  const [payslipData, setPayslipData] = useState(initialPayslipData)
  const [availableYears, setAvailableYears] = useState(initialAvailableYears)
  const [showBulkJsonModal, setShowBulkJsonModal] = useState(false)

  useEffect(() => {
    setSelectedYear(initialSelectedYear)
    setPayslipData(initialPayslipData)
    setAvailableYears(initialAvailableYears)
  }, [initialSelectedYear, initialPayslipData, initialAvailableYears])

  const refreshPayslips = async () => {
    const [newData, newYears] = await Promise.all([fetchPayslips(selectedYear), fetchPayslipYears()])
    setPayslipData(newData)
    setAvailableYears(newYears)
  }

  const editRow = async (row: fin_payslip) => {
    await savePayslip(row)
    refreshPayslips()
  }

  const data = payslipData.filter(
    (r) => r.pay_date! >= `${selectedYear}-01-01` && r.pay_date! <= `${selectedYear}-12-31`,
  )
  const dataThroughQ1 = data.filter((r) => r.pay_date! < `${selectedYear}-04-01`)
  const dataThroughQ2 = data.filter((r) => r.pay_date! < `${selectedYear}-07-01`)
  const dataThroughQ3 = data.filter((r) => r.pay_date! < `${selectedYear}-10-01`)
  const dataSeries = [
    ['Q1', dataThroughQ1],
    dataThroughQ2.length > dataThroughQ1.length ? ['Q2', dataThroughQ2] : undefined,
    dataThroughQ3.length > dataThroughQ2.length ? ['Q3', dataThroughQ3] : undefined,
    data.length > dataThroughQ3.length ? ['Q4 (Full Year)', data] : undefined,
  ].filter(Boolean) as [string, fin_payslip[]][]

  return (
    <>
      <FinanceNavbar activeSection="payslips" />
      <Container fluid>
        {/* ── Header bar ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border">
          {/* Year tabs */}
          <div className="flex items-center gap-0 border border-border rounded-md overflow-hidden">
            {availableYears.map((year) => (
              <a
                key={year}
                href={`?year=${year}`}
                className={`font-mono text-xs px-3 py-1.5 border-r border-border last:border-r-0 transition-colors ${
                  year === selectedYear
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {year}
              </a>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
              <a href={`/finance/payslips/entry?year=${selectedYear}`}>
                <PlusCircle className="h-3.5 w-3.5" /> Add
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowBulkJsonModal(true)} className="gap-1.5">
              <Code className="h-3.5 w-3.5" /> Edit as JSON
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/payslip/import/json">Import JSON</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/payslip/import/tsv">
                <FileSpreadsheet className="h-3.5 w-3.5" /> Import TSV
              </a>
            </Button>
            <PayslipImportModal onImportSuccess={refreshPayslips} />
          </div>
        </div>

        {/* ── Section title ────────────────────────────────────────────────── */}
        <div className="px-4 py-3">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-primary">
            {selectedYear} Payslip Ledger
          </h2>
          <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
            {selectedYear}-01-01 — {selectedYear}-12-31
          </p>
        </div>

        <PayslipJsonModal
          open={showBulkJsonModal}
          mode="bulk"
          initialData={payslipData}
          onSuccess={async () => {
            setShowBulkJsonModal(false)
            await refreshPayslips()
          }}
          onClose={() => setShowBulkJsonModal(false)}
        />

        {data.length === 0 ? (
          <EmptyState selectedYear={selectedYear} />
        ) : (
          <>
            <PayslipTable data={data} onRowEdited={editRow} />

            <div className="mt-8 px-4 pb-8 space-y-8">
              <div>
                <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-primary mb-3 pb-2 border-b border-border">
                  Federal Tax Summary
                </h3>
                <TotalsTable
                  series={dataSeries}
                  taxConfig={{ year: selectedYear, state: '', filingStatus: 'Single', standardDeduction: 13850 }}
                />
              </div>
              <div>
                <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-primary mb-3 pb-2 border-b border-border">
                  California State Tax Summary
                </h3>
                <TotalsTable
                  series={dataSeries}
                  taxConfig={{ year: selectedYear, state: 'CA', filingStatus: 'Single', standardDeduction: 13850 }}
                />
              </div>
            </div>
          </>
        )}
      </Container>
    </>
  )
}
