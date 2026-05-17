import { ChevronDown, ChevronRight, Pencil, Pill, Plus, Trash2 } from 'lucide-react'
import type { FormEvent } from 'react'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { fetchWrapper } from '@/fetchWrapper'
import { compactPayload, errorMessage } from '@/phr/shared'
import {
  type PhrMedication,
  PhrMedicationResponseSchema,
  PhrMedicationsResponseSchema,
  PhrPatientResponseSchema,
} from '@/phr/types'

type MedicationStatus = 'active' | 'completed' | 'discontinued' | 'on_hold'

type MedicationFilter = 'all' | MedicationStatus

interface MedicationFormState {
  name: string
  dose: string
  doseUnit: string
  route: string
  frequency: string
  startedOn: string
  endedOn: string
  status: MedicationStatus
  prescriberName: string
  reasonForUse: string
}

interface MedicationFormFieldsProps {
  form: MedicationFormState
  onChange: (form: MedicationFormState) => void
}

interface AddFormProps {
  patientId: number
  onAdded: (medication: PhrMedication) => void
}

interface MedicationTableProps {
  title: string
  description: string
  medications: PhrMedication[]
  emptyMessage: string
  canManage: boolean
  editingId: number | null
  deletingId: number | null
  editForm: MedicationFormState
  setEditForm: (form: MedicationFormState) => void
  onStartEdit: (medication: PhrMedication) => void
  onCancelEdit: () => void
  onSaveEdit: (medicationId: number) => Promise<void>
  onStartDelete: (medicationId: number) => void
  onCancelDelete: () => void
  onConfirmDelete: (medicationId: number) => Promise<void>
  onEndNow: (medication: PhrMedication) => Promise<void>
  isMutating: (key: string) => boolean
}

const STATUS_CLASS: Record<MedicationStatus, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
  completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
  discontinued: 'bg-muted text-muted-foreground',
  on_hold: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
}

const STATUS_OPTIONS: Array<{ value: MedicationStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'discontinued', label: 'Discontinued' },
  { value: 'on_hold', label: 'On Hold' },
]

const FILTER_OPTIONS: Array<{ value: MedicationFilter; label: string }> = [
  { value: 'all', label: 'All statuses' },
  ...STATUS_OPTIONS,
]

const EMPTY_FORM: MedicationFormState = {
  name: '',
  dose: '',
  doseUnit: '',
  route: '',
  frequency: '',
  startedOn: '',
  endedOn: '',
  status: 'active',
  prescriberName: '',
  reasonForUse: '',
}

function medicationFormFromMedication(medication: PhrMedication): MedicationFormState {
  const status = resolveMedicationStatus(medication.status)

  if (!status) {
    console.warn(
      `Unexpected medication status "${medication.status}" for medication ${medication.id}; using "active" in the edit form until the data is corrected.`,
    )
  }

  return {
    name: medication.name,
    dose: medication.dose ?? '',
    doseUnit: medication.dose_unit ?? '',
    route: medication.route ?? '',
    frequency: medication.frequency ?? '',
    startedOn: medication.started_on ?? '',
    endedOn: medication.ended_on ?? '',
    status: status ?? 'active',
    prescriberName: medication.prescriber_name ?? '',
    reasonForUse: medication.reason_for_use ?? '',
  }
}

function resolveMedicationStatus(value: string): MedicationStatus | null {
  return STATUS_OPTIONS.find((option) => option.value === value)?.value ?? null
}

function medicationPayload(form: MedicationFormState): Record<string, unknown> {
  return compactPayload({
    name: form.name,
    dose: form.dose,
    dose_unit: form.doseUnit,
    route: form.route,
    frequency: form.frequency,
    started_on: form.startedOn,
    ended_on: form.endedOn,
    status: form.status,
    prescriber_name: form.prescriberName,
    reason_for_use: form.reasonForUse,
  })
}

