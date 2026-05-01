'use client'

import currency from 'currency.js'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { normalizeK1Code, resolve11SCharacter } from '@/lib/finance/k1Utils'

import { fmtAmt, InfoTooltip, parseFieldVal } from '../tax-preview-primitives'
import type { K1CodeItem } from './k1-types'

interface K1CodesModalProps {
  open: boolean
  boxLabel: string
  /** Box number this modal is editing (e.g. "11", "13"). Drives box-specific behavior. */
  box?: string
  /** Code → description mapping for this box. */
  codeDefinitions: Record<string, string>
  items: K1CodeItem[]
  readOnly?: boolean
  onClose: () => void
  /** Called when user saves changes. */
  onChange: (items: K1CodeItem[]) => void
}

/**
 * Codes whose sub-lines carry a separate ST/LT capital-gain character that
 * the user may need to override (typically because the supplemental statement
 * splits the box into multiple ST and LT amounts and the LLM cannot infer it
 * from the line description alone).
 *
 * Today only Box 11 code S (non-portfolio capital gain/loss) qualifies, but
 * the lookup is keyed by box+code so additional rules can be added later.
 */
const CHARACTER_ELIGIBLE: Record<string, ReadonlySet<string>> = {
  '11': new Set(['S']),
}

function isCharacterEligible(box: string | undefined, code: string): boolean {
  if (!box) return false
  return CHARACTER_ELIGIBLE[box]?.has(normalizeK1Code(code)) ?? false
}

/** Sub-modal for viewing / editing coded items on a single K-1 box (e.g. Box 11, Box 13). */
export default function K1CodesModal({ open, boxLabel, box, codeDefinitions, items, readOnly = false, onClose, onChange }: K1CodesModalProps) {
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

  const setItemCharacter = (index: number, character: 'short' | 'long' | null) => {
    setLocalItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        if (character === null) {
          const next = { ...item, manualOverride: true }
          delete next.character
          return next
        }
        return { ...item, character, manualOverride: true }
      }),
    )
  }

  const addItem = () => {
    setLocalItems((prev) => [...prev, { code: '', value: '', notes: '', manualOverride: true }])
  }

  const removeItem = (index: number) => {
    setLocalItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    onChange(localItems
      .filter((item) => item.code.trim() !== '')
      .map((item) => ({ ...item, code: normalizeK1Code(item.code) })))
    onClose()
  }

  const availableCodes = Object.keys(codeDefinitions)

  const boxTotal = localItems.reduce((acc, item) => {
    const v = parseFieldVal(item.value)
    return v !== null ? acc.add(v) : acc
  }, currency(0)).value

  const showCharacterColumn = localItems.some((item) => isCharacterEligible(box, item.code))

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
                  {showCharacterColumn && (
                    <TableHead className="w-32">
                      <span className="inline-flex items-center gap-1">
                        S/T or L/T
                        <InfoTooltip>
                          Box 11 code S routes to Schedule D line 5 when short-term and line 12 when long-term.
                          Use Auto only when the notes identify exactly one character.
                        </InfoTooltip>
                      </span>
                    </TableHead>
                  )}
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
                    {showCharacterColumn && (
                      <TableCell className="py-2 align-top">
                        {isCharacterEligible(box, item.code) ? (
                          readOnly ? (
                            <span className="text-sm text-muted-foreground">
                              {resolve11SCharacter(item) === 'short'
                                ? 'Short-term'
                                : resolve11SCharacter(item) === 'long'
                                  ? 'Long-term'
                                  : 'Needs review'}
                            </span>
                          ) : (
                            <Select
                              value={item.character ?? 'auto'}
                              onValueChange={(val) =>
                                setItemCharacter(idx, val === 'auto' ? null : (val as 'short' | 'long'))
                              }
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue placeholder="Auto (notes)" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">Auto (from notes)</SelectItem>
                                <SelectItem value="short">Short-term</SelectItem>
                                <SelectItem value="long">Long-term</SelectItem>
                              </SelectContent>
                            </Select>
                          )
                        ) : null}
                      </TableCell>
                    )}
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
