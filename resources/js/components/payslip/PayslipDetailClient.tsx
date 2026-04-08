import { zodResolver } from '@hookform/resolvers/zod'
import currency from 'currency.js'
import { Code, Loader2, Plus, Trash2 } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { type SubmitHandler, useForm } from 'react-hook-form'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  BreadcrumbItem,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { fetchWrapper } from '@/fetchWrapper'
import { deletePayslip, savePayslip } from '@/lib/api'
import { parseDate } from '@/lib/DateHelper'

import FinanceNavbar from '../finance/FinanceNavbar'
import type { fin_payslip, fin_payslip_deposit, fin_payslip_state_data } from './payslipDbCols'
import { fin_payslip_schema } from './payslipDbCols'
import PayslipJsonModal from './PayslipJsonModal'

// ─── Section block ────────────────────────────────────────────────────────────

function FormSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="border border-border rounded-sm bg-card">
      <div className="px-4 py-2.5 border-b border-border">
        <h3 className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary">{title}</h3>
      </div>
      <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">{children}</div>
    </div>
  )
}

// ─── Numeric field ────────────────────────────────────────────────────────────

function NumericField({ label, field, control }: { label: string; field: string; control: any }) {
  return (
    <FormField
      control={control}
      name={field as any}
      render={({ field: inputField }) => (
        <FormItem className="space-y-1">
          <FormLabel className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {label}
          </FormLabel>
          <FormControl>
            <Input
              type="number"
              step="0.01"
              {...inputField}
              value={inputField.value ?? ''}
              onChange={(e) => {
                const value = e.target.value === '' ? null : parseFloat(e.target.value)
                inputField.onChange(isNaN(value!) ? null : value)
              }}
              className="font-mono text-xs h-8"
            />
          </FormControl>
          <FormMessage className="text-[10px]" />
        </FormItem>
      )}
    />
  )
}

// ─── State data sub-component ─────────────────────────────────────────────────

interface NewStateDataRow {
  state_code?: string
  taxable_wages?: number
  state_tax?: number
  state_tax_addl?: number
  state_disability?: number
}

