'use client'

import currency from 'currency.js'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import Container from '@/components/container'
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

export default function ManageAwardsPage() {
  const [loading, setLoading] = useState(true)
  const [rsu, setRsu] = useState<IAward[]>([])
  const [editingAward, setEditingAward] = useState<IAward | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const loadData = () => {
    setLoading(true)
    fetchWrapper
      .get('/api/rsu')
      .then((response) => setRsu(response))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleEdit = (award: IAward) => {
    setEditingAward({ ...award })
    setIsDialogOpen(true)
  }

  const handleAdd = () => {
    setEditingAward({
      award_id: '',
      grant_date: '',
      vest_date: '',
      share_count: 0,
      symbol: '',
      grant_price: 0,
      vest_price: 0,
    })
    setIsDialogOpen(true)
  }

  const handleDelete = async (award: IAward) => {
    if (!award.id) return
    if (!confirm('Are you sure you want to delete this award?')) return

    try {
      await fetchWrapper.delete(`/api/rsu/${award.id}`, {})
      loadData()
    } catch (e) {
      console.error(e)
      alert('Failed to delete award')
    }
  }

  const handleSave = async () => {
    if (!editingAward) return

    setIsSaving(true)
    try {
      const payload = {
        ...editingAward,
        share_count: typeof editingAward.share_count === 'object' 
          ? editingAward.share_count.value 
          : editingAward.share_count,
      }
      await fetchWrapper.post('/api/rsu', [payload])
      setIsDialogOpen(false)
      setEditingAward(null)
      loadData()
    } catch (e) {
      console.error(e)
      alert('Failed to save award')
    } finally {
      setIsSaving(false)
    }
  }

  const handleChange = (field: keyof IAward, value: string | number) => {
    if (!editingAward) return
    setEditingAward({ ...editingAward, [field]: value })
  }

  return (
    <Container>
      <RsuSubNav />
      <Card className="mb-8">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold">Manage RSU Awards</h3>
            <Button onClick={handleAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add Award
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Award ID</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Grant Date</TableHead>
                  <TableHead>Vest Date</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead className="text-right">Grant Price</TableHead>
                  <TableHead className="text-right">Vest Price</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rsu.map((award) => {
                  const shares = typeof award.share_count === 'object' ? award.share_count.value : award.share_count
                  return (
                    <TableRow key={award.id}>
                      <TableCell>{award.award_id}</TableCell>
                      <TableCell>{award.symbol}</TableCell>
                      <TableCell>{award.grant_date}</TableCell>
                      <TableCell>{award.vest_date}</TableCell>
                      <TableCell className="text-right">{shares}</TableCell>
                      <TableCell className="text-right">
                        {award.grant_price ? currency(award.grant_price).format() : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {award.vest_price ? currency(award.vest_price).format() : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEdit(award)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleDelete(award)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {rsu.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No RSU awards found. Click "Add Award" to get started.
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
            <DialogTitle>{editingAward?.id ? 'Edit Award' : 'Add Award'}</DialogTitle>
            <DialogDescription>
              {editingAward?.id ? 'Update the details of this RSU award.' : 'Add a new RSU award vest.'}
            </DialogDescription>
          </DialogHeader>
          {editingAward && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="award_id">Award ID</Label>
                <Input
                  id="award_id"
                  value={editingAward.award_id || ''}
                  onChange={(e) => handleChange('award_id', e.target.value)}
                  placeholder="Enter award ID"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="symbol">Symbol</Label>
                <Input
                  id="symbol"
                  value={editingAward.symbol || ''}
                  onChange={(e) => handleChange('symbol', e.target.value)}
                  placeholder="Enter symbol (e.g., META)"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="grant_date">Grant Date</Label>
                  <Input
                    id="grant_date"
                    type="date"
                    value={editingAward.grant_date || ''}
                    onChange={(e) => handleChange('grant_date', e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="vest_date">Vest Date</Label>
                  <Input
                    id="vest_date"
                    type="date"
                    value={editingAward.vest_date || ''}
                    onChange={(e) => handleChange('vest_date', e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="share_count">Share Count</Label>
                <Input
                  id="share_count"
                  type="number"
                  value={
                    typeof editingAward.share_count === 'object'
                      ? editingAward.share_count.value
                      : editingAward.share_count || ''
                  }
                  onChange={(e) => handleChange('share_count', parseFloat(e.target.value) || 0)}
                  placeholder="Enter number of shares"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="grant_price">Grant Price (optional)</Label>
                  <Input
                    id="grant_price"
                    type="number"
                    step="0.01"
                    value={editingAward.grant_price ?? ''}
                    onChange={(e) => handleChange('grant_price', e.target.value ? parseFloat(e.target.value) : 0)}
                    placeholder="Price at grant"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="vest_price">Vest Price (optional)</Label>
                  <Input
                    id="vest_price"
                    type="number"
                    step="0.01"
                    value={editingAward.vest_price ?? ''}
                    onChange={(e) => handleChange('vest_price', e.target.value ? parseFloat(e.target.value) : 0)}
                    placeholder="Price at vest"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Container>
  )
}
