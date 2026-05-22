import currency from 'currency.js'
import { Calculator, Landmark, type LucideIcon, PiggyBank, Receipt, SlidersHorizontal, Users } from 'lucide-react'
import { type ChangeEvent, type FocusEvent, type ReactElement, useEffect, useId, useState } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import type { MillerRegistryEntry } from '@/components/ui/miller'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { cn } from '@/lib/utils'

import { ageFromBirthYear, findMeta, isMarriedFilingStatus } from './inputUtils'
import type { FilingStatus, RothConversionInputs, RothConversionStrategy } from './types'

export type RothConversionFormSectionId = 'people' | 'income' | 'expenses' | 'balances' | 'strategy' | 'assumptions'

export interface RothConversionFormSectionMeta {
  id: RothConversionFormSectionId
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
  presentation: 'column'
  component: MillerRegistryEntry<unknown, RothConversionFormSectionId>['component']
  meta: {
    description: string
    icon: LucideIcon
  }
}

interface RothConversionFormProps {
  inputs: RothConversionInputs
  onChange: (inputs: RothConversionInputs) => void
}

interface RothConversionFormSectionProps extends RothConversionFormProps {
  section: RothConversionFormSectionId
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

interface SelectFieldProps {
  label: string
  value: string
  options: { value: string; label: string }[]
  className?: string
  onChange: (value: string) => void
}

const filingStatuses: { value: FilingStatus; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'married_filing_jointly', label: 'Married filing jointly' },
  { value: 'head_of_household', label: 'Head of household' },
  { value: 'qualifying_surviving_spouse', label: 'Qualifying surviving spouse' },
]

export const ROTH_CONVERSION_FORM_SECTIONS: RothConversionFormSectionMeta[] = [
  {
    id: 'people',
    label: 'People and Filing Status',
    shortLabel: 'People',
    description: 'Birth years, projection window, and survivor transition.',
    icon: Users,
    presentation: 'column',
    component: () => <></>,
    meta: { description: 'Birth years, projection window, and survivor transition.', icon: Users },
  },
  {
    id: 'income',
    label: 'Income and Social Security',
    shortLabel: 'Income',
    description: 'Recurring income, retirement ages, and claiming ages.',
    icon: Landmark,
    presentation: 'column',
    component: () => <></>,
    meta: { description: 'Recurring income, retirement ages, and claiming ages.', icon: Landmark },
  },
  {
    id: 'expenses',
    label: 'Expenses',
    shortLabel: 'Expenses',
    description: 'Annual spending needs and Schedule A expense inputs.',
    icon: Receipt,
    presentation: 'column',
    component: () => <></>,
    meta: { description: 'Annual spending needs and Schedule A expense inputs.', icon: Receipt },
  },
  {
    id: 'balances',
    label: 'Balances',
    shortLabel: 'Balances',
    description: 'Current account balances used by the projection.',
    icon: PiggyBank,
    presentation: 'column',
    component: () => <></>,
    meta: { description: 'Current account balances used by the projection.', icon: PiggyBank },
  },
  {
    id: 'strategy',
    label: 'Conversion Strategy',
    shortLabel: 'Strategy',
    description: 'Conversion mode, bracket target, and harvesting rules.',
    icon: Calculator,
    presentation: 'column',
    component: () => <></>,
    meta: { description: 'Conversion mode, bracket target, and harvesting rules.', icon: Calculator },
  },
  {
    id: 'assumptions',
    label: 'Growth and Tax Assumptions',
    shortLabel: 'Assumptions',
    description: 'Growth, inflation, state tax, and IRMAA lookback assumptions.',
    icon: SlidersHorizontal,
    presentation: 'column',
    component: () => <></>,
    meta: { description: 'Growth, inflation, state tax, and IRMAA lookback assumptions.', icon: SlidersHorizontal },
  },
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

function SelectField({ label, value, options, className, onChange }: SelectFieldProps): ReactElement {
  const inputId = useId()
  const selectedLabel = options.find((option) => option.value === value)?.label ?? options[0]?.label ?? ''

  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={inputId}>{label}</Label>
      <Select
        value={value}
        onValueChange={onChange}
      >
        <SelectTrigger id={inputId} className="w-full">
          <span className="truncate">{selectedLabel}</span>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} sideOffset={4}>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function DerivedAge({ label, age }: { label: string; age: number }): ReactElement {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex h-9 items-center rounded-md border border-dashed border-border bg-muted/30 px-3 text-sm text-muted-foreground">
        {age} years old
      </div>
    </div>
  )
}

