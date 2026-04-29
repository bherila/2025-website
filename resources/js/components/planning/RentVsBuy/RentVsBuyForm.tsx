'use client'

import { Home, PiggyBank } from 'lucide-react'
import type { ChangeEvent, ReactElement } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { RentVsBuyInputs } from '@/lib/planning/rentVsBuy'
import type { FilingStatus } from '@/lib/tax/standardDeductions'

interface RentVsBuyFormProps {
  inputs: RentVsBuyInputs
  onChange: (next: RentVsBuyInputs) => void
}

interface NumberFieldProps {
  label: string
  value: number
  step?: string
  suffix?: string
  onChange: (next: number) => void
}

const filingStatuses: FilingStatus[] = [
  'Single',
  'Married Filing Jointly',
  'Married Filing Separately',
  'Head of Household',
]

function NumberField({ label, value, step = '0.01', suffix, onChange }: NumberFieldProps): ReactElement {
  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const nextValue = Number.parseFloat(event.target.value)
    onChange(Number.isFinite(nextValue) ? nextValue : 0)
  }

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="relative">
        <Input type="number" value={value} step={step} onChange={handleChange} />
        {suffix ? (
          <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  )
}

export default function RentVsBuyForm({ inputs, onChange }: RentVsBuyFormProps): ReactElement {
  function update<K extends keyof RentVsBuyInputs>(key: K, value: RentVsBuyInputs[K]): void {
    onChange({
      ...inputs,
      [key]: value,
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr_1fr]">
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Home className="size-5" />
            Buy a home
          </CardTitle>
          <CardDescription>Purchase assumptions, carrying costs, appreciation, and sale assumptions.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <NumberField label="Home price" value={inputs.homePrice} onChange={(value) => update('homePrice', value)} />
          <NumberField label="Down payment" value={inputs.downPaymentPercent} suffix="%" onChange={(value) => update('downPaymentPercent', value)} />
          <NumberField label="Mortgage rate" value={inputs.mortgageRatePercent} suffix="%" onChange={(value) => update('mortgageRatePercent', value)} />
          <NumberField label="Mortgage term" value={inputs.mortgageTermYears} step="1" suffix="yrs" onChange={(value) => update('mortgageTermYears', value)} />
          <NumberField label="Closing costs" value={inputs.closingCostsPercent} suffix="%" onChange={(value) => update('closingCostsPercent', value)} />
          <NumberField label="Property tax rate" value={inputs.propertyTaxRatePercent} suffix="% / yr" onChange={(value) => update('propertyTaxRatePercent', value)} />
          <NumberField label="HOA / condo fees" value={inputs.hoaMonthly} onChange={(value) => update('hoaMonthly', value)} />
          <NumberField label="Homeowners insurance" value={inputs.homeownersInsuranceAnnual} onChange={(value) => update('homeownersInsuranceAnnual', value)} />
          <NumberField label="Maintenance" value={inputs.maintenancePercent} suffix="% / yr" onChange={(value) => update('maintenancePercent', value)} />
          <NumberField label="Home appreciation" value={inputs.appreciationPercent} suffix="% / yr" onChange={(value) => update('appreciationPercent', value)} />
          <NumberField label="Selling costs" value={inputs.sellingCostsPercent} suffix="%" onChange={(value) => update('sellingCostsPercent', value)} />
        </CardContent>
      </Card>

      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <PiggyBank className="size-5" />
            Rent instead
          </CardTitle>
          <CardDescription>Baseline rent, renter insurance, and expected annual rent growth.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <NumberField label="Monthly rent" value={inputs.monthlyRent} onChange={(value) => update('monthlyRent', value)} />
          <NumberField label="Renter's insurance" value={inputs.rentersInsuranceAnnual} onChange={(value) => update('rentersInsuranceAnnual', value)} />
          <NumberField label="Rent increase" value={inputs.rentIncreasePercent} suffix="% / yr" onChange={(value) => update('rentIncreasePercent', value)} />
        </CardContent>
      </Card>

      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-xl">Financial environment</CardTitle>
          <CardDescription>Opportunity cost, tax treatment, horizon, and inflation assumptions.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <NumberField label="Investment return" value={inputs.investmentReturnPercent} suffix="% / yr" onChange={(value) => update('investmentReturnPercent', value)} />
          <NumberField label="Marginal tax rate" value={inputs.marginalTaxRatePercent} suffix="%" onChange={(value) => update('marginalTaxRatePercent', value)} />

          <div className="grid gap-2">
            <Label>Filing status</Label>
            <Select value={inputs.filingStatus} onValueChange={(value) => update('filingStatus', value as FilingStatus)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a filing status" />
              </SelectTrigger>
              <SelectContent>
                {filingStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <NumberField label="Time horizon" value={inputs.timeHorizonYears} step="1" suffix="yrs" onChange={(value) => update('timeHorizonYears', value)} />
          <NumberField label="Inflation" value={inputs.inflationRatePercent} suffix="% / yr" onChange={(value) => update('inflationRatePercent', value)} />
        </CardContent>
      </Card>
    </div>
  )
}