function todayDateString(): string {
  const today = new Date()
  const year = String(today.getFullYear())
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function medicationDetails(medication: PhrMedication): string {
  return [
    [medication.dose, medication.dose_unit].filter(Boolean).join(' '),
    medication.route,
    medication.frequency,
    medication.started_on ? `Started ${medication.started_on}` : null,
    medication.ended_on ? `Ended ${medication.ended_on}` : null,
  ].filter(Boolean).join(' · ')
}

function MedicationFormFields({ form, onChange }: MedicationFormFieldsProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="grid gap-1 text-sm font-medium md:col-span-2">
        Name *
        <Input
          value={form.name}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          required
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Dose
        <Input
          value={form.dose}
          onChange={(event) => onChange({ ...form, dose: event.target.value })}
          placeholder="500"
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Dose Unit
        <Input
          value={form.doseUnit}
          onChange={(event) => onChange({ ...form, doseUnit: event.target.value })}
          placeholder="mg"
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Route
        <Input
          value={form.route}
          onChange={(event) => onChange({ ...form, route: event.target.value })}
          placeholder="PO"
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Frequency
        <Input
          value={form.frequency}
          onChange={(event) => onChange({ ...form, frequency: event.target.value })}
          placeholder="BID"
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Started On
        <Input
          type="date"
          value={form.startedOn}
          onChange={(event) => onChange({ ...form, startedOn: event.target.value })}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Ended On
        <Input
          type="date"
          value={form.endedOn}
          onChange={(event) => onChange({ ...form, endedOn: event.target.value })}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Status
        <select
          value={form.status}
          onChange={(event) => onChange({ ...form, status: event.target.value as MedicationStatus })}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Prescriber
        <Input
          value={form.prescriberName}
          onChange={(event) => onChange({ ...form, prescriberName: event.target.value })}
          placeholder="Dr. Example"
        />
      </label>
      <label className="grid gap-1 text-sm font-medium md:col-span-2">
        Reason for Use
        <Textarea
          value={form.reasonForUse}
          onChange={(event) => onChange({ ...form, reasonForUse: event.target.value })}
          placeholder="Why the patient is taking this medication"
        />
      </label>
    </div>
  )
}

function AddForm({ patientId, onAdded }: AddFormProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<MedicationFormState>(EMPTY_FORM)

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!form.name.trim()) {
      setError('Name is required.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const raw: unknown = await fetchWrapper.post(
        `/api/phr/patients/${patientId}/medications`,
        medicationPayload(form),
      )
      onAdded(PhrMedicationResponseSchema.parse(raw).medication)
      setForm(EMPTY_FORM)
      setOpen(false)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Add Medication
      </Button>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-card-foreground">Add Medication</h2>
      </div>
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3">
        <MedicationFormFields form={form} onChange={setForm} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? 'Adding…' : 'Add'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}