function StateDataSection({ payslipId }: { payslipId: number }) {
  const [rows, setRows] = useState<fin_payslip_state_data[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [newRow, setNewRow] = useState<NewStateDataRow>({ state_code: 'CA' })

  const load = useCallback(async () => {
    try {
      const data = (await fetchWrapper.get(`/api/payslips/${payslipId}/state-data`)) as fin_payslip_state_data[]
      setRows(data)
    } catch {
      // non-critical
    }
  }, [payslipId])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async () => {
    try {
      await fetchWrapper.post(`/api/payslips/${payslipId}/state-data`, newRow)
      setIsAdding(false)
      setNewRow({ state_code: 'CA' })
      load()
    } catch {
      // ignore
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await fetchWrapper.delete(`/api/payslips/${payslipId}/state-data/${id}`, undefined)
      load()
    } catch {
      // ignore
    }
  }

  return (
    <div className="border border-border rounded-sm bg-card">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <h3 className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary">State Tax Data</h3>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 gap-1" onClick={() => setIsAdding(true)}>
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      <div className="p-4 space-y-2">
        {rows.length === 0 && !isAdding && (
          <p className="font-mono text-[10px] text-muted-foreground">No state tax data recorded.</p>
        )}
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-5 gap-2 items-center font-mono text-xs">
            <span className="text-muted-foreground col-span-1">{row.state_code}</span>
            <span>{row.taxable_wages ? `Wages: ${row.taxable_wages}` : '—'}</span>
            <span>{row.state_tax ? `Tax: ${row.state_tax}` : '—'}</span>
            <span>{row.state_disability ? `SDI: ${row.state_disability}` : '—'}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-destructive"
              onClick={() => row.id && handleDelete(row.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
        {isAdding && (
          <div className="grid grid-cols-5 gap-2 items-end">
            <Input
              className="h-7 font-mono text-xs"
              placeholder="CA"
              maxLength={2}
              value={newRow.state_code ?? ''}
              onChange={(e) => setNewRow((p) => ({ ...p, state_code: e.target.value.toUpperCase() }))}
            />
            <Input
              type="number"
              className="h-7 font-mono text-xs"
              placeholder="Taxable wages"
              value={newRow.taxable_wages ?? ''}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                setNewRow((p) => ({ ...p, taxable_wages: isNaN(v) ? undefined : v } as NewStateDataRow))
              }}
            />
            <Input
              type="number"
              className="h-7 font-mono text-xs"
              placeholder="State tax"
              value={newRow.state_tax ?? ''}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                setNewRow((p) => ({ ...p, state_tax: isNaN(v) ? undefined : v } as NewStateDataRow))
              }}
            />
            <Input
              type="number"
              className="h-7 font-mono text-xs"
              placeholder="SDI"
              value={newRow.state_disability ?? ''}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                setNewRow((p) => ({ ...p, state_disability: isNaN(v) ? undefined : v } as NewStateDataRow))
              }}
            />
            <div className="flex gap-1">
              <Button type="button" size="sm" className="h-7 px-2" onClick={handleSave}>
                Save
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Deposits sub-component ───────────────────────────────────────────────────

interface NewDepositRow {
  bank_name?: string
  account_last4?: string
  amount?: number
}

function DepositsSection({ payslipId, netPay }: { payslipId: number; netPay?: number }) {
  const [rows, setRows] = useState<fin_payslip_deposit[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [newRow, setNewRow] = useState<NewDepositRow>({})

  const load = useCallback(async () => {
    try {
      const data = (await fetchWrapper.get(`/api/payslips/${payslipId}/deposits`)) as fin_payslip_deposit[]
      setRows(data)
    } catch {
      // non-critical
    }
  }, [payslipId])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async () => {
    if (!newRow.bank_name || !Number.isFinite(newRow.amount)) return
    try {
      await fetchWrapper.post(`/api/payslips/${payslipId}/deposits`, newRow)
      setIsAdding(false)
      setNewRow({})
      load()
    } catch {
      // ignore
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await fetchWrapper.delete(`/api/payslips/${payslipId}/deposits/${id}`, undefined)
      load()
    } catch {
      // ignore
    }
  }

  const total = rows.reduce((sum, r) => sum.add(currency(r.amount as string | number, { errorOnInvalid: false }).intValue), currency(0))

  return (
    <div className="border border-border rounded-sm bg-card">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <h3 className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary">Bank Deposits</h3>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 gap-1" onClick={() => setIsAdding(true)}>
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      <div className="p-4 space-y-2">
        {rows.length === 0 && !isAdding && (
          <p className="font-mono text-[10px] text-muted-foreground">No deposit splits recorded.</p>
        )}
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-4 gap-2 items-center font-mono text-xs">
            <span className="col-span-1 truncate">{row.bank_name}</span>
            <span className="text-muted-foreground">···{row.account_last4}</span>
            <span className="text-right">${currency(row.amount as string | number, { errorOnInvalid: false }).format()}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-destructive"
              onClick={() => row.id && handleDelete(row.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
        {rows.length > 0 && (
          <div className="flex justify-between pt-1 border-t border-border font-mono text-xs text-muted-foreground">
            <span>Total deposits</span>
            <span className={netPay && Math.abs(total.intValue - (netPay as number) * 100) > 2 ? 'text-warning' : 'text-success'}>
              ${total.format()}
              {netPay ? ` / ${currency(netPay as number).format()} net` : ''}
            </span>
          </div>
        )}
        {isAdding && (
          <div className="grid grid-cols-4 gap-2 items-end">
            <Input
              className="h-7 font-mono text-xs"
              placeholder="Bank name"
              value={newRow.bank_name ?? ''}
              onChange={(e) => setNewRow((p) => ({ ...p, bank_name: e.target.value }))}
            />
            <Input
              className="h-7 font-mono text-xs"
              placeholder="Last 4"
              maxLength={4}
              value={newRow.account_last4 ?? ''}
              onChange={(e) => setNewRow((p) => ({ ...p, account_last4: e.target.value }))}
            />
            <Input
              type="number"
              className="h-7 font-mono text-xs"
              placeholder="Amount"
              value={newRow.amount ?? ''}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                setNewRow((p) => ({ ...p, amount: isNaN(v) ? undefined : v } as NewDepositRow))
              }}
            />
            <div className="flex gap-1">
              <Button type="button" size="sm" className="h-7 px-2" onClick={handleSave}>
                Save
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface PayslipDetailClientProps {
  initialPayslip?: fin_payslip | null
}

export default function PayrollForm({ initialPayslip }: PayslipDetailClientProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [saveMode, setSaveMode] = useState<'edit' | 'new'>('edit')
  const [apiError, setApiError] = useState<string | null>(null)
  const [showJsonModal, setShowJsonModal] = useState(false)
  const [w2Jobs, setW2Jobs] = useState<{ id: number; display_name: string }[]>([])
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(
    initialPayslip?.employment_entity_id ?? null,
  )

  const fetchW2Jobs = useCallback(async () => {
    try {
      const data = (await fetchWrapper.get(
        '/api/finance/employment-entities?visible_only=true',
      )) as { id: number; display_name: string; type: string; start_date: string }[]
      const w2Only = data.filter((e) => e.type === 'w2').sort((a, b) => b.start_date.localeCompare(a.start_date))
      setW2Jobs(w2Only)
      if (!initialPayslip && w2Only.length > 0 && !selectedEntityId) {
        setSelectedEntityId(w2Only[0]?.id ?? null)
      }
    } catch {
      // optional feature
    }
  }, [initialPayslip, selectedEntityId])

  useEffect(() => {
    fetchW2Jobs()
  }, [fetchW2Jobs])

  const prepareInitialValues = useMemo(() => {
    if (!initialPayslip) return { ps_is_estimated: false }
    const convertDate = (dateStr?: string | null) => parseDate(dateStr)?.formatYMD() ?? dateStr ?? ''
    const converted = {
      ...initialPayslip,
      period_start: convertDate(initialPayslip.period_start),
      period_end: convertDate(initialPayslip.period_end),
      pay_date: convertDate(initialPayslip.pay_date),
      ps_is_estimated: initialPayslip.ps_is_estimated ?? false,
    }
    Object.keys(converted).forEach((k) => (converted as any)[k] == null && delete (converted as any)[k])
    return converted
  }, [initialPayslip])

  const form = useForm<fin_payslip>({
    resolver: zodResolver(fin_payslip_schema) as any,
    defaultValues: prepareInitialValues as any,
  })

  useEffect(() => {
    if (initialPayslip) {
      Object.keys(prepareInitialValues).forEach((key) => {
        form.setValue(key as any, (prepareInitialValues as any)[key])
      })
    }
  }, [initialPayslip, form, prepareInitialValues])

  const hasYearChanged =
    initialPayslip &&
    parseDate(form.watch('pay_date'))?.formatYMD()?.slice(0, 4) !==
      parseDate(initialPayslip.pay_date)?.formatYMD()?.slice(0, 4)

  const onSubmit: SubmitHandler<fin_payslip> = async (data) => {
    setIsSubmitting(true)
    setApiError(null)
    try {
      const payslipToSave: any = { ...data, employment_entity_id: selectedEntityId }
      if (saveMode === 'edit' && initialPayslip?.payslip_id) {
        payslipToSave.payslip_id = initialPayslip.payslip_id
      }
      await savePayslip(payslipToSave)
      const payYear = parseDate(data.pay_date)?.formatYMD()?.slice(0, 4) ?? new Date().getFullYear().toString()
      window.location.href = `/finance/payslips?year=${payYear}`
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'An unexpected error occurred while saving the payslip.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!initialPayslip?.payslip_id) return
    setIsDeleting(true)
    setApiError(null)
    try {
      await deletePayslip(initialPayslip.payslip_id)
      const payYear =
        parseDate(initialPayslip.pay_date)?.formatYMD()?.slice(0, 4) ?? new Date().getFullYear().toString()
      window.location.href = `/finance/payslips?year=${payYear}`
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'An unexpected error occurred while deleting the payslip.')
      setIsDeleting(false)
    }
  }

  return (
    <>
      <FinanceNavbar
        activeSection="payslips"
        breadcrumbItems={
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{initialPayslip ? 'Edit Payslip' : 'Add Payslip'}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        }
      />

      <div className="container mx-auto mt-6 pb-12 max-w-4xl">
        {/* ── Page title ──────────────────────────────────────────────────── */}
        <div className="mb-6 pb-4 border-b border-border">
          <h1 className="font-mono text-sm font-semibold uppercase tracking-widest text-primary">
            {initialPayslip ? 'Edit Payslip' : 'New Payslip'}
          </h1>
          {initialPayslip?.pay_date && (
            <p className="font-mono text-[10px] text-muted-foreground mt-1">{initialPayslip.pay_date}</p>
          )}
        </div>

        {apiError && (
          <AlertDialog open={!!apiError} onOpenChange={() => setApiError(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Error</AlertDialogTitle>
                <AlertDialogDescription>{apiError}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction onClick={() => setApiError(null)}>OK</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {initialPayslip && (
          <PayslipJsonModal
            open={showJsonModal}
            mode="single"
            initialData={initialPayslip}
            onSuccess={() => {
              setShowJsonModal(false)
              const payYear =
                parseDate(initialPayslip.pay_date)?.formatYMD()?.slice(0, 4) ?? new Date().getFullYear().toString()
              window.location.href = `/finance/payslips?year=${payYear}`
            }}
            onClose={() => setShowJsonModal(false)}
          />
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* ── Dates & Comment ─────────────────────────────────────────── */}
            <div className="border border-border rounded-sm bg-card">
              <div className="px-4 py-2.5 border-b border-border">
                <h3 className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary">
                  Pay Period
                </h3>
              </div>
              <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                <FormField
                  control={form.control}
                  name="period_start"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                        Period Start
                      </FormLabel>
                      <FormControl>
                        <Input type="date" {...field} className="font-mono text-xs h-8" />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="period_end"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                        Period End
                      </FormLabel>
                      <FormControl>
                        <Input type="date" {...field} className="font-mono text-xs h-8" />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="pay_date"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                        Pay Date
                      </FormLabel>
                      <FormControl>
                        <Input type="date" {...field} className="font-mono text-xs h-8" />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ps_comment"
                  render={({ field }) => (
                    <FormItem className="space-y-1 sm:col-span-1">
                      <FormLabel className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                        Comment
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value ?? ''}
                          placeholder="Optional notes"
                          className="font-mono text-xs min-h-8 h-8 resize-none"
                        />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* ── W-2 Job ─────────────────────────────────────────────────── */}
            <div className="border border-border rounded-sm bg-card">
              <div className="px-4 py-2.5 border-b border-border">
                <h3 className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary">
                  W-2 Job
                </h3>
              </div>
              <div className="p-4">
                <select
                  className="w-full max-w-sm rounded-sm border border-input bg-background px-3 py-1.5 font-mono text-xs"
                  value={selectedEntityId ?? ''}
                  onChange={(e) => setSelectedEntityId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">No Job Associated</option>
                  {w2Jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.display_name}
                    </option>
                  ))}
                </select>
                <p className="font-mono text-[10px] text-muted-foreground mt-1.5">
                  Manage jobs in{' '}
                  <a href="/finance/config" className="text-primary hover:underline">
                    Settings
                  </a>
                  .
                </p>
              </div>
            </div>

            {/* ── Two-column sections ──────────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormSection title="Earnings">
                <NumericField label="Base Salary" field="ps_salary" control={form.control} />
                <NumericField label="Gross Earnings" field="earnings_gross" control={form.control} />
                <NumericField label="Bonus" field="earnings_bonus" control={form.control} />
                <NumericField label="RSU Vesting" field="earnings_rsu" control={form.control} />
                <NumericField label="Dividend Equiv." field="earnings_dividend_equivalent" control={form.control} />
                <NumericField label="Net Pay" field="earnings_net_pay" control={form.control} />
                <NumericField label="Vacation Payout" field="ps_vacation_payout" control={form.control} />
              </FormSection>

              <FormSection title="Imputed Income">
                <NumericField label="Legal Plan" field="imp_legal" control={form.control} />
                <NumericField label="Fitness / Gym" field="imp_fitness" control={form.control} />
                <NumericField label="LTD" field="imp_ltd" control={form.control} />
                <NumericField label="Life@ Choice" field="imp_life_choice" control={form.control} />
                <NumericField label="Other" field="imp_other" control={form.control} />
              </FormSection>

              <FormSection title="Federal Taxes">
                <NumericField label="OASDI (Social Security)" field="ps_oasdi" control={form.control} />
                <NumericField label="Medicare" field="ps_medicare" control={form.control} />
                <NumericField label="Federal Income Tax" field="ps_fed_tax" control={form.control} />
                <NumericField label="Additional Federal WH" field="ps_fed_tax_addl" control={form.control} />
                <NumericField label="Federal Tax Refunded" field="ps_fed_tax_refunded" control={form.control} />
              </FormSection>

              <FormSection title="Taxable Wage Bases">
                <NumericField label="OASDI Taxable Wages" field="taxable_wages_oasdi" control={form.control} />
                <NumericField label="Medicare Taxable Wages" field="taxable_wages_medicare" control={form.control} />
                <NumericField label="Federal Taxable Wages" field="taxable_wages_federal" control={form.control} />
              </FormSection>

              <FormSection title="RSU Post-Tax Offsets">
                <NumericField label="RSU Tax Offset" field="ps_rsu_tax_offset" control={form.control} />
                <NumericField label="RSU Excess Refund" field="ps_rsu_excess_refund" control={form.control} />
              </FormSection>

              <FormSection title="Retirement">
                <NumericField label="401(k) Pre-Tax" field="ps_401k_pretax" control={form.control} />
                <NumericField label="401(k) After-Tax (Roth)" field="ps_401k_aftertax" control={form.control} />
                <NumericField label="Employer Match" field="ps_401k_employer" control={form.control} />
              </FormSection>

              <FormSection title="Pre-Tax Deductions">
                <NumericField label="Medical" field="ps_pretax_medical" control={form.control} />
                <NumericField label="Dental" field="ps_pretax_dental" control={form.control} />
                <NumericField label="Vision" field="ps_pretax_vision" control={form.control} />
                <NumericField label="FSA" field="ps_pretax_fsa" control={form.control} />
              </FormSection>

              <FormSection title="PTO &amp; Hours">
                <NumericField label="Hours Worked" field="hours_worked" control={form.control} />
                <NumericField label="PTO Accrued" field="pto_accrued" control={form.control} />
                <NumericField label="PTO Used" field="pto_used" control={form.control} />
                <NumericField label="PTO Available" field="pto_available" control={form.control} />
                <NumericField label="Statutory PTO Available" field="pto_statutory_available" control={form.control} />
              </FormSection>
            </div>

            {/* ── State tax data & deposits (edit mode only) ──────────────── */}
            {initialPayslip?.payslip_id && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <StateDataSection payslipId={initialPayslip.payslip_id} />
                <DepositsSection
                  payslipId={initialPayslip.payslip_id}
                  {...(initialPayslip.earnings_net_pay != null
                    ? { netPay: initialPayslip.earnings_net_pay as number }
                    : {})}
                />
              </div>
            )}

            {/* ── Other (catch-all JSON viewer) ───────────────────────────── */}
            {initialPayslip?.other && Object.keys(initialPayslip.other).length > 0 && (
              <div className="border border-border rounded-sm bg-card">
                <div className="px-4 py-2.5 border-b border-border">
                  <h3 className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary">
                    Unrecognised Fields (other)
                  </h3>
                </div>
                <pre className="p-4 font-mono text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(initialPayslip.other, null, 2)}
                </pre>
              </div>
            )}

            {hasYearChanged && (
              <Alert variant="destructive">
                <AlertTitle>Tax Year Change Warning</AlertTitle>
                <AlertDescription>
                  The pay date year has changed. This payslip will move to a different tax year.
                </AlertDescription>
              </Alert>
            )}

            {/* ── Footer bar ──────────────────────────────────────────────── */}
            <div className="flex items-center justify-between pt-2">
              {/* Left: estimated toggle */}
              <FormField
                control={form.control}
                name="ps_is_estimated"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="font-mono text-xs text-muted-foreground cursor-pointer">
                      Values are estimated
                    </FormLabel>
                  </FormItem>
                )}
              />

              {/* Right: action buttons */}
              <div className="flex items-center gap-2">
                {initialPayslip && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowJsonModal(true)}
                    className="gap-1.5"
                  >
                    <Code className="h-3.5 w-3.5" /> Edit as JSON
                  </Button>
                )}

                {initialPayslip && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" type="button" size="sm">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this payslip?</AlertDialogTitle>
                        <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
                          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {initialPayslip && (
                  <Button type="submit" size="sm" onClick={() => setSaveMode('edit')} disabled={isSubmitting}>
                    {isSubmitting && saveMode === 'edit' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}{' '}
                    Save Edits
                  </Button>
                )}

                <Button type="submit" size="sm" variant={initialPayslip ? 'outline' : 'default'} onClick={() => setSaveMode('new')} disabled={isSubmitting}>
                  {isSubmitting && saveMode === 'new' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}{' '}
                  Save as New
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </div>
    </>
  )
}
