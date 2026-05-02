'use client'

import currency from 'currency.js'
import { Home, PiggyBank } from 'lucide-react'
import { type ChangeEvent, type FocusEvent, type ReactElement, useEffect, useId, useState } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ClosingCostsType, ExpensePeriod, RentVsBuyInputs } from '@/lib/planning/rentVsBuy'
import type { FilingStatus } from '@/lib/tax/standardDeductions'
import { cn } from '@/lib/utils'

interface RentVsBuyFormProps {
  inputs: RentVsBuyInputs
  onChange: (next: RentVsBuyInputs) => void
}

interface NumberFieldProps {
  label: string
  value: number
  className?: string
  labelClassName?: string
  suffix?: string
  onChange: (next: number) => void
}

interface MoneyFieldProps {
  label: string
  value: number
  className?: string
  labelClassName?: string
  onChange: (next: number) => void
}

interface PeriodMoneyFieldProps extends MoneyFieldProps {
  period: ExpensePeriod
  onPeriodChange: (next: ExpensePeriod) => void
}

interface ClosingCostsFieldProps {
  value: number
  type: ClosingCostsType
  className?: string
  onValueChange: (next: number) => void
  onTypeChange: (next: ClosingCostsType) => void
}

const filingStatuses: FilingStatus[] = [
  'Single',
  'Married Filing Jointly',
  'Married Filing Separately',
  'Head of Household',
]

const expensePeriods: ExpensePeriod[] = ['monthly', 'annual']
const closingCostTypes: ClosingCostsType[] = ['percent', 'amount']