function MedicationTable({
  title,
  description,
  medications,
  emptyMessage,
  canManage,
  editingId,
  deletingId,
  editForm,
  setEditForm,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onStartDelete,
  onCancelDelete,
  onConfirmDelete,
  onEndNow,
  isMutating,
}: MedicationTableProps) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-semibold text-card-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {medications.length === 0 ? (
        <div className="px-4 py-8 text-sm text-muted-foreground">{emptyMessage}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Medication</th>
                <th className="px-4 py-3 font-medium">Details</th>
                <th className="px-4 py-3 font-medium">Prescriber</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {canManage && <th className="px-4 py-3 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {medications.map((medication) => {
                const isEditing = editingId === medication.id
                const isDeleting = deletingId === medication.id
                const isSaving = isMutating(`save:${medication.id}`)
                const isDeletingBusy = isMutating(`delete:${medication.id}`)
                const isEndingNow = isMutating(`end:${medication.id}`)
                const resolvedStatus = resolveMedicationStatus(medication.status)

                return (
                  <Fragment key={medication.id}>
                    <tr className="align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-card-foreground">{medication.name}</div>
                        {medication.reason_for_use && (
                          <p className="mt-1 text-xs text-muted-foreground">{medication.reason_for_use}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{medicationDetails(medication) || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{medication.prescriber_name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${resolvedStatus ? STATUS_CLASS[resolvedStatus] : 'bg-muted text-muted-foreground'}`}
                        >
                          {medication.status}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            {medication.status === 'active' && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isEndingNow || isSaving || isDeletingBusy}
                                onClick={() => void onEndNow(medication)}
                              >
                                {isEndingNow ? 'Ending…' : 'End now'}
                              </Button>
                            )}
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              title="Edit medication"
                              disabled={isEndingNow || isSaving || isDeletingBusy}
                              onClick={() => onStartEdit(medication)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              title="Delete medication"
                              disabled={isEndingNow || isSaving || isDeletingBusy}
                              onClick={() => onStartDelete(medication.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {isEditing && (
                      <tr>
                        <td colSpan={canManage ? 5 : 4} className="bg-muted/20 px-4 py-4">
                          <form
                            className="space-y-3"
                            onSubmit={(event) => {
                              event.preventDefault()
                              void onSaveEdit(medication.id)
                            }}
                          >
                            <MedicationFormFields form={editForm} onChange={setEditForm} />
                            <div className="flex gap-2">
                              <Button type="submit" size="sm" disabled={isSaving}>
                                {isSaving ? 'Saving…' : 'Save'}
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={onCancelEdit} disabled={isSaving}>
                                Cancel
                              </Button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                    {isDeleting && (
                      <tr>
                        <td colSpan={canManage ? 5 : 4} className="bg-destructive/5 px-4 py-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-foreground">
                              Delete <strong>{medication.name}</strong>? This cannot be undone.
                            </p>
                            <div className="flex gap-2">
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={isDeletingBusy}
                                onClick={() => void onConfirmDelete(medication.id)}
                              >
                                {isDeletingBusy ? 'Deleting…' : 'Delete'}
                              </Button>
                              <Button type="button" variant="outline" size="sm" disabled={isDeletingBusy} onClick={onCancelDelete}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default function MedicationsPage({ patientId }: { patientId: number }) {
  const [medications, setMedications] = useState<PhrMedication[]>([])
  const [canManage, setCanManage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<MedicationFilter>('all')
  const [historicalOpen, setHistoricalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<MedicationFormState>(EMPTY_FORM)
  const [mutatingKey, setMutatingKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const [rawMedications, rawPatient] = await Promise.all([
        fetchWrapper.get(`/api/phr/patients/${patientId}/medications`),
        fetchWrapper.get(`/api/phr/patients/${patientId}`),
      ])
      setMedications(PhrMedicationsResponseSchema.parse(rawMedications).medications)
      setCanManage(PhrPatientResponseSchema.parse(rawPatient).patient.can_manage)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }, [patientId])

  useEffect(() => {
    void load()
  }, [load])

  const filteredMedications = useMemo(() => {
    if (statusFilter === 'all') {
      return medications
    }

    return medications.filter((medication) => medication.status === statusFilter)
  }, [medications, statusFilter])

  const activeMedications = useMemo(
    () => filteredMedications.filter((medication) => medication.status === 'active'),
    [filteredMedications],
  )

  const historicalMedications = useMemo(
    () => filteredMedications.filter((medication) => medication.status !== 'active'),
    [filteredMedications],
  )

  function updateMedication(updatedMedication: PhrMedication): void {
    setMedications((current) => current.map((medication) => (
      medication.id === updatedMedication.id ? updatedMedication : medication
    )))
  }

  function startEdit(medication: PhrMedication): void {
    setDeletingId(null)
    setEditingId(medication.id)
    setEditForm(medicationFormFromMedication(medication))
  }

  function cancelEdit(): void {
    setEditingId(null)
    setEditForm(EMPTY_FORM)
  }

  async function saveEdit(medicationId: number): Promise<void> {
    if (!editForm.name.trim()) {
      setError('Name is required.')
      return
    }

    setMutatingKey(`save:${medicationId}`)
    setError(null)
    try {
      const raw: unknown = await fetchWrapper.patch(
        `/api/phr/patients/${patientId}/medications/${medicationId}`,
        medicationPayload(editForm),
      )
      updateMedication(PhrMedicationResponseSchema.parse(raw).medication)
      cancelEdit()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setMutatingKey(null)
    }
  }

  async function confirmDelete(medicationId: number): Promise<void> {
    setMutatingKey(`delete:${medicationId}`)
    setError(null)
    try {
      await fetchWrapper.delete(`/api/phr/patients/${patientId}/medications/${medicationId}`, {})
      setMedications((current) => current.filter((medication) => medication.id !== medicationId))
      setDeletingId(null)
      if (editingId === medicationId) {
        cancelEdit()
      }
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setMutatingKey(null)
    }
  }

  async function endNow(medication: PhrMedication): Promise<void> {
    const endedOn = todayDateString()
    setMutatingKey(`end:${medication.id}`)
    setError(null)
    try {
      const raw: unknown = await fetchWrapper.patch(
        `/api/phr/patients/${patientId}/medications/${medication.id}`,
        { ended_on: endedOn, status: 'discontinued' },
      )
      updateMedication(PhrMedicationResponseSchema.parse(raw).medication)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setMutatingKey(null)
    }
  }

  function isMutating(key: string): boolean {
    return mutatingKey === key
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <Pill className="size-6 text-primary" />
            Medications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track current medications separately from historical prescriptions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="grid gap-1 text-sm font-medium text-foreground">
            Status filter
            <select
              aria-label="Status filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as MedicationFilter)}
              className="flex h-9 min-w-40 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              {FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {canManage && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <AddForm patientId={patientId} onAdded={(medication) => setMedications((current) => [medication, ...current])} />
          <Button size="sm" variant="outline" disabled>
            Import via GenAI (blocked pending documents modal)
          </Button>
        </div>
      )}

      {busy && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!busy && medications.length === 0 && (
        <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No medications recorded.
        </div>
      )}

      {!busy && medications.length > 0 && (
        <div className="space-y-4">
          <MedicationTable
            title="Active Medications"
            description="Currently active medications for this patient."
            medications={activeMedications}
            emptyMessage="No active medications match the current filter."
            canManage={canManage}
            editingId={editingId}
            deletingId={deletingId}
            editForm={editForm}
            setEditForm={setEditForm}
            onStartEdit={startEdit}
            onCancelEdit={cancelEdit}
            onSaveEdit={saveEdit}
            onStartDelete={setDeletingId}
            onCancelDelete={() => setDeletingId(null)}
            onConfirmDelete={confirmDelete}
            onEndNow={endNow}
            isMutating={isMutating}
          />

          <section className="rounded-lg border border-border bg-card">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              onClick={() => setHistoricalOpen((current) => !current)}
              aria-expanded={historicalOpen}
            >
              <div>
                <h2 className="font-semibold text-card-foreground">Historical Medications</h2>
                <p className="text-sm text-muted-foreground">
                  Completed, discontinued, or on-hold medications.
                </p>
              </div>
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                {historicalMedications.length}
                {historicalOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </span>
            </button>
            {historicalOpen && (
              <div className="border-t border-border">
                <MedicationTable
                  title="Historical Medications"
                  description="Previous medications retained for reference."
                  medications={historicalMedications}
                  emptyMessage="No historical medications match the current filter."
                  canManage={canManage}
                  editingId={editingId}
                  deletingId={deletingId}
                  editForm={editForm}
                  setEditForm={setEditForm}
                  onStartEdit={startEdit}
                  onCancelEdit={cancelEdit}
                  onSaveEdit={saveEdit}
                  onStartDelete={setDeletingId}
                  onCancelDelete={() => setDeletingId(null)}
                  onConfirmDelete={confirmDelete}
                  onEndNow={endNow}
                  isMutating={isMutating}
                />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