export function RothConversionFormSection({ section, inputs, onChange }: RothConversionFormSectionProps): ReactElement {
  const meta = findMeta(ROTH_CONVERSION_FORM_SECTIONS, section)
  const married = isMarriedFilingStatus(inputs.filingStatus)
  const primaryAge = ageFromBirthYear(inputs.currentYear, inputs.people.primaryBirthYear)
  const spouseAge = ageFromBirthYear(inputs.currentYear, inputs.people.spouseBirthYear)
  const Icon = meta.icon

  function commit(nextInputs: RothConversionInputs): void {
    onChange(nextInputs)
  }

  function update<K extends keyof RothConversionInputs>(key: K, value: RothConversionInputs[K]): void {
    commit({ ...inputs, [key]: value })
  }

  function updatePeople<K extends keyof RothConversionInputs['people']>(key: K, value: RothConversionInputs['people'][K]): void {
    commit({ ...inputs, people: { ...inputs.people, [key]: value } })
  }

  function updateIncome<K extends keyof RothConversionInputs['income']>(key: K, value: RothConversionInputs['income'][K]): void {
    commit({ ...inputs, income: { ...inputs.income, [key]: value } })
  }

  function updateSocialSecurity<K extends keyof RothConversionInputs['socialSecurity']>(key: K, value: RothConversionInputs['socialSecurity'][K]): void {
    commit({ ...inputs, socialSecurity: { ...inputs.socialSecurity, [key]: value } })
  }

  function updateBalances<K extends keyof RothConversionInputs['balances']>(key: K, value: RothConversionInputs['balances'][K]): void {
    commit({ ...inputs, balances: { ...inputs.balances, [key]: value } })
  }

  function updateExpenses<K extends keyof RothConversionInputs['expenses']>(key: K, value: RothConversionInputs['expenses'][K]): void {
    commit({ ...inputs, expenses: { ...inputs.expenses, [key]: value } })
  }

  function updateStrategy<K extends keyof RothConversionStrategy>(key: K, value: RothConversionStrategy[K]): void {
    commit({ ...inputs, strategy: { ...inputs.strategy, [key]: value } })
  }

  function updateAssumption<K extends keyof RothConversionInputs['assumptions']>(key: K, value: RothConversionInputs['assumptions'][K]): void {
    commit({ ...inputs, assumptions: { ...inputs.assumptions, [key]: value } })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4" />
          {meta.shortLabel}
        </CardTitle>
        <CardDescription>{meta.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {section === 'people' && (
          <>
            <SelectField
              label="Filing status"
              value={inputs.filingStatus}
              options={filingStatuses}
              className="sm:col-span-2"
              onChange={(value) => update('filingStatus', value as FilingStatus)}
            />
            <NumberField label="Primary birth year" value={inputs.people.primaryBirthYear} onChange={(value) => updatePeople('primaryBirthYear', value)} />
            <DerivedAge label="Primary current age" age={primaryAge} />
            <NumberField label="Projection end age" value={inputs.people.primaryEndAge} onChange={(value) => updatePeople('primaryEndAge', value)} />
            {married && (
              <>
                <NumberField label="Spouse birth year" value={inputs.people.spouseBirthYear} onChange={(value) => updatePeople('spouseBirthYear', value)} />
                <DerivedAge label="Spouse current age" age={spouseAge} />
                <NumberField label="Spouse end age" value={inputs.people.spouseEndAge} onChange={(value) => updatePeople('spouseEndAge', value)} />
                <NumberField
                  label="First death age"
                  value={inputs.people.firstDeathAge ?? 0}
                  onChange={(value) => updatePeople('firstDeathAge', value > 0 ? value : null)}
                />
              </>
            )}
          </>
        )}

        {section === 'income' && (
          <>
            <MoneyField label="Primary wages" value={inputs.income.wagesPrimary} onChange={(value) => updateIncome('wagesPrimary', value)} />
            {married && <MoneyField label="Spouse wages" value={inputs.income.wagesSpouse} onChange={(value) => updateIncome('wagesSpouse', value)} />}
            <NumberField label="Primary retirement age" value={inputs.income.retirementAgePrimary} onChange={(value) => updateIncome('retirementAgePrimary', value)} />
            {married && <NumberField label="Spouse retirement age" value={inputs.income.retirementAgeSpouse} onChange={(value) => updateIncome('retirementAgeSpouse', value)} />}
            <MoneyField label="Interest income" value={inputs.income.interest} onChange={(value) => updateIncome('interest', value)} />
            <MoneyField label="Tax-exempt interest" value={inputs.income.taxExemptInterest} onChange={(value) => updateIncome('taxExemptInterest', value)} />
            <MoneyField label="Other ordinary income" value={inputs.income.otherOrdinary} onChange={(value) => updateIncome('otherOrdinary', value)} />
            <MoneyField label="Qualified dividends" value={inputs.income.qualifiedDividends} onChange={(value) => updateIncome('qualifiedDividends', value)} />
            <MoneyField label="Long-term gains" value={inputs.income.longTermCapitalGains} onChange={(value) => updateIncome('longTermCapitalGains', value)} />
            <MoneyField label="Primary PIA / mo" value={inputs.socialSecurity.piaPrimary} onChange={(value) => updateSocialSecurity('piaPrimary', value)} />
            {married && <MoneyField label="Spouse PIA / mo" value={inputs.socialSecurity.piaSpouse} onChange={(value) => updateSocialSecurity('piaSpouse', value)} />}
            <NumberField label="Primary claim age" value={inputs.socialSecurity.claimAgePrimary} onChange={(value) => updateSocialSecurity('claimAgePrimary', value)} />
            {married && <NumberField label="Spouse claim age" value={inputs.socialSecurity.claimAgeSpouse} onChange={(value) => updateSocialSecurity('claimAgeSpouse', value)} />}
          </>
        )}

        {section === 'expenses' && (
          <>
            <MoneyField label="Property tax / yr" value={inputs.expenses.propertyTax} onChange={(value) => updateExpenses('propertyTax', value)} />
            <MoneyField label="Medical expenses / yr" value={inputs.expenses.medicalExpense} onChange={(value) => updateExpenses('medicalExpense', value)} />
            <MoneyField label="Other nondeductible expenses / yr" value={inputs.expenses.otherNondeductible} onChange={(value) => updateExpenses('otherNondeductible', value)} />
            <label className="flex min-h-10 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground sm:col-span-2">
              <Checkbox checked={inputs.expenses.caProp13PropertyTaxLimit} onCheckedChange={(checked) => updateExpenses('caProp13PropertyTaxLimit', checked === true)} />
              <span>Limit property tax growth under CA Prop 13</span>
            </label>
          </>
        )}

        {section === 'balances' && (
          <>
            <MoneyField label="Traditional primary" value={inputs.balances.traditionalPrimary} onChange={(value) => updateBalances('traditionalPrimary', value)} />
            {married && <MoneyField label="Traditional spouse" value={inputs.balances.traditionalSpouse} onChange={(value) => updateBalances('traditionalSpouse', value)} />}
            <MoneyField label="Roth primary" value={inputs.balances.rothPrimary} onChange={(value) => updateBalances('rothPrimary', value)} />
            {married && <MoneyField label="Roth spouse" value={inputs.balances.rothSpouse} onChange={(value) => updateBalances('rothSpouse', value)} />}
            <MoneyField label="Taxable brokerage" value={inputs.balances.taxableBrokerage} onChange={(value) => updateBalances('taxableBrokerage', value)} />
            <MoneyField label="Taxable basis" value={inputs.balances.taxableBasis} onChange={(value) => updateBalances('taxableBasis', value)} />
            <MoneyField label="HSA" value={inputs.balances.hsa} onChange={(value) => updateBalances('hsa', value)} />
            <MoneyField label="Cash" value={inputs.balances.cash} onChange={(value) => updateBalances('cash', value)} />
          </>
        )}

        {section === 'strategy' && (
          <>
            <SelectField
              label="Conversion mode"
              value={inputs.strategy.conversionMode}
              options={[
                { value: 'constant', label: 'Constant dollars' },
                { value: 'fill_bracket', label: 'Fill tax bracket' },
                { value: 'schedule', label: 'Per-year schedule' },
              ]}
              className="sm:col-span-2"
              onChange={(value) => updateStrategy('conversionMode', value as RothConversionStrategy['conversionMode'])}
            />
            <NumberField label="Conversion start age" value={inputs.strategy.conversionStartAge} onChange={(value) => updateStrategy('conversionStartAge', value)} />
            <NumberField label="Conversion end age" value={inputs.strategy.conversionEndAge} onChange={(value) => updateStrategy('conversionEndAge', value)} />
            <MoneyField label="Annual conversion" value={inputs.strategy.annualConversion} onChange={(value) => updateStrategy('annualConversion', value)} />
            <div className="grid gap-2">
              <SelectField
                label="Bracket target"
                value={String(inputs.strategy.bracketTarget)}
                options={[
                  { value: '12', label: '12%' },
                  { value: '22', label: '22%' },
                  { value: '24', label: '24%' },
                  { value: '32', label: '32%' },
                ]}
                onChange={(value) => updateStrategy('bracketTarget', Number(value) as RothConversionStrategy['bracketTarget'])}
              />
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
          </>
        )}

        {section === 'assumptions' && (
          <>
            <NumberField label="Pre-retirement growth" value={inputs.assumptions.preRetirementGrowthPercent} suffix="%" onChange={(value) => updateAssumption('preRetirementGrowthPercent', value)} />
            <NumberField label="Post-retirement growth" value={inputs.assumptions.postRetirementGrowthPercent} suffix="%" onChange={(value) => updateAssumption('postRetirementGrowthPercent', value)} />
            <NumberField label="Cash yield" value={inputs.assumptions.cashYieldPercent} suffix="%" onChange={(value) => updateAssumption('cashYieldPercent', value)} />
            <NumberField label="Inflation" value={inputs.assumptions.inflationPercent} suffix="%" onChange={(value) => updateAssumption('inflationPercent', value)} />
            <NumberField label="Flat state tax" value={inputs.assumptions.stateTaxPercent} suffix="%" onChange={(value) => updateAssumption('stateTaxPercent', value)} />
            <NumberField label="SS COLA" value={inputs.socialSecurity.colaPercent} suffix="%" onChange={(value) => updateSocialSecurity('colaPercent', value)} />
            <NumberField label="Discount rate" value={inputs.assumptions.discountRatePercent} suffix="%" onChange={(value) => updateAssumption('discountRatePercent', value)} />
            <MoneyField label="Prior-year MAGI" value={inputs.assumptions.priorYearMagi} onChange={(value) => updateAssumption('priorYearMagi', value)} />
            <MoneyField label="Two-years-prior MAGI" value={inputs.assumptions.twoYearsPriorMagi} onChange={(value) => updateAssumption('twoYearsPriorMagi', value)} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default function RothConversionForm({ inputs, onChange }: RothConversionFormProps): ReactElement {
  return (
    <div className="grid gap-4">
      {ROTH_CONVERSION_FORM_SECTIONS.map((section) => (
        <RothConversionFormSection key={section.id} section={section.id} inputs={inputs} onChange={onChange} />
      ))}
    </div>
  )
}
