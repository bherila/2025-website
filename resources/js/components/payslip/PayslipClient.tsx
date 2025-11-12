'use client'
import { Button } from '@/components/ui/button'
import type { fin_payslip } from './payslipDbCols'
import { PlusCircle, FileSpreadsheet } from 'lucide-react'
import { PayslipTable } from './PayslipTable'
import { cols } from './config/payslipColumnsConfig'
import Container from '@/components/container'
import { savePayslip, fetchPayslips, fetchPayslipYears } from '@/lib/api'
import TotalsTable from './TotalsTable.client'
import React, { useState, useEffect } from 'react'
import { PayslipImportDialog } from './PayslipImportDialog' // Import the new dialog

interface PayslipClientProps {
  selectedYear: string
  initialData: fin_payslip[]
  initialYears: string[]
}

export default function PayslipClient({ selectedYear: initialSelectedYear, initialData: initialPayslipData, initialYears: initialAvailableYears }: PayslipClientProps): React.ReactElement {
  const [selectedYear, setSelectedYear] = useState(initialSelectedYear);
  const [payslipData, setPayslipData] = useState(initialPayslipData);
  const [availableYears, setAvailableYears] = useState(initialAvailableYears);

  useEffect(() => {
    setSelectedYear(initialSelectedYear);
    setPayslipData(initialPayslipData);
    setAvailableYears(initialAvailableYears);
  }, [initialSelectedYear, initialPayslipData, initialAvailableYears]);

  const refreshPayslips = async () => {
    const newPayslipData = await fetchPayslips(selectedYear);
    const newAvailableYears = await fetchPayslipYears();
    setPayslipData(newPayslipData);
    setAvailableYears(newAvailableYears);
  };

  const editRow = async (row: fin_payslip) => {
    await savePayslip(row)
    refreshPayslips(); // Refresh data after editing
  }

  const data = payslipData.filter(
    (r: fin_payslip) => r.pay_date! > `${selectedYear}-01-01` && r.pay_date! < `${selectedYear + 1}-01-01`,
  )
  const dataThroughQ1 = payslipData.filter(
    (r: fin_payslip) => r.pay_date! > `${selectedYear}-01-01` && r.pay_date! < `${selectedYear}-04-01`,
  )
  const dataThroughQ2 = payslipData.filter(
    (r: fin_payslip) => r.pay_date! > `${selectedYear}-01-01` && r.pay_date! < `${selectedYear}-07-01`,
  )
  const dataThroughQ3 = payslipData.filter(
    (r: fin_payslip) => r.pay_date! > `${selectedYear}-01-01` && r.pay_date! < `${selectedYear}-10-01`,
  )
  const dataSeries = [
    ['Q1', dataThroughQ1],
    dataThroughQ2.length > dataThroughQ1.length ? ['Q2', dataThroughQ2] : undefined,
    dataThroughQ3.length > dataThroughQ2.length ? ['Q3', dataThroughQ3] : undefined,
    data.length > dataThroughQ3.length ? ['Q4 (Full Year)', data] : undefined,
  ].filter(Boolean) as [string, fin_payslip[]][]

  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center space-y-4 py-16 text-center">
      <div className="text-muted-foreground">No payslips found for the selected year</div>
      <Button asChild>
        <a href={`/finance/payslips/entry?year=${selectedYear}`}>
          <PlusCircle className="mr-2" /> Add Payslip
        </a>
      </Button>
    </div>
  )

  return (
    <Container fluid>
      <div className="w-full my-2">
        <div className="flex justify-between items-center px-4">
          <div className="flex gap-2 items-center">
            <span>Tax Year:</span>
            {availableYears.map((year) => (
              <Button asChild key={year} variant={year === selectedYear ? 'default' : 'outline'}>
                <a href={`?year=${year}`}>{year}</a>
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <a href={`/finance/payslips/entry?year=${selectedYear}`}>
                <PlusCircle className="mr-2" /> Add Payslip
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href="/payslip/import/json">Import JSON</a>
            </Button>
            <Button asChild variant="outline">
              <a href="/payslip/import/tsv">
                <FileSpreadsheet className="mr-2" /> Import TSV
              </a>
            </Button>
            <PayslipImportDialog onImportSuccess={refreshPayslips} />
          </div>
        </div>

        <div className="px-4 mt-2">
          Tax period:{' '}
          <b>
            {selectedYear}-01-01 through {selectedYear}-12-31
          </b>
        </div>
      </div>

      {data.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <PayslipTable data={data} cols={cols} onRowEdited={editRow} />
          <div className="mt-4">
            <h2 className="text-lg font-semibold mx-2 mt-6 mb-2">Federal Taxes</h2>
            <TotalsTable
              series={dataSeries}
              taxConfig={{
                year: selectedYear,
                state: '',
                filingStatus: 'Single',
                standardDeduction: 13850,
              }}
            />
            <h2 className="text-lg font-semibold mx-2 mt-6 mb-2">California State Taxes</h2>
            <TotalsTable
              series={dataSeries}
              taxConfig={{
                year: selectedYear,
                state: 'CA',
                filingStatus: 'Single',
                standardDeduction: 13850,
              }}
            />
          </div>
        </>
      )}
    </Container>
  )
}
