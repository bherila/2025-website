'use client'

import { useState } from 'react'

import { Callout, fmtAmt, FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import { fetchWrapper } from '@/fetchWrapper'
import {
  type PalCarryforwardEntry,
  RENTAL_PHASEOUT_END,
  RENTAL_PHASEOUT_START,
  RENTAL_SPECIAL_ALLOWANCE,
} from '@/finance/8582/form8582'
import type { Form8582Lines } from '@/types/finance/tax-return'

interface Form8582PreviewProps {
  form8582: Form8582Lines
  year: number
  palCarryforwards: PalCarryforwardEntry[]
  onCarryforwardsChange: (entries: PalCarryforwardEntry[]) => void
}

export default function Form8582Preview({
  form8582,
  year,
  palCarryforwards,
  onCarryforwardsChange,
}: Form8582PreviewProps) {
  const {
    activities,
    totalPassiveIncome,
    totalPassiveLoss,
    totalPriorYearUnallowed,
    netPassiveResult,
    rentalAllowance,
    totalAllowedLoss,
    totalSuspendedLoss,
    isLossLimited,
    magi,
  } = form8582

  if (activities.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        No passive activity data found in reviewed K-1 documents.
        <br />
        Passive activities are reported in K-1 Box 2 (rental real estate) and Box 3 (other rental).
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Form 8582 — Passive Activity Loss Limitations</h2>
        <p className="text-xs text-muted-foreground">
          Limits passive activity losses to passive income. Excess losses are suspended and carried forward.
        </p>
      </div>

      {/* Part I — Per-Activity Breakdown */}
      <FormBlock title="Part I — Passive Activities">
        {activities.map((a, i) => (
          <div key={i}>
            {a.currentIncome !== 0 && (
              <FormLine
                label={`${a.activityName}${a.ein ? ` (EIN ${a.ein})` : ''}${a.isRentalRealEstate ? ' [Rental RE]' : ''} — income`}
                value={a.currentIncome}
              />
            )}
            {a.currentLoss !== 0 && (
              <FormLine
                label={`${a.activityName}${a.ein ? ` (EIN ${a.ein})` : ''}${a.isRentalRealEstate ? ' [Rental RE]' : ''} — loss`}
                value={a.currentLoss}
              />
            )}
            {a.priorYearUnallowed !== 0 && (
              <FormLine
                label={`${a.activityName} — prior-year unallowed loss`}
                value={a.priorYearUnallowed}
              />
            )}
          </div>
        ))}
        <FormTotalLine label="Line 1a — Total passive income" value={totalPassiveIncome} />
        <FormTotalLine label="Line 1b — Total passive loss" value={totalPassiveLoss} />
        {totalPriorYearUnallowed !== 0 && (
          <FormLine label="Line 1c — Prior-year unallowed losses" value={totalPriorYearUnallowed} />
        )}
        <FormTotalLine label="Line 1d — Combine lines 1a through 1c" value={netPassiveResult} double />
      </FormBlock>

      {/* Part II — Special Allowance */}
      {netPassiveResult < 0 && (
        <FormBlock title="Part II — Special Allowance for Rental Real Estate">
          <FormLine
            label="Modified AGI"
            value={magi}
          />
          <FormLine
            label={`Special allowance (${fmtAmt(RENTAL_SPECIAL_ALLOWANCE, 0)} max, phased out ${fmtAmt(RENTAL_PHASEOUT_START, 0)}–${fmtAmt(RENTAL_PHASEOUT_END, 0)} MAGI)`}
            value={rentalAllowance}
          />
        </FormBlock>
      )}

      {/* Part III — Result */}
      <FormBlock title="Part III — Allowed vs. Suspended Losses">
        <FormLine label="Total allowed passive loss this year" value={-totalAllowedLoss} />
        {isLossLimited ? (
          <>
            <FormTotalLine label="Suspended loss — carried forward" value={-totalSuspendedLoss} double />
            <Callout kind="warn" title="⚠ Passive Activity Loss Limitation Applies">
              <p>
                Net passive losses of <strong>{fmtAmt(Math.abs(netPassiveResult), 0)}</strong> exceed
                passive income of <strong>{fmtAmt(totalPassiveIncome, 0)}</strong>
                {rentalAllowance > 0 && (
                  <> plus the rental special allowance of <strong>{fmtAmt(rentalAllowance, 0)}</strong></>
                )}.
                The suspended loss of <strong>{fmtAmt(totalSuspendedLoss, 0)}</strong> carries
                forward to offset future passive income or disposition gains.
              </p>
            </Callout>
          </>
        ) : (
          <FormLine
            label="PAL status"
            raw={netPassiveResult >= 0
              ? '✓ Net passive income — no limitation applies'
              : `✓ All passive losses allowed (within $${RENTAL_SPECIAL_ALLOWANCE.toLocaleString()} special allowance)`}
          />
        )}
      </FormBlock>

      {/* Per-Activity Carryforward Table (A.4) */}
      {activities.some(a => a.suspendedLossCarryforward > 0 || a.allowedLossThisYear > 0) && (
        <FormBlock title="Worksheet 5 — Per-Activity Allowed / Suspended Allocation">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-3">Activity</th>
                  <th className="py-1 px-3 text-right">Total Loss</th>
                  <th className="py-1 px-3 text-right">Allowed This Year</th>
                  <th className="py-1 px-3 text-right">Suspended (Carryforward)</th>
                </tr>
              </thead>
              <tbody>
                {activities.filter(a => a.allowedLossThisYear > 0 || a.suspendedLossCarryforward > 0).map((a, i) => (
                  <tr key={i} className="border-b border-muted/30">
                    <td className="py-1 pr-3">
                      {a.activityName}
                      {a.isRentalRealEstate && <span className="ml-1 text-xs text-blue-600">[RE]</span>}
                    </td>
                    <td className="py-1 px-3 text-right tabular-nums">
                      {fmtAmt(Math.abs(a.currentLoss + a.priorYearUnallowed), 0)}
                    </td>
                    <td className="py-1 px-3 text-right tabular-nums">
                      {fmtAmt(a.allowedLossThisYear, 0)}
                    </td>
                    <td className="py-1 px-3 text-right tabular-nums font-medium text-amber-600">
                      {a.suspendedLossCarryforward > 0 ? fmtAmt(a.suspendedLossCarryforward, 0) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FormBlock>
      )}

      {/* Per-Activity overallGainOrLoss display (B.10) */}
      <FormBlock title="Per-Activity Net Gain/Loss">
        {activities.map((a, i) => (
          <FormLine
            key={i}
            label={`${a.activityName}${a.isRentalRealEstate ? ' [Rental RE]' : ''}`}
            value={a.overallGainOrLoss}
          />
        ))}
      </FormBlock>

      {/* Prior-Year Suspended Losses Input (A.2 — editable section) */}
      <PalCarryforwardInput
        year={year}
        carryforwards={palCarryforwards}
        onChange={onCarryforwardsChange}
      />
    </div>
  )
}

// ── PAL Carryforward Input Section ────────────────────────────────────────────

interface PalCarryforwardInputProps {
  year: number
  carryforwards: PalCarryforwardEntry[]
  onChange: (entries: PalCarryforwardEntry[]) => void
}

interface PalFormState {
  activity_name: string
  activity_ein: string
  ordinary_carryover: string
}

function PalCarryforwardInput({ year, carryforwards, onChange }: PalCarryforwardInputProps) {
  const [form, setForm] = useState<PalFormState>({
    activity_name: '',
    activity_ein: '',
    ordinary_carryover: '',
  })
  const [saving, setSaving] = useState(false)

  async function handleAdd(): Promise<void> {
    if (!form.activity_name || !form.ordinary_carryover) return
    setSaving(true)
    try {
      await fetchWrapper.post('/api/finance/pal-carryforwards', {
        tax_year: year,
        activity_name: form.activity_name,
        activity_ein: form.activity_ein || null,
        ordinary_carryover: parseFloat(form.ordinary_carryover),
        short_term_carryover: 0,
        long_term_carryover: 0,
      })
      const updated = (await fetchWrapper.get(`/api/finance/pal-carryforwards?year=${year}`)) as PalCarryforwardEntry[]
      onChange(Array.isArray(updated) ? updated : [])
      setForm({ activity_name: '', activity_ein: '', ordinary_carryover: '' })
    } catch (err) {
      console.error('Failed to save PAL carryforward', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(entry: PalCarryforwardEntry & { id?: number }): Promise<void> {
    if (!entry.id) return
    try {
      await fetchWrapper.delete(`/api/finance/pal-carryforwards/${entry.id}`, {})
      const updated = (await fetchWrapper.get(`/api/finance/pal-carryforwards?year=${year}`)) as PalCarryforwardEntry[]
      onChange(Array.isArray(updated) ? updated : [])
    } catch (err) {
      console.error('Failed to delete PAL carryforward', err)
    }
  }

  return (
    <FormBlock title="Prior-Year Suspended Losses (PAL Carryforwards)">
      <p className="text-xs text-muted-foreground mb-3">
        Enter prior-year Form 8582 suspended losses per activity. These carry forward to offset
        future passive income or are fully deductible when the activity is disposed of.
      </p>

      {carryforwards.length > 0 && (
        <div className="overflow-x-auto mb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1 pr-3">Activity</th>
                <th className="py-1 px-3">EIN</th>
                <th className="py-1 px-3 text-right">Ordinary Carryover</th>
                <th className="py-1 px-3 text-right w-16"></th>
              </tr>
            </thead>
            <tbody>
              {carryforwards.map((cf, i) => (
                <tr key={i} className="border-b border-muted/30">
                  <td className="py-1 pr-3">{cf.activity_name}</td>
                  <td className="py-1 px-3 text-muted-foreground">{cf.activity_ein ?? '—'}</td>
                  <td className="py-1 px-3 text-right tabular-nums">{fmtAmt(cf.ordinary_carryover)}</td>
                  <td className="py-1 px-3 text-right">
                    <button
                      type="button"
                      className="text-xs text-red-500 hover:text-red-700"
                      onClick={() => handleDelete(cf as PalCarryforwardEntry & { id?: number })}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs text-muted-foreground">Activity Name</label>
          <input
            type="text"
            className="w-full border rounded px-2 py-1 text-sm"
            value={form.activity_name}
            onChange={(e) => setForm(s => ({ ...s, activity_name: e.target.value }))}
            placeholder="e.g. AQR Diversified Arbitrage Fund"
          />
        </div>
        <div className="w-32">
          <label className="text-xs text-muted-foreground">EIN (optional)</label>
          <input
            type="text"
            className="w-full border rounded px-2 py-1 text-sm"
            value={form.activity_ein}
            onChange={(e) => setForm(s => ({ ...s, activity_ein: e.target.value }))}
            placeholder="20-1234567"
          />
        </div>
        <div className="w-36">
          <label className="text-xs text-muted-foreground">Ordinary Carryover</label>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 text-sm"
            value={form.ordinary_carryover}
            onChange={(e) => setForm(s => ({ ...s, ordinary_carryover: e.target.value }))}
            placeholder="-6280"
            step="0.01"
          />
        </div>
        <button
          type="button"
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          onClick={handleAdd}
          disabled={saving || !form.activity_name || !form.ordinary_carryover}
        >
          {saving ? 'Saving…' : 'Add'}
        </button>
      </div>
    </FormBlock>
  )
}
