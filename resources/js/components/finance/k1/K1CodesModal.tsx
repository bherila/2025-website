'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

import { fmtAmt, parseFieldVal } from '../tax-preview-primitives'
import type { K1CodeItem } from './k1-types'

interface K1CodesModalProps {
  open: boolean
  boxLabel: string
  /** Code → description mapping for this box. */
  codeDefinitions: Record<string, string>
  items: K1CodeItem[]
  readOnly?: boolean
  onClose: () => void
  /** Called when user saves changes. */
  onChange: (items: K1CodeItem[]) => void
}

/** Sub-modal for viewing / editing coded items on a single K-1 box (e.g. Box 11, Box 13). */
export default function K1CodesModal({ open, boxLabel, codeDefinitions, items, readOnly = false, onClose, onChange }: K1CodesModalProps) {
  const [localItems, setLocalItems] = useState<K1CodeItem[]>(items)

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setLocalItems(items)
    } else {
      onClose()
    }
  }

  const updateItem = (index: number, patch: Partial<K1CodeItem>) => {
    setLocalItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch, manualOverride: true } : item)))
  }

  const addItem = () => {
    setLocalItems((prev) => [...prev, { code: '', value: '', notes: '', manualOverride: true }])
  }

  const removeItem = (index: number) => {
    setLocalItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    onChange(localItems.filter((item) => item.code.trim() !== ''))
    onClose()
  }

  const availableCodes = Object.keys(codeDefinitions)

  const boxTotal = localItems.reduce((acc, item) => {
    const v = parseFieldVal(item.value)
    return v !== null ? acc + v : acc
  }, 0)

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="w-[80vw] max-w-[80vw] sm:max-w-[80vw] min-w-[min(80vw,900px)] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg">{boxLabel} — Code Details</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {localItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No codes entered yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-72">Code</TableHead>
                  <TableHead className="w-32 text-right">Amount</TableHead>
                  <TableHead>Notes</TableHead>
                  {!readOnly && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {localItems.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="py-2 align-top">
                      {readOnly ? (
                        <span className="font-mono text-base font-semibold">{item.code}</span>
                      ) : (
                        <Select value={item.code} onValueChange={(val) => updateItem(idx, { code: val })}>
                          <SelectTrigger className="h-9 text-sm font-mono font-semibold">
                            <SelectValue placeholder="Select code" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableCodes.map((code) => (
                              <SelectItem key={code} value={code}>
                                <span className="font-mono font-semibold">{code}</span>
                                <span className="text-muted-foreground ml-2 text-xs">{codeDefinitions[code]}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="py-2 align-top">
                      <Input
                        className="h-9 text-sm font-mono text-right min-w-[100px]"
                        value={item.value}
                        onChange={(e) => updateItem(idx, { value: e.target.value })}
                        readOnly={readOnly}
                        placeholder="0.00"
                      />
                    </TableCell>
                    <TableCell className="py-2 align-top">
                      <Textarea
                        className="min-h-[72px] text-sm resize-y"
                        value={item.notes ?? ''}
                        onChange={(e) => updateItem(idx, { notes: e.target.value })}
                        readOnly={readOnly}
                        placeholder="Optional notes"
                        rows={3}
                      />
                    </TableCell>
                    {!readOnly && (
                      <TableCell className="py-2 align-top">
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => removeItem(idx)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter className="border-t pt-3 gap-2">
          {!readOnly && (
            <Button variant="outline" size="sm" className="gap-1" onClick={addItem}>
              <Plus className="h-4 w-4" />
              Add Code
            </Button>
          )}
          <div className="flex items-center gap-1.5 text-sm font-mono font-semibold text-muted-foreground">
            <span className="text-xs font-sans font-normal">Total:</span>
            <span className={boxTotal < 0 ? 'text-destructive' : ''}>{fmtAmt(boxTotal)}</span>
          </div>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly && (
            <Button onClick={handleSave} size="sm">
              Save
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
