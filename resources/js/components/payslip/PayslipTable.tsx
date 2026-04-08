'use client'

import currency from 'currency.js'
import _ from 'lodash'
import { Edit } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { updatePayslipEstimatedStatus } from '@/lib/api'

import type { fin_payslip } from './payslipDbCols'

interface Props {
  data: fin_payslip[]
  onRowEdited?: (row: fin_payslip) => void
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmt(val: number | null | undefined): string | null {
  if (!val) return null
  return currency(val, { symbol: '$', precision: 2 }).format()
}

function fmtShort(val: number | null | undefined): string | null {
  if (!val) return null
  const c = currency(val)
  if (Math.abs(c.value) >= 1000) {
    return '$' + (c.value / 1000).toFixed(1) + 'k'
  }
  return c.format()
}

// ─── Sub-text helper ─────────────────────────────────────────────────────────

function SubText({ children }: { children: ReactNode }) {
  return <span className="block text-[10px] text-gray-400 mt-0.5 leading-tight">{children}</span>
}

// ─── Tag badges ──────────────────────────────────────────────────────────────

type TagVariant = 'rsu' | 'bonus' | 'earn' | 'deduct' | 'estimated'

const TAG_CLASSES: Record<TagVariant, string> = {
  rsu: 'bg-blue-950/60 text-blue-200 border border-blue-800/50',
  bonus: 'bg-yellow-950/60 text-yellow-300 border border-yellow-800/50 dark:border-yellow-700/40',
  earn: 'bg-success/10 text-success border border-success/20',
  deduct: 'bg-gray-800/60 text-gray-300 border border-gray-700/50',
  estimated: 'bg-warning/10 text-warning border border-warning/20',
}

function Tag({ variant, children }: { variant: TagVariant; children: ReactNode }) {
  return (
    <span
      className={`inline-block font-mono text-[9px] px-1.5 py-0.5 rounded-[2px] mr-1 mb-0.5 align-middle whitespace-nowrap leading-tight ${TAG_CLASSES[variant]}`}
    >
      {children}
    </span>
  )
}

// ─── Amount cell ─────────────────────────────────────────────────────────────

function AmountCell({
  value,
  variant = 'default',
  sub,
}: {
  value: number | null | undefined
  variant?: 'pos' | 'neg' | 'accent' | 'default'
  sub?: ReactNode
}) {
  if (!value) return <span className="text-muted-foreground">—</span>

  const colorClass =
    variant === 'pos'
      ? 'text-success'
      : variant === 'neg'
        ? 'text-destructive'
        : variant === 'accent'
          ? 'text-primary font-semibold'
          : 'text-foreground'

  return (
    <span className={colorClass}>
      {fmt(value)}
      {sub}
    </span>
  )
}

// ─── YTD tooltip wrapper ──────────────────────────────────────────────────────

function WithYTD({
  row,
  field,
  allData,
  children,
}: {
  row: fin_payslip
  field: keyof fin_payslip
  allData: fin_payslip[]
  children: ReactNode
}) {
  const ytd = allData
    .filter((d) => d.pay_date! <= row.pay_date!)
    .reduce((acc, cur) => currency(cur[field] as number ?? 0).add(acc), currency(0))

  if (!ytd.value) return <>{children}</>

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help underline decoration-dotted decoration-muted-foreground underline-offset-2">
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="font-mono text-xs">
          YTD: {ytd.format()}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PayslipTable({ data, onRowEdited }: Props) {
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({})
  const [estimatedOverrides, setEstimatedOverrides] = useState<Record<string, boolean>>({})

  const handleEstimatedToggle = async (row: fin_payslip) => {
    if (!row.payslip_id) return
    const key = row.payslip_id.toString()
    const current = estimatedOverrides[key] ?? row.ps_is_estimated ?? false
    const next = !current
    setIsLoading((prev) => ({ ...prev, [key]: true }))
    setEstimatedOverrides((prev) => ({ ...prev, [key]: next }))
    if (onRowEdited) onRowEdited({ ...row, ps_is_estimated: next })
    try {
      await updatePayslipEstimatedStatus(row.payslip_id, next)
    } catch {
      setEstimatedOverrides((prev) => {
        const copy = { ...prev }
        delete copy[key]
        return copy
      })
      if (onRowEdited) onRowEdited({ ...row, ps_is_estimated: current })
    } finally {
      setIsLoading((prev) => ({ ...prev, [key]: false }))
    }
  }

  const sorted = _.orderBy(data, 'pay_date', 'asc')

  // Column header sub-text
  const Th = ({ right, children, sub }: { right?: boolean; children: ReactNode; sub?: string }) => (
    <TableHead
      className={`font-mono text-[10px] tracking-wide uppercase text-muted-foreground py-2.5 px-3 ${right ? 'text-right' : ''}`}
    >
      {children}
      {sub && <span className="block normal-case tracking-normal text-[9px] opacity-70 mt-0.5">{sub}</span>}
    </TableHead>
  )

  return (
    <div className="overflow-x-auto">
      <Table className="text-xs font-mono w-full">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <Th sub="Period">Pay Date</Th>
            <Th>Event</Th>
            <Th right sub="Wages + Supplemental">Gross Earnings</Th>
            <Th right sub="Base + Addl">Federal Tax</Th>
            <Th right sub="Base + Addl">CA State Tax</Th>
            <Th right sub="OASDI / Med / SDI">FICA &amp; SDI</Th>
            <Th right sub="Pre-tax 401k + Benefits">Deductions</Th>
            <Th right>Net Pay</Th>
            <Th>Est?</Th>
            {onRowEdited && <Th>Edit</Th>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row, rid) => {
            const key = row.payslip_id?.toString() ?? rid.toString()
            const isEstimated = estimatedOverrides[key] ?? row.ps_is_estimated ?? false

            // ── Event detection ───────────────────────────────────────────
            const isRsu = (row.earnings_rsu ?? 0) > 0 && (row.ps_salary ?? 0) < (row.earnings_rsu ?? 0)
            const isBonus = (row.earnings_bonus ?? 0) > 0 && (row.ps_salary ?? 0) < (row.earnings_bonus ?? 0)

            // ── Computed totals ───────────────────────────────────────────
            const fedTotal = currency(row.ps_fed_tax ?? 0)
              .add(row.ps_fed_tax_addl ?? 0)
              .subtract(row.ps_fed_tax_refunded ?? 0)
            const stateTotal = currency(row.ps_state_tax ?? 0).add(row.ps_state_tax_addl ?? 0)
            const ficaTotal = currency(row.ps_oasdi ?? 0)
              .add(row.ps_medicare ?? 0)
              .add(row.ps_state_disability ?? 0)
            // ps_401k_aftertax (Roth) is not a pre-tax deduction; excluded from this column total
            const pretaxTotal = currency(row.ps_401k_pretax ?? 0)
              .add(row.ps_pretax_medical ?? 0)
              .add(row.ps_pretax_dental ?? 0)
              .add(row.ps_pretax_vision ?? 0)
              .add(row.ps_pretax_fsa ?? 0)

            // ── Supplemental tags in gross cell ──────────────────────────
            const suppTags: ReactNode[] = []
            if (isRsu && row.earnings_rsu) suppTags.push(<Tag key="rsu" variant="rsu">RSU {fmtShort(row.earnings_rsu)}</Tag>)
            if (isBonus && row.earnings_bonus) suppTags.push(<Tag key="bonus" variant="bonus">BONUS {fmtShort(row.earnings_bonus)}</Tag>)
            if (!isRsu && !isBonus) {
              if (row.imp_ltd) suppTags.push(<Tag key="ltd" variant="earn">LTD {fmtShort(row.imp_ltd)}</Tag>)
              if (row.imp_fitness) suppTags.push(<Tag key="gym" variant="earn">Gym {fmtShort(row.imp_fitness)}</Tag>)
              if (row.imp_legal) suppTags.push(<Tag key="legal" variant="earn">Legal {fmtShort(row.imp_legal)}</Tag>)
              if (row.imp_other) suppTags.push(<Tag key="misc" variant="earn">Misc {fmtShort(row.imp_other)}</Tag>)
              if (row.ps_vacation_payout) suppTags.push(<Tag key="vac" variant="earn">Vac {fmtShort(row.ps_vacation_payout)}</Tag>)
            }

            // ── Pre-tax deduction tags ────────────────────────────────────
            const deductTags: ReactNode[] = []
            if (row.ps_401k_pretax) deductTags.push(<Tag key="pre" variant="deduct">401k PRE {fmtShort(row.ps_401k_pretax)}</Tag>)
            if (row.ps_401k_aftertax) deductTags.push(<Tag key="post" variant="deduct">401k POST {fmtShort(row.ps_401k_aftertax)}</Tag>)
            const benefitsTotal = currency(row.ps_pretax_medical ?? 0)
              .add(row.ps_pretax_dental ?? 0)
              .add(row.ps_pretax_vision ?? 0)
              .add(row.ps_pretax_fsa ?? 0)

            return (
              <TableRow
                key={rid}
                className={`border-border transition-colors hover:bg-muted/40 ${isEstimated ? 'bg-yellow-950/20' : ''}`}
              >
                {/* Pay Date / Period */}
                <TableCell className="py-2 px-3 align-top whitespace-nowrap">
                  <span className="text-foreground">{row.pay_date}</span>
                  {(row.period_start || row.period_end) && (
                    <SubText>
                      {row.period_start?.slice(5)} – {row.period_end?.slice(5)}
                    </SubText>
                  )}
                  {isEstimated && (
                    <SubText>
                      <Tag variant="estimated">EST</Tag>
                    </SubText>
                  )}
                </TableCell>

                {/* Event */}
                <TableCell className="py-2 px-3 align-top max-w-[140px]">
                  {isRsu && <Tag variant="rsu">RSU VEST</Tag>}
                  {isBonus && <Tag variant="bonus">ANNUAL BONUS</Tag>}
                  {row.ps_comment ? (
                    <span className="text-gray-400 italic">{row.ps_comment}</span>
                  ) : !isRsu && !isBonus ? (
                    <span className="text-gray-500">—</span>
                  ) : null}
                </TableCell>

                {/* Gross Earnings */}
                <TableCell className="py-2 px-3 text-right align-top">
                  <WithYTD row={row} field="earnings_gross" allData={data}>
                    <AmountCell value={row.earnings_gross} variant="pos" />
                  </WithYTD>
                  {suppTags.length > 0 && <SubText>{suppTags}</SubText>}
                </TableCell>

                {/* Federal Tax */}
                <TableCell className="py-2 px-3 text-right align-top">
                  {fedTotal.value > 0 ? (
                    <WithYTD row={row} field="ps_fed_tax" allData={data}>
                      <span className="text-destructive">{fedTotal.format()}</span>
                    </WithYTD>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  {(row.ps_fed_tax_addl ?? 0) > 0 && (
                    <SubText>Incl. +{fmt(row.ps_fed_tax_addl)} addl</SubText>
                  )}
                  {(row.ps_fed_tax_refunded ?? 0) > 0 && (
                    <SubText>Refund −{fmt(row.ps_fed_tax_refunded)}</SubText>
                  )}
                </TableCell>

                {/* CA State Tax */}
                <TableCell className="py-2 px-3 text-right align-top">
                  {stateTotal.value > 0 ? (
                    <WithYTD row={row} field="ps_state_tax" allData={data}>
                      <span className="text-destructive">{stateTotal.format()}</span>
                    </WithYTD>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  {(row.ps_state_tax_addl ?? 0) > 0 && (
                    <SubText>Incl. +{fmt(row.ps_state_tax_addl)} addl</SubText>
                  )}
                </TableCell>

                {/* FICA & SDI */}
                <TableCell className="py-2 px-3 text-right align-top">
                  {ficaTotal.value > 0 ? (
                    <WithYTD row={row} field="ps_oasdi" allData={data}>
                      <span className="text-destructive">{ficaTotal.format()}</span>
                    </WithYTD>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                  {ficaTotal.value > 0 && (
                    <SubText>
                      O:{fmtShort(row.ps_oasdi) ?? '—'} / M:{fmtShort(row.ps_medicare) ?? '—'} / S:{fmtShort(row.ps_state_disability) ?? '—'}
                    </SubText>
                  )}
                </TableCell>

                {/* Pre-Tax Deductions */}
                <TableCell className="py-2 px-3 text-right align-top">
                  {pretaxTotal.value > 0 ? (
                    <span className="text-gray-300">{deductTags}</span>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                  {benefitsTotal.value > 0 && (
                    <SubText>M/D/V/FSA {fmtShort(benefitsTotal.value)}</SubText>
                  )}
                </TableCell>

                {/* Net Pay */}
                <TableCell className="py-2 px-3 text-right align-top">
                  {row.earnings_net_pay ? (
                    <WithYTD row={row} field="earnings_net_pay" allData={data}>
                      <span className="text-primary font-semibold">{fmt(row.earnings_net_pay)}</span>
                    </WithYTD>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>

                {/* Estimated */}
                <TableCell className="py-2 px-3 align-top">
                  <Checkbox
                    checked={isEstimated}
                    onCheckedChange={() => handleEstimatedToggle(row)}
                    disabled={isLoading[key]}
                  />
                </TableCell>

                {/* Actions */}
                {onRowEdited && (
                  <TableCell className="py-2 px-3 align-top">
                    <Button variant="ghost" size="sm" asChild className="h-7 w-7 p-0">
                      <a href={`/finance/payslips/entry?id=${row.payslip_id}`} title="Edit payslip">
                        <Edit className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
