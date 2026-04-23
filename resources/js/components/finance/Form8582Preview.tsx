'use client'

import { useState } from 'react'

import { Callout, fmtAmt, FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import { fetchWrapper } from '@/fetchWrapper'
import {
  type PalCarryforwardEntry,
  RENTAL_PHASEOUT_END,
  RENTAL_PHASEOUT_START,
  RENTAL_SPECIAL_ALLOWANCE,
  TAX_LOSS_CARRYFORWARD_ENDPOINT,
} from '@/finance/8582/form8582'
import type { Form8582Lines } from '@/types/finance/tax-return'

interface Form8582PreviewProps {
  form8582: Form8582Lines
  year: number
  palCarryforwards: PalCarryforwardEntry[]
  onCarryforwardsChange: (entries: PalCarryforwardEntry[]) => void
  realEstateProfessional: boolean
  onRealEstateProfessionalChange: (v: boolean) => void
}

export default function Form8582Preview({
  form8582,
  year,
  palCarryforwards,
  onCarryforwardsChange,
  realEstateProfessional,
  onRealEstateProfessionalChange,
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
    netDeductionToReturn,
    isLossLimited,
    magi,
  } = form8582

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Form 8582 — Passive Activity Loss Limitations</h2>
        <p className="text-xs text-muted-foreground">
          Limits passive activity losses to passive income. Excess losses are suspended and carried forward.
        </p>
      </div>

      {/* Real Estate Professional Election (§469(c)(7)) */}
      <FormBlock title="Elections">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={realEstateProfessional}
            onChange={(e) => onRealEstateProfessionalChange(e.target.checked)}
          />
          Real estate professional (§469(c)(7)) — rental activities treated as non-passive
        </label>
        <p className="text-xs text-muted-foreground mt-1">
          Requires: &gt;750 hours of material participation in real property trades/businesses AND more than half
          of personal services in real property trades/businesses. When checked, rental RE activities with
          active participation are excluded from passive activity limitations.
        </p>
      </FormBlock>

      {/* Part I — Per-Activity Breakdown */}
      <FormBlock title="Part I — Passive Activities">
        {realEstateProfessional && (
          <Callout kind="info" title="Real Estate Professional Election (§469(c)(7))">
            <p>
              Rental RE activities with active participation are treated as <strong>non-passive</strong> and
              excluded from this form. They flow directly to Schedule E as non-passive income/loss.
            </p>
          </Callout>
        )}
        {activities.length === 0 ? (
          <div className="px-3 py-6 text-center text-muted-foreground text-sm">
            No passive activity data found in reviewed K-1 documents.
            <br />
            Passive activities are reported in passive K-1 Box 1, Box 2 (rental real estate), and Box 3 (other rental).
          </div>
        ) : (
          <>
            {activities.map((a, i) => (
              <div key={i}>
                {a.currentIncome !== 0 && (
                  <FormLine
                    label={`${a.activityName}${a.ein ? ` (EIN ${a.ein})` : ''}${a.isRentalRealEstate ? ' [Rental RE]' : ''}${!a.activeParticipation ? ' [No Active Participation]' : ''} — income`}
                    value={a.currentIncome}
                  />
                )}
                {a.currentLoss !== 0 && (
                  <FormLine
                    label={`${a.activityName}${a.ein ? ` (EIN ${a.ein})` : ''}${a.isRentalRealEstate ? ' [Rental RE]' : ''}${!a.activeParticipation ? ' [No Active Participation]' : ''} — loss`}
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
          </>
        )}
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
        {netDeductionToReturn > 0 && (
          <FormLine label="Net deduction to return (Schedule E)" value={-netDeductionToReturn} />
        )}
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
      {activities.length > 0 && (
        <FormBlock title="Per-Activity Net Gain/Loss">
          {activities.map((a, i) => (
            <FormLine
              key={i}
              label={`${a.activityName}${a.isRentalRealEstate ? ' [Rental RE]' : ''}`}
              value={a.overallGainOrLoss}
            />
          ))}
        </FormBlock>
      )}

      {/* Prior-Year Suspended Losses Input (A.2 — editable section) */}
      <PalCarryforwardInput
        year={year}
        form8582={form8582}
        carryforwards={palCarryforwards}
        onChange={onCarryforwardsChange}
      />
    </div>
  )
}

// ── PAL Carryforward Input Section ────────────────────────────────────────────

interface PalCarryforwardInputProps {
  year: number
  form8582: Form8582Lines
  carryforwards: PalCarryforwardEntry[]
  onChange: (entries: PalCarryforwardEntry[]) => void
}

interface PalFormState {
  activity_name: string
  activity_ein: string
  ordinary_carryover: string
}

function PalCarryforwardInput({ year, form8582, carryforwards, onChange }: PalCarryforwardInputProps) {
  const [form, setForm] = useState<PalFormState>({
    activity_name: '',
    activity_ein: '',
    ordinary_carryover: '',
  })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [commitMessage, setCommitMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)

  async function reloadCarryforwards(targetYear: number): Promise<PalCarryforwardEntry[]> {
    const updated = (await fetchWrapper.get(`${TAX_LOSS_CARRYFORWARD_ENDPOINT}?year=${targetYear}`)) as unknown
    if (!Array.isArray(updated)) {
      throw new Error(`Expected carryforwards array for ${targetYear}`)
    }

    return updated as PalCarryforwardEntry[]
  }

  function resetForm(): void {
    setForm({ activity_name: '', activity_ein: '', ordinary_carryover: '' })
    setEditingId(null)
  }

  async function handleAdd(): Promise<void> {
    if (!form.activity_name || !form.ordinary_carryover) return
    setSaving(true)
    try {
      const payload = {
        activity_name: form.activity_name,
        activity_ein: form.activity_ein || null,
        ordinary_carryover: parseFloat(form.ordinary_carryover),
        short_term_carryover: 0,
        long_term_carryover: 0,
      }
      if (editingId === null) {
        await fetchWrapper.post(TAX_LOSS_CARRYFORWARD_ENDPOINT, {
          tax_year: year,
          ...payload,
        })
      } else {
        await fetchWrapper.put(`${TAX_LOSS_CARRYFORWARD_ENDPOINT}/${editingId}`, payload)
      }
      onChange(await reloadCarryforwards(year))
      resetForm()
    } catch (err) {
      console.error('Failed to save PAL carryforward', err)
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(entry: PalCarryforwardEntry): void {
    setEditingId(entry.id ?? null)
    setForm({
      activity_name: entry.activity_name,
      activity_ein: entry.activity_ein ?? '',
      ordinary_carryover: String(entry.ordinary_carryover),
    })
  }

  async function handleDelete(entry: PalCarryforwardEntry): Promise<void> {
    if (entry.id === undefined) return
    try {
      await fetchWrapper.delete(`${TAX_LOSS_CARRYFORWARD_ENDPOINT}/${entry.id}`, {})
      onChange(await reloadCarryforwards(year))
    } catch (err) {
      console.error('Failed to delete PAL carryforward', err)
    }
  }

  async function handleCommitForward(): Promise<void> {
    setCommitting(true)
    setCommitMessage(null)
    const nextYear = year + 1
    try {
      const existingNextYear = await reloadCarryforwards(nextYear)
      const existingByName = new Map(existingNextYear.map((entry) => [entry.activity_name, entry]))

      const results = await Promise.allSettled(
        form8582.activities.map(async (activity) => {
          const existing = existingByName.get(activity.activityName)
          if (activity.suspendedLossCarryforward > 0) {
            await fetchWrapper.post(TAX_LOSS_CARRYFORWARD_ENDPOINT, {
              tax_year: nextYear,
              activity_name: activity.activityName,
              activity_ein: activity.ein ?? null,
              ordinary_carryover: -activity.suspendedLossCarryforward,
              short_term_carryover: 0,
              long_term_carryover: 0,
            })
            return
          }

          if (existing?.id !== undefined) {
            await fetchWrapper.delete(`${TAX_LOSS_CARRYFORWARD_ENDPOINT}/${existing.id}`, {})
          }
        }),
      )

      const failedActivities = results.flatMap((result, index) =>
        result.status === 'rejected' ? [form8582.activities[index]?.activityName ?? `activity-${index}`] : [],
      )
      if (failedActivities.length > 0) {
        throw new Error(`Failed to persist carryforwards for: ${failedActivities.join(', ')}`)
      }
      setCommitMessage({ kind: 'success', text: `Saved suspended losses to ${nextYear}.` })
    } catch (err) {
      console.error('Failed to commit suspended PAL carryforwards forward', err)
      const detail = err instanceof Error ? err.message : 'Unknown error'
      setCommitMessage({ kind: 'error', text: `Could not save to ${nextYear}: ${detail}` })
    } finally {
      setCommitting(false)
    }
  }

  return (
    <FormBlock title="Prior-Year Suspended Losses (PAL Carryforwards)">
      <p className="text-xs text-muted-foreground mb-3">
        Saved opening carryforwards for {year} flow into the prior-year unallowed loss lines above.
        Use “Save suspended losses to {year + 1}” after reviewing this year’s Form 8582 to persist
        next year’s opening balances.
      </p>

      {carryforwards.length > 0 && (
        <div className="overflow-x-auto mb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1 pr-3">Activity</th>
                <th className="py-1 px-3">EIN</th>
                <th className="py-1 px-3 text-right">Ordinary Carryover</th>
                <th className="py-1 px-3 text-right w-28"></th>
              </tr>
            </thead>
            <tbody>
              {carryforwards.map((cf, i) => (
                <tr key={i} className="border-b border-muted/30">
                  <td className="py-1 pr-3">{cf.activity_name}</td>
                  <td className="py-1 px-3 text-muted-foreground">{cf.activity_ein ?? '—'}</td>
                  <td className="py-1 px-3 text-right tabular-nums">{fmtAmt(cf.ordinary_carryover)}</td>
                  <td className="py-1 px-3">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        className="text-xs text-blue-600 hover:text-blue-800"
                        onClick={() => handleEdit(cf)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-xs text-red-500 hover:text-red-700"
                        onClick={() => handleDelete(cf)}
                      >
                        ✕
                      </button>
                    </div>
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
            aria-label="Activity Name"
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
            aria-label="EIN"
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
            aria-label="Ordinary Carryover"
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
          {saving ? 'Saving…' : editingId === null ? 'Add' : 'Save'}
        </button>
        {editingId !== null && (
          <button
            type="button"
            className="px-3 py-1 text-sm border rounded hover:bg-muted"
            onClick={resetForm}
          >
            Cancel
          </button>
        )}
      </div>

      <div className="mt-4 rounded-md border border-dashed border-border/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Persist this year&apos;s suspended losses as opening carryforwards for {year + 1}.
          </div>
          <button
            type="button"
            className="px-3 py-1 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
            onClick={handleCommitForward}
            disabled={committing || form8582.activities.length === 0}
          >
            {committing ? `Saving ${year + 1}…` : `Save suspended losses to ${year + 1}`}
          </button>
        </div>
        {commitMessage && (
          <div
            role={commitMessage.kind === 'error' ? 'alert' : 'status'}
            className={`mt-2 text-xs ${commitMessage.kind === 'error' ? 'text-red-600' : 'text-emerald-700'}`}
          >
            {commitMessage.text}
          </div>
        )}
      </div>
    </FormBlock>
  )
}
