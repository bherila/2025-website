'use client'

import currency from 'currency.js'
import { Loader2, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'

import { FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { fetchWrapper } from '@/fetchWrapper'
import type { Form8829EntityFact, TaxFactSource } from '@/types/generated/tax-preview-facts'

import TaxLineAdjustmentPopover from './TaxLineAdjustmentPopover'

const form8829InputSchema = z.object({
  method: z.enum(['regular', 'simplified']),
  office_sqft: z.string(),
  home_sqft: z.string(),
  months_used: z.string(),
  prior_year_op_carryover: z.string(),
  prior_year_op_carryover_ca: z.string(),
  prior_year_depreciation_carryover: z.string(),
  prior_year_depreciation_carryover_ca: z.string(),
  notes: z.string(),
})

type Form8829InputForm = z.infer<typeof form8829InputSchema>

interface Form8829InputsFormProps {
  taxYear: number
  entityId: number
  entityName: string
  facts?: Form8829EntityFact | null
  onSaved?: (() => Promise<void> | void) | undefined
}

function numberString(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

function moneyString(value: number | null | undefined): string {
  return value === null || value === undefined ? '0' : String(value)
}

function followUpSources(sources: TaxFactSource[] | undefined): TaxFactSource[] {
  return (sources ?? []).filter((source) => source.sourceType === 'user_follow_up_flag')
}

function lineControl(taxYear: number, entityId: number, lineRef: string, onSaved?: (() => Promise<void> | void) | undefined) {
  return (
    <TaxLineAdjustmentPopover
      taxYear={taxYear}
      form="form_8829"
      lineRef={lineRef}
      entityId={entityId}
      onSaved={onSaved}
    />
  )
}

export default function Form8829InputsForm({
  taxYear,
  entityId,
  entityName,
  facts,
  onSaved,
}: Form8829InputsFormProps) {
  const [form, setForm] = useState<Form8829InputForm>({
    method: facts?.method === 'simplified' ? 'simplified' : 'regular',
    office_sqft: numberString(facts?.officeSqft),
    home_sqft: numberString(facts?.homeSqft),
    months_used: String(facts?.monthsUsed ?? 12),
    prior_year_op_carryover: moneyString(facts?.priorYearOpCarryover),
    prior_year_op_carryover_ca: moneyString(facts?.priorYearOpCarryoverCa),
    prior_year_depreciation_carryover: moneyString(facts?.priorYearDepreciationCarryover),
    prior_year_depreciation_carryover_ca: moneyString(facts?.priorYearDepreciationCarryoverCa),
    notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const row = await fetchWrapper.get(`/api/finance/form-8829?entity_id=${entityId}&year=${taxYear}`)
        if (!cancelled) {
          setForm({
            method: row.method === 'simplified' ? 'simplified' : 'regular',
            office_sqft: numberString(row.office_sqft),
            home_sqft: numberString(row.home_sqft),
            months_used: String(row.months_used ?? 12),
            prior_year_op_carryover: moneyString(row.prior_year_op_carryover),
            prior_year_op_carryover_ca: moneyString(row.prior_year_op_carryover_ca),
            prior_year_depreciation_carryover: moneyString(row.prior_year_depreciation_carryover),
            prior_year_depreciation_carryover_ca: moneyString(row.prior_year_depreciation_carryover_ca),
            notes: row.notes ?? '',
          })
        }
      } catch (err) {
        if (!cancelled) setError(typeof err === 'string' ? err : 'Failed to load Form 8829 inputs.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [entityId, taxYear])

  const businessUseText = useMemo(() => {
    if (!facts) return '—'
    return `${facts.businessUsePercentage.toFixed(2)}%`
  }, [facts])

  const save = async () => {
    const parsed = form8829InputSchema.safeParse(form)
    if (!parsed.success) {
      setError('Check the Form 8829 fields.')
      return
    }

    const monthsUsed = Number(parsed.data.months_used)
    if (!Number.isFinite(monthsUsed) || monthsUsed < 1 || monthsUsed > 12) {
      setError('Months used must be between 1 and 12.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await fetchWrapper.put('/api/finance/form-8829', {
        entity_id: entityId,
        tax_year: taxYear,
        method: parsed.data.method,
        office_sqft: parsed.data.office_sqft === '' ? null : Number(parsed.data.office_sqft),
        home_sqft: parsed.data.home_sqft === '' ? null : Number(parsed.data.home_sqft),
        months_used: monthsUsed,
        prior_year_op_carryover: Number(parsed.data.prior_year_op_carryover || 0),
        prior_year_op_carryover_ca: Number(parsed.data.prior_year_op_carryover_ca || 0),
        prior_year_depreciation_carryover: Number(parsed.data.prior_year_depreciation_carryover || 0),
        prior_year_depreciation_carryover_ca: Number(parsed.data.prior_year_depreciation_carryover_ca || 0),
        notes: parsed.data.notes.trim() || null,
      })
      await onSaved?.()
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Failed to save Form 8829 inputs.')
    } finally {
      setSaving(false)
    }
  }

  const followUps = followUpSources(facts?.line36Sources).length + followUpSources(facts?.line43Sources).length

  return (
    <div className="space-y-4">
      <FormBlock title="Form 8829 — Home Office Inputs">
        <div className="space-y-4 px-3 py-3">
          {error && <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`f8829-method-${entityId}`}>Method</Label>
                  <Select
                    value={form.method}
                    onValueChange={(method) => setForm((current) => ({ ...current, method: method as Form8829InputForm['method'] }))}
                  >
                    <SelectTrigger id={`f8829-method-${entityId}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">Regular</SelectItem>
                      <SelectItem value="simplified">Simplified</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`f8829-office-${entityId}`}>Office sqft</Label>
                  <Input id={`f8829-office-${entityId}`} type="number" min="0" step="0.01" value={form.office_sqft} onChange={(event) => setForm((current) => ({ ...current, office_sqft: event.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`f8829-home-${entityId}`}>Home sqft</Label>
                  <Input id={`f8829-home-${entityId}`} type="number" min="0" step="0.01" value={form.home_sqft} onChange={(event) => setForm((current) => ({ ...current, home_sqft: event.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`f8829-months-${entityId}`}>Months</Label>
                  <Input id={`f8829-months-${entityId}`} type="number" min="1" max="12" value={form.months_used} onChange={(event) => setForm((current) => ({ ...current, months_used: event.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`f8829-op-cf-${entityId}`}>Federal op carryover</Label>
                  <Input id={`f8829-op-cf-${entityId}`} type="number" min="0" step="0.01" value={form.prior_year_op_carryover} onChange={(event) => setForm((current) => ({ ...current, prior_year_op_carryover: event.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`f8829-op-ca-${entityId}`}>CA op carryover</Label>
                  <Input id={`f8829-op-ca-${entityId}`} type="number" min="0" step="0.01" value={form.prior_year_op_carryover_ca} onChange={(event) => setForm((current) => ({ ...current, prior_year_op_carryover_ca: event.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`f8829-dep-cf-${entityId}`}>Federal dep carryover</Label>
                  <Input id={`f8829-dep-cf-${entityId}`} type="number" min="0" step="0.01" value={form.prior_year_depreciation_carryover} onChange={(event) => setForm((current) => ({ ...current, prior_year_depreciation_carryover: event.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`f8829-dep-ca-${entityId}`}>CA dep carryover</Label>
                  <Input id={`f8829-dep-ca-${entityId}`} type="number" min="0" step="0.01" value={form.prior_year_depreciation_carryover_ca} onChange={(event) => setForm((current) => ({ ...current, prior_year_depreciation_carryover_ca: event.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`f8829-notes-${entityId}`}>Notes</Label>
                <Textarea id={`f8829-notes-${entityId}`} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  Business use {businessUseText}
                  {followUps > 0 && <span className="ml-2 text-warning">{followUps} follow-up{followUps === 1 ? '' : 's'}</span>}
                </div>
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save
                </Button>
              </div>
            </>
          )}
        </div>
      </FormBlock>

      {facts && (
        <FormBlock title={`${entityName} — Form 8829`}>
          <FormLine boxRef="1" label="Office area" raw={facts.line1OfficeSqft ? `${facts.line1OfficeSqft.toLocaleString()} sq ft` : '—'} />
          <FormLine boxRef="2" label="Total home area" raw={facts.line2HomeSqft ? `${facts.line2HomeSqft.toLocaleString()} sq ft` : '—'} />
          <FormLine boxRef="7" label="Business-use percentage" raw={businessUseText} />
          <FormLine boxRef="8" label="Tentative profit before home office" value={facts.line8TentativeProfit} />
          {facts.homeOfficeLines.map((line, index) => (
            <FormLine
              key={`${line.lineRef}-${index}`}
              boxRef={line.lineRef}
              label={(
                <span className="inline-flex items-center gap-1">
                  {line.label} ({currency(line.indirectExpense).format()} indirect)
                  {lineControl(taxYear, entityId, `line_${line.lineRef}`, onSaved)}
                </span>
              )}
              value={line.allowable}
            />
          ))}
          <FormLine boxRef="24" label="Total indirect expenses" value={facts.line24IndirectExpensesTotal} />
          <FormLine
            boxRef="25"
            label={<span className="inline-flex items-center gap-1">Allowable indirect expenses {lineControl(taxYear, entityId, 'line_25', onSaved)}</span>}
            value={facts.line25AllowableIndirectExpenses}
          />
          <FormLine boxRef="26" label="Prior-year operating carryover" value={facts.line26PriorYearOpCarryover} />
          <FormLine boxRef="27" label="Allowable operating expenses" value={facts.line27AllowableOperatingExpenses} />
          <FormTotalLine
            boxRef="36"
            label="Allowable home office deduction"
            value={facts.line36AllowableHomeOfficeDeduction}
          />
          <div className="flex items-center justify-end px-3 py-1">
            {lineControl(taxYear, entityId, 'line_36', onSaved)}
          </div>
          <FormLine boxRef="42" label="Depreciation carryover" value={facts.line42DepreciationCarryover} />
          <FormTotalLine boxRef="43" label="Carryover to next year" value={facts.line43CarryoverToNextYear} />
          <div className="flex items-center justify-end px-3 py-1">
            {lineControl(taxYear, entityId, 'line_43', onSaved)}
          </div>
          <FormLine boxRef="CA" label="CA carryover to next year" value={facts.line43CarryoverToNextYearCa} />
        </FormBlock>
      )}
    </div>
  )
}
