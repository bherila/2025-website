import currency from 'currency.js'
import { Calculator, Landmark, PiggyBank, SlidersHorizontal, Users } from 'lucide-react'
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
import { cn } from '@/lib/utils'

import type { FilingStatus, RothConversionInputs, RothConversionStrategy } from './types'

interface RothConversionFormProps {
  inputs: RothConversionInputs
  onChange: (inputs: RothConversionInputs) => void
}

interface NumberFieldProps {
  label: string
  value: number
  suffix?: string
  className?: string
  onChange: (value: number) => void
}

interface MoneyFieldProps {
  label: string
  value: number
  className?: string
  onChange: (value: number) => void
}

const filingStatuses: { value: FilingStatus; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'married_filing_jointly', label: 'Married filing jointly' },
  { value: 'head_of_household', label: 'Head of household' },
  { value: 'qualifying_surviving_spouse', label: 'Qualifying surviving spouse' },
]

function parseNumber(raw: string): number {
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseMoney(raw: string): number {
  const parsed = currency(raw).value
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMoney(value: number): string {
  return currency(value, { precision: 0 }).format()
}

function NumberField({ label, value, suffix, className, onChange }: NumberFieldProps): ReactElement {
  const inputId = useId()
  const [rawValue, setRawValue] = useState(String(value))

  useEffect(() => {
    if (parseNumber(rawValue) !== value) {
      setRawValue(String(value))
    }
  }, [rawValue, value])

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    setRawValue(event.target.value)
    onChange(parseNumber(event.target.value))
  }

  function handleFocus(event: FocusEvent<HTMLInputElement>): void {
    event.target.select()
  }

  function handleBlur(): void {
    setRawValue(String(value))
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={inputId}>{label}</Label>
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

function MoneyField({ label, value, className, onChange }: MoneyFieldProps): ReactElement {
  const inputId = useId()
  const [rawValue, setRawValue] = useState(formatMoney(value))

  useEffect(() => {
    if (parseMoney(rawValue) !== value) {
      setRawValue(formatMoney(value))
    }
  }, [rawValue, value])

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    setRawValue(event.target.value)
    onChange(parseMoney(event.target.value))
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

export default function RothConversionForm({ inputs, onChange }: RothConversionFormProps): ReactElement {
  function update<K extends keyof RothConversionInputs>(key: K, value: RothConversionInputs[K]): void {
    onChange({ ...inputs, [key]: value })
  }

  function updatePeople<K extends keyof RothConversionInputs['people']>(key: K, value: RothConversionInputs['people'][K]): void {
    onChange({ ...inputs, people: { ...inputs.people, [key]: value } })
  }

  function updateIncome<K extends keyof RothConversionInputs['income']>(key: K, value: RothConversionInputs['income'][K]): void {
    onChange({ ...inputs, income: { ...inputs.income, [key]: value } })
  }

  function updateSocialSecurity<K extends keyof RothConversionInputs['socialSecurity']>(key: K, value: RothConversionInputs['socialSecurity'][K]): void {
    onChange({ ...inputs, socialSecurity: { ...inputs.socialSecurity, [key]: value } })
  }

  function updateBalances<K extends keyof RothConversionInputs['balances']>(key: K, value: RothConversionInputs['balances'][K]): void {
    onChange({ ...inputs, balances: { ...inputs.balances, [key]: value } })
  }

  function updateStrategy<K extends keyof RothConversionStrategy>(key: K, value: RothConversionStrategy[K]): void {
    onChange({ ...inputs, strategy: { ...inputs.strategy, [key]: value } })
  }

  function updateAssumption<K extends keyof RothConversionInputs['assumptions']>(key: K, value: RothConversionInputs['assumptions'][K]): void {
    onChange({ ...inputs, assumptions: { ...inputs.assumptions, [key]: value } })
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4" />
            People
          </CardTitle>
          <CardDescription>Filing status, ages, and survivor filing transition.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label>Filing status</Label>
            <Select value={inputs.filingStatus} onValueChange={(value) => update('filingStatus', value as FilingStatus)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {filingStatuses.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <NumberField label="Primary current age" value={inputs.people.primaryCurrentAge} onChange={(value) => updatePeople('primaryCurrentAge', value)} />
          <NumberField label="Projection end age" value={inputs.people.primaryEndAge} onChange={(value) => updatePeople('primaryEndAge', value)} />
          <NumberField label="Primary birth year" value={inputs.people.primaryBirthYear} onChange={(value) => updatePeople('primaryBirthYear', value)} />
          <NumberField label="Spouse current age" value={inputs.people.spouseCurrentAge} onChange={(value) => updatePeople('spouseCurrentAge', value)} />
          <NumberField label="Spouse birth year" value={inputs.people.spouseBirthYear} onChange={(value) => updatePeople('spouseBirthYear', value)} />
          <NumberField
            label="First death age"
            value={inputs.people.firstDeathAge ?? 0}
            onChange={(value) => updatePeople('firstDeathAge', value > 0 ? value : null)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="size-4" />
            Income and Social Security
          </CardTitle>
          <CardDescription>Recurring income, retirement ages, and claiming ages.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <MoneyField label="Primary wages" value={inputs.income.wagesPrimary} onChange={(value) => updateIncome('wagesPrimary', value)} />
          <MoneyField label="Spouse wages" value={inputs.income.wagesSpouse} onChange={(value) => updateIncome('wagesSpouse', value)} />
          <NumberField label="Primary retirement age" value={inputs.income.retirementAgePrimary} onChange={(value) => updateIncome('retirementAgePrimary', value)} />
          <NumberField label="Spouse retirement age" value={inputs.income.retirementAgeSpouse} onChange={(value) => updateIncome('retirementAgeSpouse', value)} />
          <MoneyField label="Interest income" value={inputs.income.interest} onChange={(value) => updateIncome('interest', value)} />
          <MoneyField label="Tax-exempt interest" value={inputs.income.taxExemptInterest} onChange={(value) => updateIncome('taxExemptInterest', value)} />
          <MoneyField label="Other ordinary income" value={inputs.income.otherOrdinary} onChange={(value) => updateIncome('otherOrdinary', value)} />
          <MoneyField label="Qualified dividends" value={inputs.income.qualifiedDividends} onChange={(value) => updateIncome('qualifiedDividends', value)} />
          <MoneyField label="Long-term gains" value={inputs.income.longTermCapitalGains} onChange={(value) => updateIncome('longTermCapitalGains', value)} />
          <MoneyField label="Primary PIA / mo" value={inputs.socialSecurity.piaPrimary} onChange={(value) => updateSocialSecurity('piaPrimary', value)} />
          <MoneyField label="Spouse PIA / mo" value={inputs.socialSecurity.piaSpouse} onChange={(value) => updateSocialSecurity('piaSpouse', value)} />
          <NumberField label="Primary claim age" value={inputs.socialSecurity.claimAgePrimary} onChange={(value) => updateSocialSecurity('claimAgePrimary', value)} />
          <NumberField label="Spouse claim age" value={inputs.socialSecurity.claimAgeSpouse} onChange={(value) => updateSocialSecurity('claimAgeSpouse', value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PiggyBank className="size-4" />
            Balances
          </CardTitle>
          <CardDescription>Today&apos;s balances; no account connection required.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <MoneyField label="Traditional primary" value={inputs.balances.traditionalPrimary} onChange={(value) => updateBalances('traditionalPrimary', value)} />
          <MoneyField label="Traditional spouse" value={inputs.balances.traditionalSpouse} onChange={(value) => updateBalances('traditionalSpouse', value)} />
          <MoneyField label="Roth primary" value={inputs.balances.rothPrimary} onChange={(value) => updateBalances('rothPrimary', value)} />
          <MoneyField label="Roth spouse" value={inputs.balances.rothSpouse} onChange={(value) => updateBalances('rothSpouse', value)} />
          <MoneyField label="Taxable brokerage" value={inputs.balances.taxableBrokerage} onChange={(value) => updateBalances('taxableBrokerage', value)} />
          <MoneyField label="Taxable basis" value={inputs.balances.taxableBasis} onChange={(value) => updateBalances('taxableBasis', value)} />
          <MoneyField label="HSA" value={inputs.balances.hsa} onChange={(value) => updateBalances('hsa', value)} />
          <MoneyField label="Cash" value={inputs.balances.cash} onChange={(value) => updateBalances('cash', value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="size-4" />
            Strategy
          </CardTitle>
          <CardDescription>Conversion mode, window, bracket fill, and capital-gain harvesting.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label>Conversion mode</Label>
            <Select value={inputs.strategy.conversionMode} onValueChange={(value) => updateStrategy('conversionMode', value as RothConversionStrategy['conversionMode'])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="constant">Constant dollars</SelectItem>
                <SelectItem value="fill_bracket">Fill tax bracket</SelectItem>
                <SelectItem value="schedule">Per-year schedule</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <NumberField label="Conversion start age" value={inputs.strategy.conversionStartAge} onChange={(value) => updateStrategy('conversionStartAge', value)} />
          <NumberField label="Conversion end age" value={inputs.strategy.conversionEndAge} onChange={(value) => updateStrategy('conversionEndAge', value)} />
          <MoneyField label="Annual conversion" value={inputs.strategy.annualConversion} onChange={(value) => updateStrategy('annualConversion', value)} />
          <div className="grid gap-2">
            <Label>Bracket target</Label>
            <Select value={String(inputs.strategy.bracketTarget)} onValueChange={(value) => updateStrategy('bracketTarget', Number(value) as RothConversionStrategy['bracketTarget'])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12">12%</SelectItem>
                <SelectItem value="22">22%</SelectItem>
                <SelectItem value="24">24%</SelectItem>
                <SelectItem value="32">32%</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Target is the highest ordinary bracket to fill after deductions and taxable Social Security.</p>
          </div>
          <label className="flex min-h-10 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
            <Checkbox checked={inputs.strategy.harvestLtcg} onCheckedChange={(checked) => updateStrategy('harvestLtcg', checked === true)} />
            <span>Harvest long-term gains to target bracket</span>
          </label>
          <label className="flex min-h-10 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
            <Checkbox checked={inputs.assumptions.stateTaxesLtcg} onCheckedChange={(checked) => updateAssumption('stateTaxesLtcg', checked === true)} />
            <span>Apply state tax to LTCG</span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SlidersHorizontal className="size-4" />
            Assumptions
          </CardTitle>
          <CardDescription>Nominal rates used to inflate thresholds and grow balances.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <NumberField label="Pre-retirement growth" value={inputs.assumptions.preRetirementGrowthPercent} suffix="%" onChange={(value) => updateAssumption('preRetirementGrowthPercent', value)} />
          <NumberField label="Post-retirement growth" value={inputs.assumptions.postRetirementGrowthPercent} suffix="%" onChange={(value) => updateAssumption('postRetirementGrowthPercent', value)} />
          <NumberField label="Cash yield" value={inputs.assumptions.cashYieldPercent} suffix="%" onChange={(value) => updateAssumption('cashYieldPercent', value)} />
          <NumberField label="Inflation" value={inputs.assumptions.inflationPercent} suffix="%" onChange={(value) => updateAssumption('inflationPercent', value)} />
          <NumberField label="Flat state tax" value={inputs.assumptions.stateTaxPercent} suffix="%" onChange={(value) => updateAssumption('stateTaxPercent', value)} />
          <NumberField label="SS COLA" value={inputs.socialSecurity.colaPercent} suffix="%" onChange={(value) => updateSocialSecurity('colaPercent', value)} />
          <NumberField label="Discount rate" value={inputs.assumptions.discountRatePercent} suffix="%" onChange={(value) => updateAssumption('discountRatePercent', value)} />
          <MoneyField label="Prior-year MAGI" value={inputs.assumptions.priorYearMagi} onChange={(value) => updateAssumption('priorYearMagi', value)} />
          <MoneyField label="Two-years-prior MAGI" value={inputs.assumptions.twoYearsPriorMagi} onChange={(value) => updateAssumption('twoYearsPriorMagi', value)} />
        </CardContent>
      </Card>
    </div>
  )
}
