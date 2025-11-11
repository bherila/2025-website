'use client'

import _ from 'lodash'
import currency from 'currency.js'
import { useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Edit } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import type { fin_payslip, fin_payslip_col, pay_data } from './payslipDbCols'
import PopoverContent from './PopoverContent'
import { updatePayslipEstimatedStatus } from '@/lib/api'
import classnames from 'classnames'

export interface payslip_table_col {
  field:
    | fin_payslip_col
    | {
        field: fin_payslip_col
        hide?: boolean
        title: string
        color?: string
      }[]
  hide?: boolean
  title: string
  render?: (value: any, row: fin_payslip) => React.ReactNode
}

interface Props {
  data: fin_payslip[]
  cols: payslip_table_col[]
  onRowEdited?: (row: fin_payslip) => void
}

function fmtNum(val: pay_data) {
  if (val == null || val == 0) {
    return null
  }
  if (typeof val === 'number') {
    return val.toFixed(2)
  }
  if (typeof (val as currency)?.value === 'number') {
    return (val as currency).value.toFixed(2)
  }
  if (typeof val === 'object') {
    if (val && Object.keys(val).length === 0) {
      return null
    }
    return <PopoverContent content={val} />
  }
  return val
}

function ytd(row: fin_payslip, col: fin_payslip_col, data: fin_payslip[]) {
  return data
    .filter((d) => d.pay_date! <= row.pay_date!)
    .reduce((prev, cur) => currency(cur[col] ?? 0).add(prev), currency(0))
}

function renderValueCellContents(row: fin_payslip, col: fin_payslip_col, data: fin_payslip[]) {
  const value = row[col]
  if (
    (col === 'ps_comment' && (value === null || value === '')) ||
    (col === 'other' && (value == null || Object.keys(value).length == 0))
  ) {
    return null
  }

  if (currency(value).value > 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{fmtNum(value)}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p>YTD: {fmtNum(ytd(row, col, data))}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }
  return <span>{fmtNum(value)}</span>
}

export function PayslipTable(props: Props) {
  const { data, cols, onRowEdited } = props
  const [isLoading, setIsLoading] = useState<{ [key: string]: boolean }>({})
  const [estimatedOverrides, setEstimatedOverrides] = useState<Record<string, boolean>>({})

  const handleEstimatedToggle = async (row: fin_payslip) => {
    if (!row.payslip_id) return

    const key = row.payslip_id.toString()
    const currentChecked = estimatedOverrides[key] ?? row.ps_is_estimated ?? false
    const newChecked = !currentChecked

    setIsLoading((prev) => ({ ...prev, [key]: true }))

    // Optimistic update
    setEstimatedOverrides(prev => ({ ...prev, [key]: newChecked }))
    if (onRowEdited) {
      onRowEdited({ ...row, ps_is_estimated: newChecked })
    }

    try {
      await updatePayslipEstimatedStatus(row.payslip_id, newChecked)
    } catch (error) {
      // Revert on failure
      setEstimatedOverrides(prev => {
        const newPrev = { ...prev }
        delete newPrev[key]
        return newPrev
      })
      if (onRowEdited) {
        onRowEdited({ ...row, ps_is_estimated: currentChecked })
      }
      console.error('Failed to update estimated status:', error)
    } finally {
      setIsLoading((prev) => ({ ...prev, [key]: false }))
    }
  }

  const filteredCols = cols.filter((col) => {
    if (Array.isArray(col.field)) {
      return col.field.some((subCol) =>
        data.some((row) => {
          const value = row[subCol.field]
          return value !== null && value !== 0 && value !== ''
        }),
      )
    }

    return data.some((row) => {
      // @ts-ignore
      const value = row[col.field]
      return value !== null && value !== 0 && value !== ''
    })
  })

  return (
    <Table className="text-xs font-mono">
      <TableHeader>
        <TableRow>
          {filteredCols
            .filter((c) => !c.hide)
            .map((s, i) => (
              <TableHead key={i} className="text-center">
                {s.title.trim()}
              </TableHead>
            ))}
          {onRowEdited && <TableHead>Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {_.orderBy(data, 'period_end').map((row: fin_payslip, rid: number) => {
          const key = row.payslip_id?.toString() ?? rid.toString()
          const isEstimated = estimatedOverrides[key] ?? row.ps_is_estimated ?? false
          return (
            <TableRow key={rid} className={classnames(isEstimated && 'text-orange-600', 'border-none', 'p-0', 'm-0')}>
              {filteredCols
                .filter((c) => !c.hide)
                .map((c: payslip_table_col, ci: number) => {
                  if (c.field === 'ps_is_estimated') {
                    return (
                      <TableCell key={c.title}>
                        <Checkbox
                          checked={isEstimated}
                          onCheckedChange={() => handleEstimatedToggle(row)}
                          disabled={isLoading[key]}
                        />
                      </TableCell>
                    )
                  }

                  if (Array.isArray(c.field)) {
                    return (
                      <TableCell key={c.title}>
                        <div className="flex gap-2 items-center">
                          {c.field.map(
                            (subItem) =>
                              row[subItem.field] > 0 && (
                                <div key={subItem.field} style={{ color: subItem.color }}>
                                  {subItem.title && <span className="font-semibold opacity-50 mr-1">{subItem.title}</span>}
                                  {renderValueCellContents(row, subItem.field, data)}
                                </div>
                              ),
                          )}
                        </div>
                      </TableCell>
                    )
                  } else {
                    return (
                      <TableCell key={c.field} className="text-right">
                        {c.render ? c.render(row[c.field], row) : renderValueCellContents(row, c.field, data)}
                      </TableCell>
                    )
                  }
                })}
              {onRowEdited && (
                <TableCell>
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={`/finance/payslips/entry?id=${row.payslip_id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </a>
                  </Button>
                </TableCell>
              )}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
