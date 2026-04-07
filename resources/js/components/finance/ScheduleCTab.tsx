'use client'

import currency from 'currency.js'
import { useMemo, useState } from 'react'

import { Callout, FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import type { CategoryTotal, EntityData, YearData } from './ScheduleCPreview'
import { computeHomeOfficeCalcs } from './ScheduleCPreview'

interface ScheduleCTabProps {
  selectedYear: number
  scheduleCData: YearData[]
}

function sumCategories(cats: Record<string, CategoryTotal>): number {
  return Object.values(cats).reduce((sum, c) => sum.add(c.total), currency(0)).value
}

/** Mapping from home office tax_characteristic keys to Form 8829 line labels */
const HOME_OFFICE_LINE_MAP: Record<string, { line: string; label: string }> = {
  scho_mortgage_interest: { line: 'L.10', label: 'Mortgage interest' },
  scho_real_estate_taxes: { line: 'L.11', label: 'Real estate taxes' },
  scho_insurance: { line: 'L.18', label: 'Insurance' },
  scho_rent: { line: 'L.20', label: 'Rent' },
  scho_utilities: { line: 'L.21', label: 'Utilities' },
  scho_repairs_maintenance: { line: 'L.22', label: 'Repairs & maintenance' },
  scho_depreciation: { line: 'L.28', label: 'Depreciation' },
  scho_other: { line: 'L.35', label: 'Other home office expenses' },
}

interface Form8829Props {
  entity: EntityData
  entityKey: string
  yearData: YearData
  carryForward: number
  netIncome: number
}

function Form8829Preview({ entity, carryForward, netIncome }: Form8829Props) {
  const [officeSqft, setOfficeSqft] = useState<string>('')
  const [homeSqft, setHomeSqft] = useState<string>('')

  const officeSqftNum = parseFloat(officeSqft) || 0
  const homeSqftNum = parseFloat(homeSqft) || 0
  const businessPct = homeSqftNum > 0 ? (officeSqftNum / homeSqftNum) * 100 : 0

  const homeOfficeCategories = entity.schedule_c_home_office
  const homeOfficeTotal = sumCategories(homeOfficeCategories)

  // Build Form 8829 lines from tagged transactions
  const form8829Lines = useMemo(() => {
    const lines: { lineRef: string; label: string; fullAmount: number; allowable: number }[] = []

    for (const [key, cat] of Object.entries(homeOfficeCategories)) {
      const mapping = HOME_OFFICE_LINE_MAP[key]
      const lineRef = mapping?.line ?? ''
      const label = mapping?.label ?? cat.label
      const fullAmount = cat.total
      const allowable = businessPct > 0 ? currency(fullAmount).multiply(businessPct).divide(100).value : fullAmount

      lines.push({ lineRef, label, fullAmount, allowable })
    }

    return lines
  }, [homeOfficeCategories, businessPct])

  const totalAllowable = businessPct > 0
    ? form8829Lines.reduce((sum, l) => sum.add(l.allowable), currency(0)).value
    : homeOfficeTotal

  // Income limitation: home office deduction cannot exceed net income
  const totalClaimable = currency(totalAllowable).add(carryForward).value
  const limit = Math.max(0, netIncome)
  const actualDeduction = Math.min(totalClaimable, limit)
  const disallowed = currency(totalClaimable).subtract(actualDeduction).value

  // Simplified method: $5/sqft, max 300 sqft ($1,500)
  const simplifiedDeduction = Math.min(officeSqftNum * 5, 1500)
  const regularBetter = actualDeduction > simplifiedDeduction
  const difference = Math.abs(currency(actualDeduction).subtract(simplifiedDeduction).value)

  const hasAreaInputs = officeSqftNum > 0 && homeSqftNum > 0

  return (
    <div className="space-y-4">
      <FormBlock title="Form 8829 — Home Office Deduction">
        {/* Area inputs */}
        <div className="px-3 py-2 space-y-2">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label htmlFor="office-sqft" className="text-xs text-muted-foreground">L.1 Office area (sq ft)</Label>
              <Input
                id="office-sqft"
                type="number"
                min="0"
                value={officeSqft}
                onChange={(e) => setOfficeSqft(e.target.value)}
                className="h-8 text-sm"
                placeholder="e.g. 150"
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="home-sqft" className="text-xs text-muted-foreground">L.2 Home total area (sq ft)</Label>
              <Input
                id="home-sqft"
                type="number"
                min="0"
                value={homeSqft}
                onChange={(e) => setHomeSqft(e.target.value)}
                className="h-8 text-sm"
                placeholder="e.g. 1200"
              />
            </div>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">L.3 Business-use %</div>
              <div className="font-mono text-sm font-semibold">
                {hasAreaInputs ? `${businessPct.toFixed(2)}%` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Expense lines */}
        {form8829Lines.map((line, i) => (
          <FormLine
            key={i}
            boxRef={line.lineRef}
            label={
              <span>
                {line.label}
                {hasAreaInputs && (
                  <span className="text-muted-foreground text-[11px] ml-2">
                    (full: {currency(line.fullAmount).format()} × {businessPct.toFixed(1)}%)
                  </span>
                )}
              </span>
            }
            value={hasAreaInputs ? line.allowable : line.fullAmount}
          />
        ))}

        {carryForward > 0 && (
          <FormLine boxRef="" label="Prior year carry-forward" value={carryForward} />
        )}

        <FormTotalLine label="L.36 Allowable home office deduction" value={actualDeduction} double />

        {disallowed > 0 && (
          <FormLine
            boxRef=""
            label="Disallowed (carries forward to next year)"
            value={disallowed}
          />
        )}
      </FormBlock>

      {officeSqftNum > 0 && (
        <Callout kind="info" title="Simplified Method Comparison">
          <div className="space-y-1">
            <p>Simplified: $5 × {officeSqftNum} sq ft = {currency(simplifiedDeduction).format()}{officeSqftNum > 300 ? ' (capped at $1,500)' : ''}</p>
            <p>Regular: actual expenses{hasAreaInputs ? ` × ${businessPct.toFixed(1)}%` : ''} = {currency(actualDeduction).format()}</p>
            <p className="font-semibold">
              → {regularBetter ? 'Regular method' : 'Simplified method'} saves {currency(difference).format()}
            </p>
          </div>
        </Callout>
      )}
    </div>
  )
}

export default function ScheduleCTab({ selectedYear, scheduleCData }: ScheduleCTabProps) {
  // Filter to selected year
  const yearData = useMemo(() => {
    return scheduleCData.filter((yd) => Number(yd.year) === selectedYear)
  }, [scheduleCData, selectedYear])

  // Compute home-office carry-forward per entity across all years (reuses shared pure function)
  const homeOfficeCalcs = useMemo(() => computeHomeOfficeCalcs(scheduleCData), [scheduleCData])

  if (yearData.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground border rounded-md">
        <p className="mb-2 font-medium">No Schedule C data found for {selectedYear}.</p>
        <p className="text-sm">
          Tag your transactions with tax characteristics to see data here.{' '}
          <a href="/finance/tags" className="text-blue-600 hover:underline">Manage Tags</a>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {yearData.map((yd) => (
        <div key={yd.year}>
          {yd.entities
            .filter((entity) =>
              Object.keys(entity.schedule_c_income ?? {}).length > 0 ||
              Object.keys(entity.schedule_c_expense).length > 0 ||
              Object.keys(entity.schedule_c_home_office).length > 0,
            )
            .map((entity, idx) => {
              const entityKey = String(entity.entity_id ?? 'unassigned')
              const mapKey = `${yd.year}-${entityKey}`
              const calc = homeOfficeCalcs.get(mapKey)
              const hasHomeOffice = Object.keys(entity.schedule_c_home_office).length > 0
              const incomeTotal = sumCategories(entity.schedule_c_income ?? {})
              const expenseTotal = sumCategories(entity.schedule_c_expense)
              const netIncome = currency(incomeTotal).subtract(expenseTotal).value

              return (
                <div key={entity.entity_id ?? `unassigned-${idx}`} className="space-y-4">
                  {(yd.entities.length > 1 || entity.entity_name) && (
                    <h3 className="text-lg font-semibold border-l-4 border-primary pl-3">
                      {entity.entity_name ?? 'Unassigned (No Business Entity)'}
                    </h3>
                  )}

                  {/* Schedule C Income */}
                  <FormBlock title="Schedule C — Gross Income">
                    {Object.entries(entity.schedule_c_income ?? {}).map(([key, cat]) => (
                      <FormLine key={key} label={cat.label} value={cat.total} />
                    ))}
                    {Object.keys(entity.schedule_c_income ?? {}).length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No income transactions tagged</div>
                    )}
                    <FormTotalLine label="Total Income" value={incomeTotal} />
                  </FormBlock>

                  {/* Schedule C Expenses */}
                  <FormBlock title="Schedule C — Expenses">
                    {Object.entries(entity.schedule_c_expense).map(([key, cat]) => (
                      <FormLine key={key} label={cat.label} value={cat.total} />
                    ))}
                    {Object.keys(entity.schedule_c_expense).length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No expense transactions tagged</div>
                    )}
                    <FormTotalLine label="Total Expenses" value={expenseTotal} />
                  </FormBlock>

                  {/* Net Schedule C */}
                  <FormBlock title="Schedule C — Net Profit (Loss)">
                    <FormLine label="Gross income" value={incomeTotal} />
                    <FormLine label="Less: total expenses" value={-expenseTotal} />
                    {calc && calc.allowable > 0 && (
                      <FormLine label="Less: home office deduction (Form 8829)" value={-calc.allowable} />
                    )}
                    <FormTotalLine
                      label="Net profit (loss) — flows to Form 1040 Line 8"
                      value={currency(netIncome).subtract(calc?.allowable ?? 0).value}
                      double
                    />
                  </FormBlock>

                  {/* Form 8829 — Home Office */}
                  {(hasHomeOffice || (calc && calc.priorCarryForward > 0)) && (
                    <Form8829Preview
                      entity={entity}
                      entityKey={entityKey}
                      yearData={yd}
                      carryForward={calc?.priorCarryForward ?? 0}
                      netIncome={netIncome}
                    />
                  )}
                </div>
              )
            })}
        </div>
      ))}
    </div>
  )
}