function parseMoney(raw: string): number {
  const parsed = currency(raw).value
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMoney(value: number): string {
  return currency(value).format()
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : '0'
}

function parseNumber(raw: string): number {
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

function NumberField({ label, value, className, labelClassName, suffix, onChange }: NumberFieldProps): ReactElement {
  const inputId = useId()
  const [rawValue, setRawValue] = useState(() => formatNumber(value))

  useEffect(() => {
    if (parseNumber(rawValue) !== value) {
      setRawValue(formatNumber(value))
    }
  }, [rawValue, value])

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const nextValue = event.target.value
    setRawValue(nextValue)
    onChange(parseNumber(nextValue))
  }

  function handleFocus(event: FocusEvent<HTMLInputElement>): void {
    event.target.select()
  }

  function handleBlur(): void {
    setRawValue(formatNumber(value))
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={inputId} className={labelClassName}>{label}</Label>
      <InputGroup>
        <InputGroupInput
          id={inputId}
          type="text"
          inputMode="decimal"
          value={rawValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        {suffix ? (
          <InputGroupAddon align="inline-end">
            <InputGroupText>{suffix}</InputGroupText>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    </div>
  )
}

function MoneyField({ label, value, className, labelClassName, onChange }: MoneyFieldProps): ReactElement {
  const inputId = useId()
  const [rawValue, setRawValue] = useState(() => formatMoney(value))

  useEffect(() => {
    if (parseMoney(rawValue) !== value) {
      setRawValue(formatMoney(value))
    }
  }, [rawValue, value])

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const nextValue = event.target.value
    setRawValue(nextValue)
    onChange(parseMoney(nextValue))
  }

  function handleFocus(event: FocusEvent<HTMLInputElement>): void {
    event.target.select()
  }

  function handleBlur(): void {
    setRawValue(formatMoney(value))
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={inputId} className={labelClassName}>{label}</Label>
      <Input
        id={inputId}
        type="text"
        inputMode="decimal"
        value={rawValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    </div>
  )
}

function PeriodMoneyField({ label, value, className, period, onChange, onPeriodChange }: PeriodMoneyFieldProps): ReactElement {
  const inputId = useId()
  const [rawValue, setRawValue] = useState(() => formatMoney(value))

  useEffect(() => {
    if (parseMoney(rawValue) !== value) {
      setRawValue(formatMoney(value))
    }
  }, [rawValue, value])

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const nextValue = event.target.value
    setRawValue(nextValue)
    onChange(parseMoney(nextValue))
  }

  function handleFocus(event: FocusEvent<HTMLInputElement>): void {
    event.target.select()
  }

  function handleBlur(): void {
    setRawValue(formatMoney(value))
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={inputId}>{label}</Label>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <Input
          id={inputId}
          type="text"
          inputMode="decimal"
          value={rawValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        <Select value={period} onValueChange={(next) => onPeriodChange(next as ExpensePeriod)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {expensePeriods.map((expensePeriod) => (
              <SelectItem key={expensePeriod} value={expensePeriod}>
                {expensePeriod === 'monthly' ? 'Monthly' : 'Annually'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function ClosingCostsField({
  value,
  type,
  className,
  onValueChange,
  onTypeChange,
}: ClosingCostsFieldProps): ReactElement {
  return (
    <div className={cn('grid gap-2', className)}>
      <Label>Closing costs</Label>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
        {type === 'amount' ? (
          <MoneyField label="Closing costs amount" labelClassName="sr-only" value={value} onChange={onValueChange} />
        ) : (
          <NumberField label="Closing costs percent" labelClassName="sr-only" value={value} suffix="%" onChange={onValueChange} />
        )}
        <div className="grid gap-2">
          <Label className="sr-only">Closing costs type</Label>
          <Select value={type} onValueChange={(next) => onTypeChange(next as ClosingCostsType)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {closingCostTypes.map((closingCostType) => (
                <SelectItem key={closingCostType} value={closingCostType}>
                  {closingCostType === 'percent' ? 'Percent' : 'Dollar amount'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
          <MoneyField label="Home price" value={inputs.homePrice} onChange={(value) => update('homePrice', value)} />
          <NumberField label="Down payment" value={inputs.downPaymentPercent} suffix="%" onChange={(value) => update('downPaymentPercent', value)} />
          <NumberField label="Mortgage rate" value={inputs.mortgageRatePercent} suffix="%" onChange={(value) => update('mortgageRatePercent', value)} />
          <NumberField label="Mortgage term" value={inputs.mortgageTermYears} suffix="yrs" onChange={(value) => update('mortgageTermYears', value)} />
          <ClosingCostsField
            className="sm:col-span-2"
            value={inputs.closingCostsValue}
            type={inputs.closingCostsType}
            onValueChange={(value) => update('closingCostsValue', value)}
            onTypeChange={(value) => update('closingCostsType', value)}
          />
          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end">
            <NumberField label="Property tax rate" value={inputs.propertyTaxRatePercent} suffix="% / yr" onChange={(value) => update('propertyTaxRatePercent', value)} />
            <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground shadow-sm">
              <Checkbox
                checked={inputs.useCaliforniaProp13}
                onCheckedChange={(checked) => update('useCaliforniaProp13', checked === true)}
              />
              CA Prop 13
            </label>
          </div>
          <div className="grid gap-4 sm:col-span-2 lg:grid-cols-[minmax(0,1fr)_10rem]">
            <PeriodMoneyField
              label="HOA / condo fees"
              value={inputs.hoaAmount}
              period={inputs.hoaPeriod}
              onChange={(value) => update('hoaAmount', value)}
              onPeriodChange={(value) => update('hoaPeriod', value)}
            />
            <NumberField label="HOA growth" value={inputs.hoaGrowthPercent} suffix="% / yr" onChange={(value) => update('hoaGrowthPercent', value)} />
          </div>
          <div className="grid gap-4 sm:col-span-2 lg:grid-cols-[minmax(0,1fr)_10rem]">
            <MoneyField label="Homeowners insurance" value={inputs.homeownersInsuranceAnnual} onChange={(value) => update('homeownersInsuranceAnnual', value)} />
            <NumberField
              label="Insurance growth"
              value={inputs.homeownersInsuranceGrowthPercent}
              suffix="% / yr"
              onChange={(value) => update('homeownersInsuranceGrowthPercent', value)}
            />
          </div>
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
          <MoneyField label="Starting monthly rent" value={inputs.monthlyRent} onChange={(value) => update('monthlyRent', value)} />
          <PeriodMoneyField
            label="Renter's insurance"
            value={inputs.rentersInsuranceAmount}
            period={inputs.rentersInsurancePeriod}
            onChange={(value) => update('rentersInsuranceAmount', value)}
            onPeriodChange={(value) => update('rentersInsurancePeriod', value)}
          />
          <NumberField
            label="Renter's insurance growth"
            value={inputs.rentersInsuranceGrowthPercent}
            suffix="% / yr"
            onChange={(value) => update('rentersInsuranceGrowthPercent', value)}
          />
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
          <NumberField label="Capital gains tax rate" value={inputs.capitalGainsTaxRatePercent} suffix="%" onChange={(value) => update('capitalGainsTaxRatePercent', value)} />

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

          <NumberField label="Time horizon" value={inputs.timeHorizonYears} suffix="yrs" onChange={(value) => update('timeHorizonYears', value)} />
          <NumberField label="Inflation" value={inputs.inflationRatePercent} suffix="% / yr" onChange={(value) => update('inflationRatePercent', value)} />
        </CardContent>
      </Card>
    </div>
  )
}
