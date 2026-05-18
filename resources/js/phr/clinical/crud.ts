import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useState } from 'react'

import { fetchWrapper } from '@/fetchWrapper'
import { errorMessage } from '@/phr/shared'
import { PhrPatientResponseSchema } from '@/phr/types'

export interface ClinicalRecordBase {
  id: number
}

interface UseClinicalCrudOptions<TRecord extends ClinicalRecordBase, TForm> {
  patientId: number
  endpoint: string
  emptyForm: TForm
  formFromRecord: (record: TRecord) => TForm
  parseItem: (raw: unknown) => TRecord
  parseList: (raw: unknown) => TRecord[]
  payloadFromForm: (form: TForm) => Record<string, unknown>
  sortRecords?: (records: TRecord[]) => TRecord[]
}

export interface ClinicalCrudState<TRecord extends ClinicalRecordBase, TForm> {
  records: TRecord[]
  setRecords: Dispatch<SetStateAction<TRecord[]>>
  canManage: boolean
  busy: boolean
  error: string | null
  setError: Dispatch<SetStateAction<string | null>>
  editingId: number | null
  deletingId: number | null
  editForm: TForm
  setEditForm: Dispatch<SetStateAction<TForm>>
  mutatingKey: string | null
  addRecord: (form: TForm) => Promise<TRecord | null>
  patchRecord: (recordId: number, payload: Record<string, unknown>, mutationKey?: string) => Promise<TRecord | null>
  saveEdit: (recordId: number) => Promise<TRecord | null>
  deleteRecord: (recordId: number) => Promise<boolean>
  startEdit: (record: TRecord) => void
  cancelEdit: () => void
  startDelete: (recordId: number) => void
  cancelDelete: () => void
  isMutating: (key: string) => boolean
}

export function useClinicalCrud<TRecord extends ClinicalRecordBase, TForm>({
  patientId,
  endpoint,
  emptyForm,
  formFromRecord,
  parseItem,
  parseList,
  payloadFromForm,
  sortRecords,
}: UseClinicalCrudOptions<TRecord, TForm>): ClinicalCrudState<TRecord, TForm> {
  const [records, setRecords] = useState<TRecord[]>([])
  const [canManage, setCanManage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<TForm>(emptyForm)
  const [mutatingKey, setMutatingKey] = useState<string | null>(null)

  const applySort = useCallback((nextRecords: TRecord[]): TRecord[] => {
    return sortRecords ? sortRecords(nextRecords) : nextRecords
  }, [sortRecords])

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const [rawRecords, rawPatient] = await Promise.all([
        fetchWrapper.get(endpoint),
        fetchWrapper.get(`/api/phr/patients/${patientId}`),
      ])

      setRecords(applySort(parseList(rawRecords)))
      setCanManage(PhrPatientResponseSchema.parse(rawPatient).patient.can_manage)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }, [applySort, endpoint, parseList, patientId])

  useEffect(() => {
    void load()
  }, [load])

  function startEdit(record: TRecord): void {
    setDeletingId(null)
    setEditingId(record.id)
    setEditForm(formFromRecord(record))
  }

  function cancelEdit(): void {
    setEditingId(null)
    setEditForm(emptyForm)
  }

  function startDelete(recordId: number): void {
    setEditingId(null)
    setDeletingId(recordId)
  }

  function cancelDelete(): void {
    setDeletingId(null)
  }

  function replaceRecord(updatedRecord: TRecord): void {
    setRecords((current) => applySort(current.map((record) => (
      record.id === updatedRecord.id ? updatedRecord : record
    ))))
  }

  async function addRecord(form: TForm): Promise<TRecord | null> {
    setMutatingKey('add')
    setError(null)
    try {
      const raw: unknown = await fetchWrapper.post(endpoint, payloadFromForm(form))
      const addedRecord = parseItem(raw)
      setRecords((current) => applySort([addedRecord, ...current]))
      return addedRecord
    } catch (caught) {
      setError(errorMessage(caught))
      return null
    } finally {
      setMutatingKey(null)
    }
  }

  async function patchRecord(recordId: number, payload: Record<string, unknown>, mutationKey = `save:${recordId}`): Promise<TRecord | null> {
    setMutatingKey(mutationKey)
    setError(null)
    try {
      const raw: unknown = await fetchWrapper.patch(`${endpoint}/${recordId}`, payload)
      const updatedRecord = parseItem(raw)
      replaceRecord(updatedRecord)
      return updatedRecord
    } catch (caught) {
      setError(errorMessage(caught))
      return null
    } finally {
      setMutatingKey(null)
    }
  }

  async function saveEdit(recordId: number): Promise<TRecord | null> {
    const updatedRecord = await patchRecord(recordId, payloadFromForm(editForm))

    if (updatedRecord) {
      cancelEdit()
    }

    return updatedRecord
  }

  async function deleteRecord(recordId: number): Promise<boolean> {
    setMutatingKey(`delete:${recordId}`)
    setError(null)
    try {
      await fetchWrapper.delete(`${endpoint}/${recordId}`, {})
      setRecords((current) => current.filter((record) => record.id !== recordId))
      setDeletingId(null)
      if (editingId === recordId) {
        cancelEdit()
      }

      return true
    } catch (caught) {
      setError(errorMessage(caught))
      return false
    } finally {
      setMutatingKey(null)
    }
  }

  function isMutating(key: string): boolean {
    return mutatingKey === key
  }

  return {
    records,
    setRecords,
    canManage,
    busy,
    error,
    setError,
    editingId,
    deletingId,
    editForm,
    setEditForm,
    mutatingKey,
    addRecord,
    patchRecord,
    saveEdit,
    deleteRecord,
    startEdit,
    cancelEdit,
    startDelete,
    cancelDelete,
    isMutating,
  }
}
