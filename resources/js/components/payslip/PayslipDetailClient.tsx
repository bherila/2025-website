import { zodResolver } from '@hookform/resolvers/zod'
import { Code, Loader2, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import type { fin_payslip } from './payslipDbCols'
import { fin_payslip_schema } from './payslipDbCols'
import PayslipJsonModal from './PayslipJsonModal'

// ─── Section block ────────────────────────────────────────────────────────────

function FormSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
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

      <div className="container mt-6 pb-12 max-w-4xl">
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
                <NumericField label="Net Pay" field="earnings_net_pay" control={form.control} />
                <NumericField label="Vacation Payout" field="ps_vacation_payout" control={form.control} />
              </FormSection>

              <FormSection title="Imputed Income">
                <NumericField label="Legal Plan" field="imp_legal" control={form.control} />
                <NumericField label="Fitness / Gym" field="imp_fitness" control={form.control} />
                <NumericField label="LTD" field="imp_ltd" control={form.control} />
                <NumericField label="Other" field="imp_other" control={form.control} />
              </FormSection>

              <FormSection title="Federal Taxes">
                <NumericField label="OASDI (Social Security)" field="ps_oasdi" control={form.control} />
                <NumericField label="Medicare" field="ps_medicare" control={form.control} />
                <NumericField label="Federal Income Tax" field="ps_fed_tax" control={form.control} />
                <NumericField label="Additional Federal WH" field="ps_fed_tax_addl" control={form.control} />
                <NumericField label="Federal Tax Refunded" field="ps_fed_tax_refunded" control={form.control} />
              </FormSection>

              <FormSection title="State Taxes">
                <NumericField label="State Income Tax" field="ps_state_tax" control={form.control} />
                <NumericField label="SDI" field="ps_state_disability" control={form.control} />
                <NumericField label="Additional State WH" field="ps_state_tax_addl" control={form.control} />
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
            </div>

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
