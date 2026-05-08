'use client'

import currency from 'currency.js'
import { CalendarDays, Pencil } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Callout, FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import { Button } from '@/components/ui/button'
import { fetchWrapper } from '@/fetchWrapper'
import { getDocAmounts, getPayerName } from '@/lib/finance/taxDocumentUtils'
import type { TaxDocument } from '@/types/finance/tax-document'
import { FORM_TYPE_LABELS } from '@/types/finance/tax-document'
import type { Form8829Facts, ScheduleCFacts } from '@/types/generated/tax-preview-facts'

import EmploymentEntityEditDialog, {
  type EmploymentEntity,
  type EmploymentEntityFormData,
  emptyEmploymentEntityForm,
} from './config/EmploymentEntityEditDialog'
import EmploymentEntityYearDialog from './config/EmploymentEntityYearDialog'
import Form8829InputsForm from './Form8829InputsForm'
import type { CategoryTotal, YearData } from './ScheduleCPreview'
import TaxLineAdjustmentPopover from './TaxLineAdjustmentPopover'

interface ScheduleCTabProps {
  selectedYear: number
  scheduleCData: YearData[]
  reviewed1099Docs?: TaxDocument[]
  taxFacts?: ScheduleCFacts | null
  form8829Facts?: Form8829Facts | null
  onRefresh?: (() => Promise<void>) | undefined
}

function sumCategories(cats: Record<string, CategoryTotal>): number {
  return Object.values(cats).reduce((sum, c) => sum.add(c.total), currency(0)).value
}

function formatDate(dateStr: string): string {
  return dateStr.split(/[ T]/)[0] ?? dateStr
}

function adjustmentControl(taxYear: number, entityId: number | null, lineRef: string, onRefresh?: (() => Promise<void>) | undefined) {
  return (
    <TaxLineAdjustmentPopover
      taxYear={taxYear}
      form="schedule_c"
      lineRef={lineRef}
      entityId={entityId}
      onSaved={onRefresh}
    />
  )
}

