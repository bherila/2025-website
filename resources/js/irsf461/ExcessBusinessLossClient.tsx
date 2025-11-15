'use client'
import React, { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import currency from 'currency.js'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { DialogForm1040View } from '@/lib/tax/form1040'
import { DialogSchedule1View } from '@/lib/tax/schedule1'
import { formatFriendlyAmount } from '@/lib/formatCurrency'
import { calculateExcessBusinessLoss } from './ExcessBusinessLossCalculation'

const TAX_YEARS = 11
const CURRENT_YEAR = new Date().getFullYear()
const DEFAULT_W2 = 400000
const DEFAULT_CAP_GAIN = 100000
const DEFAULT_BUSINESS_LOSS = -300000

function parseCurrency(val: string) {
  try {
    return currency(val).value
  } catch {
    return 0
  }
}

export default function ExcessBusinessLossClient() {
  const [isSingle, setIsSingle] = useState(true)
  const [costOfLivingAdjustment, setCostOfLivingAdjustment] = useState(1.03)
  const [f461_line15, setF461Line15] = useState<number | null>(null)
  const [rows, setRows] = useState(
    Array.from({ length: TAX_YEARS }, (_, i) => ({
      year: CURRENT_YEAR + i,
      w2: DEFAULT_W2,
      personalCapGain: 0, // Personal capital gains for Schedule D
      capGain: DEFAULT_CAP_GAIN, // Business capital gains
      businessNetIncome: DEFAULT_BUSINESS_LOSS,
    })),
  )

  // Local input state for each cell
  const [inputValues, setInputValues] = useState(() =>
    rows.map((row) => ({
      w2: currency(row.w2).format(),
      personalCapGain: currency(row.personalCapGain).format(),
      capGain: currency(row.capGain).format(),
      businessNetIncome: currency(row.businessNetIncome).format(),
    })),
  )

  // Update local input value as user types
  const handleInputChange = (
    idx: number,
    field: 'w2' | 'personalCapGain' | 'capGain' | 'businessNetIncome',
    value: string,
  ) => {
    setInputValues((prev) => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], [field]: value }
      return copy
    })
  }

  // Commit value to main state onBlur
  const handleInputBlur = (idx: number, field: 'w2' | 'personalCapGain' | 'capGain' | 'businessNetIncome') => {
    setRows((prev) => {
      const copy = [...prev]
      copy[idx] = {
        ...copy[idx],
        [field]: parseCurrency(inputValues[idx][field]),
      }
      return copy
    })
    // Optionally, reformat the input value after blur
    setInputValues((prev) => {
      const copy = [...prev]
      copy[idx] = {
        ...copy[idx],
        [field]: currency(parseCurrency(inputValues[idx][field])).format(),
      }
      return copy
    })
  }

  // Track carryforward NOL and disallowed loss
  let carryforward = 0
  const tableRows = calculateExcessBusinessLoss({ rows, isSingle, override_f461_line15: f461_line15 })
  return (
    <>
      <div className="mb-4 flex gap-4 items-center">
        <label className="flex items-center gap-2">
          <span>Status:</span>
          <Button variant={isSingle ? 'default' : 'outline'} size="sm" onClick={() => setIsSingle(true)}>
            Single
          </Button>
          <Button variant={!isSingle ? 'default' : 'outline'} size="sm" onClick={() => setIsSingle(false)}>
            Married
          </Button>
        </label>
        <label className="flex items-center gap-2">
          <span>Cost of Living Adjustment:</span>
          <Input
            type="number"
            step="0.01"
            min="1"
            value={costOfLivingAdjustment}
            onChange={(e) => setCostOfLivingAdjustment(Number(e.target.value) || 1.03)}
            className="w-20"
          />
        </label>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Year</TableHead>
            <TableHead>W-2 income</TableHead>
            <TableHead>Personal Cap Gains</TableHead>
            <TableHead>Business Cap Gains</TableHead>
            <TableHead>Business income</TableHead>
            <TableHead>Start NOL</TableHead>
            <TableHead>f461 Limit</TableHead>
            <TableHead>(Loss) Allowed</TableHead>
            <TableHead>NOL Fwd</TableHead>
            <TableHead>AGI</TableHead>
            <TableHead>Schedule 1</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tableRows.map((row, idx) => (
            <TableRow key={row.year}>
              <TableCell>{row.year}</TableCell>
              <TableCell>
                <Input
                  type="text"
                  value={inputValues[idx].w2}
                  onChange={(e) => handleInputChange(idx, 'w2', e.target.value)}
                  onBlur={() => handleInputBlur(idx, 'w2')}
                  onFocus={(e) => {
                    handleInputChange(idx, 'w2', String(currency(inputValues[idx].w2).value))
                    e.target.select()
                  }}
                  className="w-32"
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' && idx < tableRows.length - 1) {
                      e.preventDefault()
                      document.getElementById(`w2-input-${idx + 1}`)?.focus()
                    }
                    if (e.key === 'ArrowUp' && idx > 0) {
                      e.preventDefault()
                      document.getElementById(`w2-input-${idx - 1}`)?.focus()
                    }
                  }}
                  id={`w2-input-${idx}`}
                />
              </TableCell>
              <TableCell>
                <Input
                  type="text"
                  value={inputValues[idx].personalCapGain}
                  onChange={(e) => handleInputChange(idx, 'personalCapGain', e.target.value)}
                  onBlur={() => handleInputBlur(idx, 'personalCapGain')}
                  onFocus={(e) => {
                    handleInputChange(idx, 'personalCapGain', String(currency(inputValues[idx].personalCapGain).value))
                    e.target.select()
                  }}
                  className="w-32"
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' && idx < tableRows.length - 1) {
                      e.preventDefault()
                      document.getElementById(`personalCapGain-input-${idx + 1}`)?.focus()
                    }
                    if (e.key === 'ArrowUp' && idx > 0) {
                      e.preventDefault()
                      document.getElementById(`personalCapGain-input-${idx - 1}`)?.focus()
                    }
                  }}
                  id={`personalCapGain-input-${idx}`}
                />
              </TableCell>
              <TableCell>
                <Input
                  type="text"
                  value={inputValues[idx].capGain}
                  onChange={(e) => handleInputChange(idx, 'capGain', e.target.value)}
                  onBlur={() => handleInputBlur(idx, 'capGain')}
                  onFocus={(e) => {
                    handleInputChange(idx, 'capGain', String(currency(inputValues[idx].capGain).value))
                    e.target.select()
                  }}
                  className="w-32"
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' && idx < tableRows.length - 1) {
                      e.preventDefault()
                      document.getElementById(`capGain-input-${idx + 1}`)?.focus()
                    }
                    if (e.key === 'ArrowUp' && idx > 0) {
                      e.preventDefault()
                      document.getElementById(`capGain-input-${idx - 1}`)?.focus()
                    }
                  }}
                  id={`capGain-input-${idx}`}
                />
              </TableCell>
              <TableCell>
                <Input
                  type="text"
                  value={inputValues[idx].businessNetIncome}
                  onChange={(e) => handleInputChange(idx, 'businessNetIncome', e.target.value)}
                  onBlur={() => handleInputBlur(idx, 'businessNetIncome')}
                  onFocus={(e) => {
                    handleInputChange(idx, 'businessNetIncome', String(currency(inputValues[idx].businessNetIncome).value))
                    e.target.select()
                  }}
                  className="w-32"
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' && idx < tableRows.length - 1) {
                      e.preventDefault()
                      document.getElementById(`businessNetIncome-input-${idx + 1}`)?.focus()
                    }
                    if (e.key === 'ArrowUp' && idx > 0) {
                      e.preventDefault()
                      document.getElementById(`businessNetIncome-input-${idx - 1}`)?.focus()
                    }
                  }}
                  id={`businessNetIncome-input-${idx}`}
                />
              </TableCell>
              <TableCell>{formatFriendlyAmount(row.startingNOL)}</TableCell>
              <TableCell>{formatFriendlyAmount(row.limit)}</TableCell>
              <TableCell>{formatFriendlyAmount(row.allowedLoss)}</TableCell>
              <TableCell>{formatFriendlyAmount(row.disallowedLoss)}</TableCell>
              <TableCell>{formatFriendlyAmount(row.f1040.f1040_line11)}</TableCell>
              <TableCell>
                <DialogForm1040View data={row.f1040} taxYear={row.year} />
                <DialogSchedule1View data={row.f1040.schedule1} taxYear={row.year} />
              </TableCell>
            </TableRow>
          ))}
          {/* Set All row */}
          <TableRow>
            <TableCell className="font-semibold">Set all:</TableCell>
            <TableCell>
              <Input
                type="text"
                placeholder="W-2 Income"
                className="w-32"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = e.currentTarget.value
                    const formatted = currency(parseCurrency(val)).format()
                    setInputValues((prev) => prev.map((row) => ({ ...row, w2: formatted })))
                    setRows((prev) => prev.map((row, i) => ({ ...row, w2: parseCurrency(val) })))
                  }
                }}
              />
            </TableCell>
            <TableCell>
              <Input
                type="text"
                placeholder="Personal Cap Gains"
                className="w-32"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = e.currentTarget.value
                    const formatted = currency(parseCurrency(val)).format()
                    setInputValues((prev) => prev.map((row) => ({ ...row, personalCapGain: formatted })))
                    setRows((prev) => prev.map((row, i) => ({ ...row, personalCapGain: parseCurrency(val) })))
                  }
                }}
              />
            </TableCell>
            <TableCell>
              <Input
                type="text"
                placeholder="Business Cap Gains"
                className="w-32"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = e.currentTarget.value
                    const formatted = currency(parseCurrency(val)).format()
                    setInputValues((prev) => prev.map((row) => ({ ...row, capGain: formatted })))
                    setRows((prev) => prev.map((row, i) => ({ ...row, capGain: parseCurrency(val) })))
                  }
                }}
              />
            </TableCell>
            <TableCell>
              <Input
                type="text"
                placeholder="Business net income"
                className="w-32"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = e.currentTarget.value
                    const formatted = currency(parseCurrency(val)).format()
                    setInputValues((prev) => prev.map((row) => ({ ...row, businessNetIncome: formatted })))
                    setRows((prev) => prev.map((row, i) => ({ ...row, businessNetIncome: parseCurrency(val) })))
                  }
                }}
              />
            </TableCell>
            <TableCell>-</TableCell>
            <TableCell>
              <Input
                type="text"
                placeholder="f461 Line 15 Override"
                className="w-32"
                defaultValue={f461_line15 === null ? '' : currency(f461_line15).format()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = parseCurrency(e.currentTarget.value)
                    // Force positive values only, since ExcessBusinessLossLimitation always returns positive
                    setF461Line15(val <= 0 ? null : Math.abs(val))
                  }
                }}
              />
            </TableCell>
            <TableCell>&nbsp;</TableCell>
            <TableCell>&nbsp;</TableCell>
            <TableCell>&nbsp;</TableCell>
            <TableCell>&nbsp;</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </>
  )
}
