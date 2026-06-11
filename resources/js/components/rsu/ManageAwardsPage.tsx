'use client'

import currency from 'currency.js'
import { ChevronDown, ChevronRight, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import Container from '@/components/container'
import { getShares, sharePriceSourceLabel } from '@/components/rsu/helpers'
import { RsuImportModal } from '@/components/rsu/RsuImportModal'
import RsuSubNav from '@/components/rsu/RsuSubNav'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import type { IAward } from '@/types/finance'

interface AwardSchedule {
  key: string
  awardId: string
  symbol: string
  grantDate: string
  totalShares: number
  rows: IAward[]
}

interface BackfillVestPriceResponse {
  updated?: number[]
  missing?: number[]
}

function getShareCount(award: IAward): number {
  return getShares(award) ?? 0
}

function nullableNumber(value: unknown): number | null {
  if (value === '' || value == null) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export default function ManageAwardsPage() {
  const [loading, setLoading] = useState(true)
  const [rsu, setRsu] = useState<IAward[]>([])
  const [editingAward, setEditingAward] = useState<IAward | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteAward, setDeleteAward] = useState<IAward | null>(null)
  const [deleteSchedule, setDeleteSchedule] = useState<AwardSchedule | null>(null)
  const [bulkPriceSchedule, setBulkPriceSchedule] = useState<AwardSchedule | null>(null)
  const [bulkVestPrice, setBulkVestPrice] = useState('')
  const [expandedSchedules, setExpandedSchedules] = useState<Record<string, boolean>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionTone, setActionTone] = useState<'default' | 'warning'>('default')
  const [isBackfilling, setIsBackfilling] = useState(false)

  const loadData = () => {
    setLoading(true)
    fetchWrapper
      .get('/api/rsu')
      .then((response) => setRsu(response))
      .catch((e) => {
        console.error(e)
        setErrorMessage('Failed to load RSU awards.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
  }, [])

  const schedules = useMemo<AwardSchedule[]>(() => {
    const grouped = new Map<string, AwardSchedule>()
    for (const award of rsu) {
      const key = `${award.award_id ?? ''}|${award.grant_date ?? ''}|${award.symbol ?? ''}`
      const existing = grouped.get(key)
      if (existing) {
        existing.rows.push(award)
        existing.totalShares = currency(existing.totalShares).add(getShareCount(award)).value
      } else {
        grouped.set(key, {
          key,
          awardId: award.award_id ?? '',
          symbol: award.symbol ?? '',
          grantDate: award.grant_date ?? '',
          totalShares: getShareCount(award),
          rows: [award],
        })
      }
    }
    return Array.from(grouped.values()).sort((a, b) => `${a.grantDate}${a.awardId}`.localeCompare(`${b.grantDate}${b.awardId}`))
  }, [rsu])

  const handleEdit = (award: IAward) => {
    setEditingAward({ ...award })
    setIsDialogOpen(true)
  }

  const handleAdd = () => {
    setEditingAward({
      award_id: '',
      grant_date: '',
      vest_date: '',
      symbol: '',
      grant_price: null,
      vest_price: null,
    })
    setIsDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteAward?.id) return

    setActionMessage(null)
    try {
      await fetchWrapper.delete(`/api/rsu/${deleteAward.id}`, {})
      setActionMessage('Deleted vest event.')
      setActionTone('default')
      setDeleteAward(null)
      loadData()
    } catch (e) {
      console.error(e)
      setErrorMessage('Failed to delete award.')
    }
  }

  const handleDeleteSchedule = async () => {
    if (!deleteSchedule) return

    setActionMessage(null)
    const rowsWithIds = deleteSchedule.rows.filter((award): award is IAward & { id: number } => typeof award.id === 'number')
    if (rowsWithIds.length === 0) {
      setDeleteSchedule(null)
      setActionMessage('No saved vest events were found for this schedule.')
      setActionTone('warning')
      return
    }

    const deletedIds: number[] = []
    const failedRows: IAward[] = []

    for (const award of rowsWithIds) {
      try {
        await fetchWrapper.delete(`/api/rsu/${award.id}`, {})
        deletedIds.push(award.id)
      } catch (e) {
        console.error(e)
        failedRows.push(award)
      }
    }

    setDeleteSchedule(null)

    if (deletedIds.length > 0) {
      loadData()
    }

    if (failedRows.length === 0) {
      setActionMessage(`Deleted ${deletedIds.length} vest event${deletedIds.length === 1 ? '' : 's'} from the schedule.`)
      setActionTone('default')
      return
    }

    if (deletedIds.length > 0) {
      setActionMessage(`Deleted ${deletedIds.length} of ${rowsWithIds.length} vest events; ${failedRows.length} failed.`)
      setActionTone('warning')
      return
    }

    setErrorMessage(`Failed to delete ${failedRows.length} vest event${failedRows.length === 1 ? '' : 's'} from the schedule.`)
  }

  const handleBulkVestPrice = async () => {
    if (!bulkPriceSchedule) return

    const vestPrice = nullableNumber(bulkVestPrice)
    try {
      await fetchWrapper.post('/api/rsu', bulkPriceSchedule.rows.map((award) => ({
        ...award,
        share_count: getShareCount(award),
        grant_price: nullableNumber(award.grant_price),
        vest_price: vestPrice,
        clear_grant_price: award.grant_price == null,
        clear_vest_price: vestPrice == null,
        vest_price_source: vestPrice == null ? null : 'manual',
      })))
      setBulkPriceSchedule(null)
      setBulkVestPrice('')
      loadData()
    } catch (e) {
      console.error(e)
      setErrorMessage('Failed to update schedule vest prices.')
    }
  }

  const handleBackfill = async () => {
    setIsBackfilling(true)
    setActionMessage(null)
    try {
      const response = await fetchWrapper.post('/api/rsu/backfill-vest-prices', {}) as BackfillVestPriceResponse
      const updatedCount = response.updated?.length ?? 0
      const missingCount = response.missing?.length ?? 0
      const updatedText = updatedCount === 1 ? 'Updated 1 vest price' : `Updated ${updatedCount} vest prices`
      const missingText = missingCount === 1 ? '1 vest event is still missing a price' : `${missingCount} vest events are still missing prices`
      setActionMessage(missingCount > 0 ? `${updatedText}; ${missingText}.` : `${updatedText}; no missing vest prices remain from the backfill set.`)
      setActionTone(missingCount > 0 ? 'warning' : 'default')
      loadData()
    } catch (e) {
      console.error(e)
      setErrorMessage('Failed to backfill vest prices.')
    } finally {
      setIsBackfilling(false)
    }
  }

  const handleSave = async () => {
    if (!editingAward) return

    const shareCount = getShares(editingAward)
    if (shareCount == null || !Number.isFinite(shareCount)) {
      setErrorMessage('Share count is required.')
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        ...editingAward,
        share_count: shareCount,
        grant_price: nullableNumber(editingAward.grant_price),
        vest_price: nullableNumber(editingAward.vest_price),
        clear_grant_price: editingAward.grant_price == null,
        clear_vest_price: editingAward.vest_price == null,
      }
      await fetchWrapper.post('/api/rsu', [payload])
      setIsDialogOpen(false)
      setEditingAward(null)
      loadData()
    } catch (e) {
      console.error(e)
      setErrorMessage('Failed to save award.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleChange = (field: keyof IAward, value: string | number | null | undefined) => {
    if (!editingAward) return
    setEditingAward({ ...editingAward, [field]: value })
  }

  return (
    <Container>
      <RsuSubNav />
      <Card className="mb-8">
        <div className="p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold">Manage RSU award schedules</h3>
              <p className="text-sm text-muted-foreground">
                One row is a vesting event; rows sharing award ID, grant date, and symbol form one schedule.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" disabled={isBackfilling} onClick={handleBackfill}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {isBackfilling ? 'Backfilling...' : 'Backfill prices'}
              </Button>
              <RsuImportModal onImportSuccess={loadData} />
              <Button onClick={handleAdd}>
                <Plus className="mr-2 h-4 w-4" />
                Add vest event
              </Button>
            </div>
          </div>

          {actionMessage && (
            <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${actionTone === 'warning' ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200' : 'border-border bg-muted/40 text-muted-foreground'}`}>
              {actionMessage}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Award schedule</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Grant date</TableHead>
                  <TableHead className="text-right">Total shares</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => {
                  const expanded = expandedSchedules[schedule.key] ?? true
                  return [
                    <TableRow key={schedule.key} className="bg-muted/30">
                      <TableCell>
                        <button
                          className="flex items-center gap-2 font-medium"
                          onClick={() => setExpandedSchedules({ ...expandedSchedules, [schedule.key]: !expanded })}
                        >
                          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          {schedule.awardId}
                        </button>
                      </TableCell>
                      <TableCell>{schedule.symbol}</TableCell>
                      <TableCell>{schedule.grantDate}</TableCell>
                      <TableCell className="text-right">{schedule.totalShares}</TableCell>
                      <TableCell>{schedule.rows.length} vest events</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setBulkPriceSchedule(schedule)
                              setBulkVestPrice('')
                            }}
                          >
                            Bulk set vest price
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setDeleteSchedule(schedule)}>
                            <Trash2 className="h-4 w-4" />
                            Schedule
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>,
                    expanded && schedule.rows.map((award) => (
                      <TableRow key={award.id ?? `${schedule.key}-${award.vest_date}`}>
                        <TableCell className="pl-10 text-muted-foreground">Vest event</TableCell>
                        <TableCell>{award.symbol}</TableCell>
                        <TableCell>{award.vest_date}</TableCell>
                        <TableCell className="text-right">{getShareCount(award)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 text-sm">
                            <span>Grant: {award.grant_price != null ? currency(award.grant_price).format() : '—'} ({sharePriceSourceLabel(award.grant_price_source)})</span>
                            <span>Vest: {award.vest_price != null ? currency(award.vest_price).format() : '—'} ({sharePriceSourceLabel(award.vest_price_source)})</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleEdit(award)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setDeleteAward(award)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )),
                  ]
                })}
                {schedules.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No RSU awards found. Click "Add vest event" to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>{editingAward?.id ? 'Edit vest event' : 'Add vest event'}</DialogTitle>
            <DialogDescription>Prices may be blank; blank values are stored as null, not zero.</DialogDescription>
          </DialogHeader>
          {editingAward && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="award_id">Award ID</Label>
                <Input id="award_id" value={editingAward.award_id || ''} onChange={(e) => handleChange('award_id', e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="symbol">Symbol</Label>
                <Input id="symbol" value={editingAward.symbol || ''} onChange={(e) => handleChange('symbol', e.target.value.toUpperCase())} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="grant_date">Grant Date</Label>
                  <Input id="grant_date" type="date" value={editingAward.grant_date || ''} onChange={(e) => handleChange('grant_date', e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="vest_date">Vest Date</Label>
                  <Input id="vest_date" type="date" value={editingAward.vest_date || ''} onChange={(e) => handleChange('vest_date', e.target.value)} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="share_count">Share Count</Label>
                <Input id="share_count" type="number" step="0.000001" value={editingAward.share_count == null ? '' : getShareCount(editingAward)} onChange={(e) => handleChange('share_count', e.target.value === '' ? undefined : Number(e.target.value))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="grant_price">Grant Price (optional)</Label>
                  <Input id="grant_price" type="number" step="0.000001" value={editingAward.grant_price ?? ''} onChange={(e) => handleChange('grant_price', e.target.value === '' ? null : Number(e.target.value))} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="vest_price">Vest Price (optional)</Label>
                  <Input id="vest_price" type="number" step="0.000001" value={editingAward.vest_price ?? ''} onChange={(e) => handleChange('vest_price', e.target.value === '' ? null : Number(e.target.value))} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkPriceSchedule !== null} onOpenChange={(open) => !open && setBulkPriceSchedule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk set vest price</DialogTitle>
            <DialogDescription>
              Updates every vesting event in {bulkPriceSchedule?.awardId || 'this schedule'}. Leave blank to clear the vest price.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Label htmlFor="bulk_vest_price">Vest price</Label>
            <Input
              id="bulk_vest_price"
              type="number"
              step="0.000001"
              value={bulkVestPrice}
              onChange={(event) => setBulkVestPrice(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkPriceSchedule(null)}>Cancel</Button>
            <Button onClick={handleBulkVestPrice}>Apply to schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteAward !== null} onOpenChange={(open) => !open && setDeleteAward(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete vest event?</DialogTitle>
            <DialogDescription>This deletes only this vesting event, not the entire award schedule.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAward(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteSchedule !== null} onOpenChange={(open) => !open && setDeleteSchedule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete award schedule?</DialogTitle>
            <DialogDescription>
              This deletes {deleteSchedule?.rows.length ?? 0} vesting event{deleteSchedule?.rows.length === 1 ? '' : 's'} for {deleteSchedule?.awardId || 'this schedule'}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSchedule(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteSchedule}>Delete schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={errorMessage !== null} onOpenChange={(open) => !open && setErrorMessage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>RSU action failed</DialogTitle>
            <DialogDescription>{errorMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setErrorMessage(null)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Container>
  )
}