export default function ScheduleCTab({ selectedYear, scheduleCData, reviewed1099Docs = [], taxFacts = null, form8829Facts = null, onRefresh }: ScheduleCTabProps) {
  const [editingEntity, setEditingEntity] = useState<EmploymentEntity | null>(null)
  const [entityForm, setEntityForm] = useState<EmploymentEntityFormData>(emptyEmploymentEntityForm)
  const [entityFormOpen, setEntityFormOpen] = useState(false)
  const [entityFormError, setEntityFormError] = useState<string | null>(null)
  const [savingEntity, setSavingEntity] = useState(false)
  const [yearDialogEntity, setYearDialogEntity] = useState<{ id: number; name: string } | null>(null)
  // Filter to selected year
  const yearData = useMemo(() => {
    return scheduleCData.filter((yd) => Number(yd.year) === selectedYear)
  }, [scheduleCData, selectedYear])

  const backendEntityFacts = useMemo(() => {
    return new Map((taxFacts?.entities ?? []).map((entity) => [String(entity.entityId ?? 'unassigned'), entity]))
  }, [taxFacts])
  const form8829EntityFacts = useMemo(() => {
    return new Map((form8829Facts?.entities ?? []).map((entity) => [String(entity.entityId ?? 'unassigned'), entity]))
  }, [form8829Facts])

  const openBusinessEditor = async (entityId: number) => {
    setEntityFormError(null)
    try {
      const entities = await fetchWrapper.get('/api/finance/employment-entities')
      const entity = Array.isArray(entities)
        ? entities.find((candidate) => Number(candidate.id) === entityId)
        : null
      if (!entity) {
        setEntityFormError('Business entity was not found.')
        return
      }

      setEditingEntity(entity)
      setEntityForm({
        display_name: entity.display_name,
        type: entity.type,
        start_date: formatDate(entity.start_date),
        is_current: entity.is_current,
        end_date: entity.end_date ? formatDate(entity.end_date) : '',
        ein: entity.ein ?? '',
        address: entity.address ?? '',
        sic_code: entity.sic_code != null ? String(entity.sic_code) : '',
        is_spouse: entity.is_spouse,
        is_hidden: entity.is_hidden,
      })
      setEntityFormOpen(true)
    } catch (err) {
      setEntityFormError(typeof err === 'string' ? err : 'Failed to load business entity.')
    }
  }

  const closeBusinessEditor = () => {
    setEntityFormOpen(false)
    setEditingEntity(null)
    setEntityFormError(null)
  }

  const saveBusinessEntity = async () => {
    if (!editingEntity) return
    if (!entityForm.display_name.trim()) {
      setEntityFormError('Display name is required.')
      return
    }
    if (!entityForm.start_date) {
      setEntityFormError('Start date is required.')
      return
    }

    setSavingEntity(true)
    setEntityFormError(null)
    try {
      await fetchWrapper.put(`/api/finance/employment-entities/${editingEntity.id}`, {
        display_name: entityForm.display_name.trim(),
        type: entityForm.type,
        start_date: entityForm.start_date,
        is_current: entityForm.is_current,
        end_date: entityForm.is_current ? null : entityForm.end_date || null,
        ein: entityForm.ein.trim() || null,
        address: entityForm.address.trim() || null,
        sic_code: entityForm.type === 'sch_c' && entityForm.sic_code ? Number(entityForm.sic_code) : null,
        is_spouse: entityForm.is_spouse,
        is_hidden: entityForm.is_hidden,
      })
      closeBusinessEditor()
      await onRefresh?.()
    } catch (err) {
      setEntityFormError(typeof err === 'string' ? err : 'Failed to save business entity.')
    } finally {
      setSavingEntity(false)
    }
  }

  const scheduleCDocumentRows = useMemo(() => {
    const rows: Array<{ key: string; label: string; amount: number }> = []

    for (const doc of reviewed1099Docs) {
      const links = doc.account_links ?? []

      if (links.length > 0) {
        for (const link of links) {
          const schCAmount = getDocAmounts(doc, link).schC
          if (schCAmount === null) {
            continue
          }

          const formLabel = FORM_TYPE_LABELS[link.form_type] ?? link.form_type
          const payerLabel = getPayerName(doc, link) ?? link.account?.acct_name ?? doc.original_filename ?? formLabel
          rows.push({
            key: `link-${link.id}`,
            label: `${payerLabel} — ${formLabel}`,
            amount: schCAmount,
          })
        }

        continue
      }

      const schCAmount = getDocAmounts(doc).schC
      if (schCAmount === null) {
        continue
      }

      const formLabel = FORM_TYPE_LABELS[doc.form_type] ?? doc.form_type
      const payerLabel = getPayerName(doc) ?? doc.account?.acct_name ?? doc.original_filename ?? formLabel
      rows.push({
        key: `doc-${doc.id}`,
        label: `${payerLabel} — ${formLabel}`,
        amount: schCAmount,
      })
    }

    return rows
  }, [reviewed1099Docs])

  const scheduleCDocumentTotal = useMemo(
    () => scheduleCDocumentRows.reduce((sum, row) => sum.add(row.amount), currency(0)).value,
    [scheduleCDocumentRows],
  )

  if (yearData.length === 0 && scheduleCDocumentRows.length === 0) {
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
      {scheduleCDocumentRows.length > 0 && (
        <FormBlock title="Schedule C — Tax Document Income">
          {scheduleCDocumentRows.map((row) => (
            <FormLine key={row.key} label={row.label} value={row.amount} />
          ))}
          <FormTotalLine label="Total 1099 income routed to Schedule C" value={scheduleCDocumentTotal} />
        </FormBlock>
      )}
      {scheduleCDocumentTotal > 0 && yearData.length > 0 && (
        <Callout kind="info" title="Reconcile 1099 gross receipts">
          1099 gross receipts ({currency(scheduleCDocumentTotal).format()}) should reconcile with transaction-based gross receipts below.
        </Callout>
      )}
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
              const backendEntity = backendEntityFacts.get(entityKey)
              const form8829Entity = form8829EntityFacts.get(entityKey)
              const entityId = entity.entity_id ?? null
              const incomeTotal = sumCategories(entity.schedule_c_income ?? {})
              const expenseTotal = sumCategories(entity.schedule_c_expense)
              const grossReceipts = backendEntity?.grossReceipts ?? incomeTotal
              const returnsAndAllowances = backendEntity?.returnsAndAllowances ?? Math.abs(entity.schedule_c_income?.business_returns?.total ?? 0)
              const grossIncomeAfterReturns = backendEntity?.grossIncomeAfterReturns ?? currency(grossReceipts).subtract(returnsAndAllowances).value
              const expensesBeforeHomeOffice = backendEntity?.expensesBeforeHomeOffice ?? expenseTotal
              const tentativeProfitBeforeHomeOffice = backendEntity?.tentativeProfitBeforeHomeOffice ?? currency(grossIncomeAfterReturns).subtract(expensesBeforeHomeOffice).value
              const homeOfficeAllowable = backendEntity?.homeOfficeAllowable ?? form8829Entity?.line36AllowableHomeOfficeDeduction ?? 0
              const homeOfficeCarryoverToNextYear = backendEntity?.homeOfficeCarryoverToNextYear ?? form8829Entity?.carryoverToNextYear ?? 0
              const netProfit = backendEntity?.netProfit ?? currency(tentativeProfitBeforeHomeOffice).subtract(homeOfficeAllowable).value

              return (
                <div key={entity.entity_id ?? `unassigned-${idx}`} className="space-y-4">
                  {(yd.entities.length > 1 || entity.entity_name) && (
                    <div className="flex flex-col gap-2 border-l-4 border-primary pl-3 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-lg font-semibold">
                        {entity.entity_name ?? 'Unassigned (No Business Entity)'}
                      </h3>
                      {entityId !== null && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => void openBusinessEditor(entityId)}>
                            <Pencil className="mr-1.5 h-3.5 w-3.5" />
                            Business
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setYearDialogEntity({ id: entityId, name: entity.entity_name ?? 'Schedule C business' })}>
                            <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                            Year
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Schedule C Income */}
                  <FormBlock title="Schedule C — Gross Income">
                    {Object.entries(entity.schedule_c_income ?? {})
                      .filter(([key]) => key !== 'business_returns')
                      .map(([key, cat]) => (
                        <FormLine key={key} label={cat.label} value={cat.total} />
                      ))}
                    {Object.keys(entity.schedule_c_income ?? {}).length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No income transactions tagged</div>
                    )}
                    <FormTotalLine
                      boxRef="1"
                      label="Gross receipts or sales"
                      value={grossReceipts}
                    />
                    <div className="flex items-center justify-end px-3 py-1">
                      {adjustmentControl(selectedYear, entityId, 'line_1', onRefresh)}
                    </div>
                    <FormLine
                      boxRef="2"
                      label={<span className="inline-flex items-center gap-1">Returns and allowances {adjustmentControl(selectedYear, entityId, 'line_2', onRefresh)}</span>}
                      value={returnsAndAllowances}
                    />
                    <FormTotalLine boxRef="3" label="Gross income" value={grossIncomeAfterReturns} />
                  </FormBlock>

                  {/* Schedule C Expenses */}
                  <FormBlock title="Schedule C — Expenses">
                    {Object.entries(entity.schedule_c_expense).map(([key, cat]) => (
                      <FormLine key={key} label={cat.label} value={cat.total} />
                    ))}
                    {Object.keys(entity.schedule_c_expense).length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No expense transactions tagged</div>
                    )}
                    <FormTotalLine boxRef="28" label="Total expenses before home office" value={expensesBeforeHomeOffice} />
                    <div className="flex items-center justify-end px-3 py-1">
                      {adjustmentControl(selectedYear, entityId, 'line_28', onRefresh)}
                    </div>
                  </FormBlock>

                  {/* Net Schedule C */}
                  <FormBlock title="Schedule C — Net Profit (Loss)">
                    <FormLine boxRef="29" label={<span className="inline-flex items-center gap-1">Tentative profit before home office {adjustmentControl(selectedYear, entityId, 'line_29', onRefresh)}</span>} value={tentativeProfitBeforeHomeOffice} />
                    <FormLine boxRef="30" label={<span className="inline-flex items-center gap-1">Home office deduction (Form 8829) {adjustmentControl(selectedYear, entityId, 'line_30', onRefresh)}</span>} value={homeOfficeAllowable === 0 ? 0 : -homeOfficeAllowable} />
                    {homeOfficeCarryoverToNextYear > 0 && (
                      <FormLine label="Home office carryover to next year" value={homeOfficeCarryoverToNextYear} />
                    )}
                    <FormTotalLine
                      boxRef="31"
                      label="Net profit (loss)"
                      value={netProfit}
                      double
                    />
                    <div className="flex items-center justify-end px-3 py-1">
                      {adjustmentControl(selectedYear, entityId, 'line_31', onRefresh)}
                    </div>
                  </FormBlock>

                  {backendEntity && (backendEntity.flaggedExpenseRows ?? []).length > 0 && (
                    <Callout kind="warn" title="Review positive expense-tagged rows">
                      <div className="space-y-1">
                        {(backendEntity.flaggedExpenseRows ?? []).map((row) => (
                          <div key={row.transactionId} className="flex justify-between gap-3 text-xs">
                            <span>{row.date} · {row.label} · {row.description ?? 'Transaction'}</span>
                            <span className="font-mono">{currency(row.amount).format()}</span>
                          </div>
                        ))}
                      </div>
                    </Callout>
                  )}

                  {entityId !== null && (
                    <Form8829InputsForm
                      taxYear={selectedYear}
                      entityId={entityId}
                      entityName={entity.entity_name ?? 'Schedule C business'}
                      facts={form8829Entity ?? null}
                      onSaved={onRefresh}
                    />
                  )}
                </div>
              )
            })}
        </div>
      ))}
      <EmploymentEntityEditDialog
        open={entityFormOpen}
        editingEntity={editingEntity}
        form={entityForm}
        formError={entityFormError}
        saving={savingEntity}
        onClose={closeBusinessEditor}
        onFormChange={setEntityForm}
        onSave={saveBusinessEntity}
      />
      {yearDialogEntity && (
        <EmploymentEntityYearDialog
          open
          entityId={yearDialogEntity.id}
          entityName={yearDialogEntity.name}
          taxYear={selectedYear}
          onClose={() => setYearDialogEntity(null)}
          onSaved={onRefresh}
        />
      )}
    </div>
  )
}
