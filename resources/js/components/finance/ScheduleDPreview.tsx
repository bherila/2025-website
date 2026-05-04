'use client'

import currency from 'currency.js'
import { ChevronLeft } from 'lucide-react'

import { isFK1StructuredData } from '@/components/finance/k1'
import { Callout, fmtAmt, FormBlock, FormLine, FormSubLine, FormTotalLine, InfoTooltip, parseFieldVal } from '@/components/finance/tax-preview-primitives'
import { Button } from '@/components/ui/button'
import { buildCapitalGainsReportFromTaxDocuments } from '@/lib/finance/capitalGainsReporting'
import { getK1CodeItems, parseK1Field, resolve11SCharacter } from '@/lib/finance/k1Utils'
import type { ScheduleDBrokerLine } from '@/lib/finance/scheduleDBrokerGains'
import { getDocAmounts } from '@/lib/finance/taxDocumentUtils'
import { scheduleD } from '@/lib/tax/scheduleD'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'
import { FORM_TYPE_LABELS } from '@/types/finance/tax-document'
import type { CapitalLossCarryoverLines } from '@/types/finance/tax-return'

// ── Main component ────────────────────────────────────────────────────────────

interface ScheduleDPreviewProps {
  reviewedK1Docs: TaxDocument[]
  reviewed1099Docs: TaxDocument[]
  selectedYear?: number
  priorYearCapitalLossCarryover?: Pick<CapitalLossCarryoverLines, 'shortTermCarryover' | 'longTermCarryover'> | null
  onOpenDoc?: (docId: number) => void
  onGoToForm1040?: () => void
}

interface ScheduleDCarryoverOptions {
  shortTermCapitalLossCarryover?: number
  longTermCapitalLossCarryover?: number
}

interface ScheduleDDetailSource {
  formLabel: string
  docId: number
}

interface CapGainLine {
  label: string
  amount: number
  note?: string
  boxRef?: string
  detail?: ScheduleDDetailSource
}

function scheduleLossCarryover(value: number | null | undefined): number {
  if (value == null || value === 0) {
    return 0
  }

  return currency(0).subtract(Math.abs(value)).value
}

function formLabel(formType: string): string {
  return FORM_TYPE_LABELS[formType] ?? formType.toUpperCase()
}

function lineDetailProps(line: CapGainLine, onOpenDoc?: (docId: number) => void) {
  if (!line.detail || !onOpenDoc) {
    return {}
  }

  return {
    onDetails: () => onOpenDoc(line.detail!.docId),
    detailsLabel: 'Detail',
    detailsTooltip: `Open ${line.detail.formLabel} detail`,
  }
}

export interface ScheduleDComputedData {
  schD: ReturnType<typeof scheduleD>
  netST: number
  netLT: number
  combined: number
  appliedToReturn: number
  carryforward: number
  ambiguous11SCount: number
  ambiguous11SAmount: number
  has11SAmbiguous: boolean
}

export function computeScheduleD(
  reviewedK1Docs: TaxDocument[],
  reviewed1099Docs: TaxDocument[],
  carryovers: ScheduleDCarryoverOptions = {},
): ScheduleDComputedData {
  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  const sec1256Sources: { amount: number; lt: number; st: number }[] = []
  for (const { data } of k1Parsed) {
    const cItems = getK1CodeItems(data, '11', 'C')
    for (const item of cItems) {
      const n = parseFieldVal(item.value) ?? 0
      if (n !== 0) {
        sec1256Sources.push({
          amount: n,
          lt: currency(n).multiply(0.6).value,
          st: currency(n).multiply(0.4).value,
        })
      }
    }
  }

  const total6781LT = sec1256Sources.reduce((acc, source) => acc.add(source.lt), currency(0)).value
  const total6781ST = sec1256Sources.reduce((acc, source) => acc.add(source.st), currency(0)).value

  // Box 11S — non-portfolio capital gain/loss (e.g., AQR/trader-fund supplemental statements).
  // Each sub-line's notes or user override must identify ST/LT character before routing.
  let nonPortfolio11sST = currency(0)
  let nonPortfolio11sLT = currency(0)
  let ambiguous11SCount = 0
  let ambiguous11SAmount = currency(0)
  for (const { data } of k1Parsed) {
    const sItems = getK1CodeItems(data, '11', 'S')
    for (const item of sItems) {
      const n = parseFieldVal(item.value) ?? 0
      if (n === 0) continue
      const character = resolve11SCharacter(item)
      if (character === 'short') {
        nonPortfolio11sST = nonPortfolio11sST.add(n)
      } else if (character === 'long') {
        nonPortfolio11sLT = nonPortfolio11sLT.add(n)
      } else {
        ambiguous11SCount += 1
        ambiguous11SAmount = ambiguous11SAmount.add(n)
      }
    }
  }

  const capitalGainsReport = buildCapitalGainsReportFromTaxDocuments(reviewed1099Docs)

  const brokerLineAmount = (line: ScheduleDBrokerLine): number =>
    capitalGainsReport.scheduleDLineAmounts[line] ?? 0

  const totalCapitalGainDistributions = reviewed1099Docs.reduce((acc, doc) => {
    const links = doc.account_links ?? []
    if (links.length > 0) {
      return links.reduce((linkAcc, link) => {
        if (link.form_type !== '1099_div' && link.form_type !== '1099_div_c') {
          return linkAcc
        }

        return linkAcc.add(getDocAmounts(doc, link).capGain ?? 0)
      }, acc)
    }

    if (doc.form_type !== '1099_div' && doc.form_type !== '1099_div_c') {
      return acc
    }

    return acc.add(getDocAmounts(doc).capGain ?? 0)
  }, currency(0)).value

  const k1ST = k1Parsed.reduce((acc, { data }) => acc.add(parseK1Field(data, '8')), currency(0))
    .add(nonPortfolio11sST).value
  const k1LT = k1Parsed.reduce((acc, { data }) => acc
    .add(parseK1Field(data, '9a'))
    .add(parseK1Field(data, '9b'))
    .add(parseK1Field(data, '9c'))
    .add(parseK1Field(data, '10')), currency(0))
    .add(nonPortfolio11sLT).value

  const schD = scheduleD({
    line1a_gain_loss: brokerLineAmount('1a'),
    line1b_gain_loss: brokerLineAmount('1b'),
    line2_gain_loss: brokerLineAmount('2'),
    line3_gain_loss: currency(brokerLineAmount('3')).add(total6781ST).value,
    line5: k1ST,
    line6_carryover: scheduleLossCarryover(carryovers.shortTermCapitalLossCarryover),
    line8a_gain_loss: brokerLineAmount('8a'),
    line8b_gain_loss: brokerLineAmount('8b'),
    line9_gain_loss: brokerLineAmount('9'),
    line10_gain_loss: currency(brokerLineAmount('10')).add(total6781LT).value,
    line12: k1LT,
    line13_capital_gain_distributions: totalCapitalGainDistributions,
    line14_carryover: scheduleLossCarryover(carryovers.longTermCapitalLossCarryover),
  })

  const combined = schD.schD_line16
  const appliedToReturn = schD.schD_line21 < 0 ? schD.schD_line21 : 0

  return {
    schD,
    netST: schD.schD_line7,
    netLT: schD.schD_line15,
    combined,
    appliedToReturn,
    carryforward: combined < 0 ? currency(combined).subtract(appliedToReturn).value : 0,
    ambiguous11SCount,
    ambiguous11SAmount: ambiguous11SAmount.value,
    has11SAmbiguous: ambiguous11SCount > 0,
  }
}

export default function ScheduleDPreview({
  reviewedK1Docs,
  reviewed1099Docs,
  selectedYear,
  priorYearCapitalLossCarryover = null,
  onOpenDoc,
  onGoToForm1040,
}: ScheduleDPreviewProps) {
  const taxYear = selectedYear ?? new Date().getFullYear()
  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  if (k1Parsed.length === 0 && reviewed1099Docs.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        No reviewed documents found. Review K-1 and 1099-B documents to see Schedule D analysis.
      </div>
    )
  }

  // ── Form 6781 — Section 1256 ──────────────────────────────────────────────
  type Sec1256Source = { label: string; amount: number; lt: number; st: number; detail: ScheduleDDetailSource }
  const sec1256Sources: Sec1256Source[] = []

  for (const { doc, data } of k1Parsed) {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    const cItems = getK1CodeItems(data, '11', 'C')
    for (const item of cItems) {
      const n = parseFieldVal(item.value) ?? 0
      if (n !== 0) {
        sec1256Sources.push({
          label: `${partnerName} — K-1 Box 11C`,
          amount: n,
          lt: currency(n).multiply(0.6).value,
          st: currency(n).multiply(0.4).value,
          detail: { formLabel: 'K-1', docId: doc.id },
        })
      }
    }
  }

  const total6781 = sec1256Sources.reduce((acc, source) => acc.add(source.amount), currency(0)).value
  const total6781LT = sec1256Sources.reduce((acc, source) => acc.add(source.lt), currency(0)).value
  const total6781ST = sec1256Sources.reduce((acc, source) => acc.add(source.st), currency(0)).value

  // ── broker_1099 / 1099-B totals ───────────────────────────────────────────
  // Reads the summary ST/LT figures from reviewed broker_1099 and 1099_b documents.
  // Our imported broker_1099 documents (stored via finance:tax-import or Tax Preview UI)
  // use field names like b_st_reported_gain_loss / b_lt_gain_loss.
  // AI-extracted 1099_b documents use total_realized_gain_loss with is_short_term per lot.
  const capitalGainsReport = buildCapitalGainsReportFromTaxDocuments(reviewed1099Docs)
  const hasBrokerData = capitalGainsReport.sources.length > 0
  const brokerLineAmount = (line: ScheduleDBrokerLine): number =>
    capitalGainsReport.scheduleDLineAmounts[line] ?? 0
  const priorYearShortCarryover = priorYearCapitalLossCarryover?.shortTermCarryover ?? 0
  const priorYearLongCarryover = priorYearCapitalLossCarryover?.longTermCarryover ?? 0

  // ── Short-term capital gains/losses ──────────────────────────────────────
  const stLines: CapGainLine[] = []
  const ambiguous11SLines: CapGainLine[] = []

  let has11sAmbiguous = false

  for (const { doc, data } of k1Parsed) {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    const box8 = parseK1Field(data, '8')
    if (box8 !== 0) {
      stLines.push({ label: `${partnerName} — K-1 Box 8`, amount: box8, boxRef: '5', detail: { formLabel: 'K-1', docId: doc.id } })
    }
    // Box 11S — non-portfolio capital gain/loss (AQR/trader-fund supplemental statements).
    // Only the lines whose notes mark them as short-term land on Schedule D line 5.
    const sItems = getK1CodeItems(data, '11', 'S')
    for (const item of sItems) {
      const n = parseFieldVal(item.value) ?? 0
      if (n === 0) continue
      const character = resolve11SCharacter(item)
      if (character === 'short') {
        const line: CapGainLine = {
          label: `${partnerName} — K-1 Box 11S (S/T non-portfolio)`,
          amount: n,
          boxRef: '5',
          detail: { formLabel: 'K-1', docId: doc.id },
        }
        if (item.notes) line.note = item.notes
        stLines.push(line)
      } else if (character === undefined) {
        has11sAmbiguous = true
        ambiguous11SLines.push({
          label: `${partnerName} — K-1 Box 11S (character needed)`,
          amount: n,
          note: item.notes ?? 'Notes did not identify S/T or L/T character.',
        })
      }
    }
  }

  // Form 6781 40% ST allocation
  for (const src of sec1256Sources) {
    if (src.st !== 0) {
      stLines.push({
        label: `${src.label} — Form 6781 40% S/T allocation`,
        amount: src.st,
        note: '40% of Section 1256 gain/(loss) is always short-term',
        boxRef: '3',
        detail: src.detail,
      })
    }
  }

  // broker_1099 / 1099-B short-term
  if (hasBrokerData) {
    for (const src of capitalGainsReport.sources) {
      if (src.line === '1a' || src.line === '1b' || src.line === '2' || src.line === '3') {
        stLines.push({
          label: src.label,
          amount: src.amount,
          boxRef: src.line,
          ...(src.detail ? { detail: src.detail } : {}),
          note: src.reportingMode === 'schedule_d_summary' ? 'Reporting mode: Schedule D Summary' : `Reporting mode: ${src.reportingMode === 'form_8949_summary' ? 'Form 8949 Summary' : 'Form 8949 Individual Transactions'}`,
        })
      }
    }
  } else {
    stLines.push({
      label: 'Brokerage 1099-B (not yet uploaded)',
      amount: 0,
      note: 'Upload and review a 1099-B or broker_1099 document to include brokerage transactions',
      boxRef: '1a',
    })
  }
  if (priorYearShortCarryover > 0) {
    stLines.push({
      label: `${taxYear - 1} short-term capital loss carryover`,
      amount: scheduleLossCarryover(priorYearShortCarryover),
      note: `Pulled from the ${taxYear - 1} tax preview return's capital loss carryover calculation.`,
      boxRef: '6',
    })
  }

  // ── Long-term capital gains/losses ────────────────────────────────────────
  const ltLines: CapGainLine[] = []

  for (const { doc, data } of k1Parsed) {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    const box9a = parseK1Field(data, '9a')
    const box9b = parseK1Field(data, '9b')
    const box9c = parseK1Field(data, '9c')
    const box10 = parseK1Field(data, '10')

    if (box9a !== 0) ltLines.push({ label: `${partnerName} — K-1 Box 9a (L/T)`, amount: box9a, boxRef: '12', detail: { formLabel: 'K-1', docId: doc.id } })
    if (box9b !== 0)
      ltLines.push({ label: `${partnerName} — K-1 Box 9b (28% rate)`, amount: box9b, note: '28% collectibles rate', boxRef: '12', detail: { formLabel: 'K-1', docId: doc.id } })
    if (box9c !== 0)
      ltLines.push({ label: `${partnerName} — K-1 Box 9c (§1250 unrec.)`, amount: box9c, note: 'Unrecaptured §1250 gain', boxRef: '12', detail: { formLabel: 'K-1', docId: doc.id } })
    if (box10 !== 0)
      ltLines.push({ label: `${partnerName} — K-1 Box 10 (§1231)`, amount: box10, note: '§1231 gain flows to Part II', boxRef: '12', detail: { formLabel: 'K-1', docId: doc.id } })

    // Box 11S — long-term sub-lines. Ambiguous lines are shown separately below instead of routed.
    const sItems = getK1CodeItems(data, '11', 'S')
    for (const item of sItems) {
      const n = parseFieldVal(item.value) ?? 0
      if (n === 0) continue
      const character = resolve11SCharacter(item)
      if (character === 'long') {
        const line: CapGainLine = {
          label: `${partnerName} — K-1 Box 11S (L/T non-portfolio)`,
          amount: n,
          boxRef: '12',
          detail: { formLabel: 'K-1', docId: doc.id },
        }
        if (item.notes) line.note = item.notes
        ltLines.push(line)
      }
    }
  }

  // Form 6781 60% LT allocation
  for (const src of sec1256Sources) {
    if (src.lt !== 0) {
      ltLines.push({
        label: `${src.label} — Form 6781 60% L/T allocation`,
        amount: src.lt,
        note: '60% of Section 1256 gain/(loss) is always long-term',
        boxRef: '10',
        detail: src.detail,
      })
    }
  }

  // broker_1099 / 1099-B long-term
  if (hasBrokerData) {
    for (const src of capitalGainsReport.sources) {
      if (src.line === '8a' || src.line === '8b' || src.line === '9' || src.line === '10') {
        ltLines.push({
          label: src.label,
          amount: src.amount,
          boxRef: src.line,
          ...(src.detail ? { detail: src.detail } : {}),
          note: src.reportingMode === 'schedule_d_summary' ? 'Reporting mode: Schedule D Summary' : `Reporting mode: ${src.reportingMode === 'form_8949_summary' ? 'Form 8949 Summary' : 'Form 8949 Individual Transactions'}`,
        })
      }
    }
  } else {
    ltLines.push({
      label: 'Brokerage 1099-B (not yet uploaded)',
      amount: 0,
      note: 'Upload and review a 1099-B or broker_1099 document to include brokerage transactions',
      boxRef: '8a',
    })
  }
  let totalCapitalGainDistributions = currency(0)
  for (const doc of reviewed1099Docs) {
    const links = doc.account_links ?? []
    if (links.length > 0) {
      for (const link of links) {
        if (link.form_type !== '1099_div' && link.form_type !== '1099_div_c') {
          continue
        }
        const capGain = getDocAmounts(doc, link).capGain ?? 0
        if (capGain !== 0) {
          totalCapitalGainDistributions = totalCapitalGainDistributions.add(capGain)
          ltLines.push({
            label: `${link.account?.acct_name ?? doc.original_filename ?? '1099-DIV'} — capital gain distributions`,
            amount: capGain,
            boxRef: '13',
            detail: { formLabel: formLabel(link.form_type), docId: doc.id },
          })
        }
      }
    } else if (doc.form_type === '1099_div' || doc.form_type === '1099_div_c') {
      const capGain = getDocAmounts(doc).capGain ?? 0
      if (capGain !== 0) {
        totalCapitalGainDistributions = totalCapitalGainDistributions.add(capGain)
        ltLines.push({
          label: `${((doc.parsed_data ?? {}) as Record<string, unknown>).payer_name as string | undefined ?? doc.account?.acct_name ?? doc.original_filename ?? '1099-DIV'} — capital gain distributions`,
          amount: capGain,
          boxRef: '13',
          detail: { formLabel: formLabel(doc.form_type), docId: doc.id },
        })
      }
    }
  }
  if (priorYearLongCarryover > 0) {
    ltLines.push({
      label: `${taxYear - 1} long-term capital loss carryover`,
      amount: scheduleLossCarryover(priorYearLongCarryover),
      note: `Pulled from the ${taxYear - 1} tax preview return's capital loss carryover calculation.`,
      boxRef: '14',
    })
  }

  // ── Totals via lib/tax/scheduleD ─────────────────────────────────────────
  // Aggregate K-1 ST from Box 8 lines and LT from Box 9a/9b/9c/10 lines
  const k1ST = stLines
    .filter((l) => l.label.includes('K-1'))
    .reduce((acc, l) => acc.add(l.amount), currency(0)).value
  const k1LT = ltLines
    .filter((l) => l.label.includes('K-1'))
    .reduce((acc, l) => acc.add(l.amount), currency(0)).value

  const schD = scheduleD({
    line1a_gain_loss: brokerLineAmount('1a'), // ST brokerage summary without Form 8949 detail
    line1b_gain_loss: brokerLineAmount('1b'),
    line2_gain_loss: brokerLineAmount('2'),
    line3_gain_loss: currency(brokerLineAmount('3')).add(total6781ST).value,
    line5: k1ST,                        // ST from K-1 partnerships (Line 5)
    line6_carryover: scheduleLossCarryover(priorYearShortCarryover),
    line8a_gain_loss: brokerLineAmount('8a'), // LT brokerage summary without Form 8949 detail
    line8b_gain_loss: brokerLineAmount('8b'),
    line9_gain_loss: brokerLineAmount('9'),
    line10_gain_loss: currency(brokerLineAmount('10')).add(total6781LT).value,
    line12: k1LT,                       // LT from K-1 partnerships (Line 12)
    line13_capital_gain_distributions: totalCapitalGainDistributions.value,
    line14_carryover: scheduleLossCarryover(priorYearLongCarryover),
  })

  const netST = schD.schD_line7
  const netLT = schD.schD_line15
  const combined = schD.schD_line16
  const appliedToReturn = schD.schD_line21 < 0 ? schD.schD_line21 : 0
  const carryforward = combined < 0 ? currency(combined).subtract(appliedToReturn).value : 0

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Schedule D — Capital Gains &amp; Losses</h2>
        <p className="text-xs text-muted-foreground">
          Capital gains, losses, and Section 1256 contract analysis.
        </p>
      </div>

      {/* Form 6781 */}
      {sec1256Sources.length > 0 && (
        <>
          <FormBlock title="Form 6781 — Section 1256 Contracts &amp; Straddles">
            {sec1256Sources.map((src, i) => (
              <div key={i}>
                <FormLine
                  label={src.label}
                  value={src.amount}
                  {...lineDetailProps({ label: src.label, amount: src.amount, detail: src.detail }, onOpenDoc)}
                />
                <FormSubLine
                  text={`60% long-term = ${fmtAmt(src.lt)} · 40% short-term = ${fmtAmt(src.st)} → Form 6781 Part I`}
                />
              </div>
            ))}
            <FormTotalLine label="Total Sec. 1256 gain/(loss)" value={total6781} />
          </FormBlock>
          <Callout kind="info" title="ℹ Section 1256 Contracts">
            <p>
              Section 1256 contracts are marked to market at year-end. 60% of the gain/loss is treated as long-term
              regardless of holding period. Enter on Form 6781, Part I. The 60%/40% split then flows to Schedule D.
            </p>
          </Callout>
        </>
      )}

      {has11sAmbiguous && (
        <Callout kind="warn" title="⚠ Box 11S — Confirm S/T vs. L/T character">
          <p>
            One or more K-1 Box 11S lines could not be classified as short-term or long-term from their notes.
            Those amounts are not included in Schedule D totals until you open the K-1 review modal and pick
            Short-term or Long-term in the new S/T or L/T column.
          </p>
        </Callout>
      )}

      {ambiguous11SLines.length > 0 && (
        <FormBlock title="Box 11S — Unclassified Non-Portfolio Capital Gain / (Loss)">
          {ambiguous11SLines.map((line, i) => (
            <div key={i}>
              <FormLine
                label={(
                  <span className="inline-flex items-center gap-1">
                    {line.label}
                    <InfoTooltip>
                      This line is intentionally excluded from Schedule D until you open the K-1 review modal and pick
                      Short-term or Long-term in the new S/T or L/T column.
                    </InfoTooltip>
                  </span>
                )}
                value={line.amount}
              />
              {line.note && <FormSubLine text={line.note} />}
            </div>
          ))}
          <FormTotalLine
            label="Not yet routed to Schedule D"
            value={ambiguous11SLines.reduce((acc, line) => acc.add(line.amount), currency(0)).value}
          />
        </FormBlock>
      )}

      {/* Part I and II */}
      <div className="grid grid-cols-1 gap-4">
        <FormBlock title="Schedule D Part I — Short-Term">
          {stLines.map((line, i) => (
            <div key={i}>
              <FormLine
                {...(line.boxRef ? { boxRef: line.boxRef } : {})}
                label={line.label}
                value={line.amount}
                {...lineDetailProps(line, onOpenDoc)}
              />
              {line.note && <FormSubLine text={line.note} />}
            </div>
          ))}
          {stLines.length === 0 && <FormLine label="No short-term items" raw="—" />}
          <FormTotalLine boxRef="7" label="Net Short-Term" value={netST} />
        </FormBlock>

        <FormBlock title="Schedule D Part II — Long-Term">
          {ltLines.map((line, i) => (
            <div key={i}>
              <FormLine
                {...(line.boxRef ? { boxRef: line.boxRef } : {})}
                label={line.label}
                value={line.amount}
                {...lineDetailProps(line, onOpenDoc)}
              />
              {line.note && <FormSubLine text={line.note} />}
            </div>
          ))}
          {ltLines.length === 0 && <FormLine label="No long-term items" raw="—" />}
          <FormTotalLine boxRef="15" label="Net Long-Term" value={netLT} />
        </FormBlock>
      </div>

      {/* Summary */}
      <FormBlock title="Schedule D Summary">
        <FormLine boxRef="7" label="Net short-term capital gain (loss)" value={netST} />
        <FormLine boxRef="15" label="Net long-term capital gain (loss)" value={netLT} />
        <FormTotalLine boxRef="16" label="Combined net capital gain (loss)" value={combined} />
        {combined < 0 && (
          <>
            <FormLine
              boxRef="21"
              label={(
                <span className="flex flex-wrap items-center gap-2">
                  <span>Capital loss applied to {taxYear} return</span>
                  {onGoToForm1040 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 gap-1.5 px-2 text-[11px]"
                      onClick={(e) => {
                        e.stopPropagation()
                        onGoToForm1040()
                      }}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      Form 1040 line 7
                    </Button>
                  )}
                </span>
              )}
              value={appliedToReturn}
            />
            <FormLine
              label={`Capital loss carryforward to ${taxYear + 1}`}
              value={carryforward}
            />
          </>
        )}
      </FormBlock>

      {carryforward < 0 && Math.abs(carryforward) > 5000 && (
        <Callout kind="warn" title="⚠ Large Capital Loss Carryforward">
          <p>
            ~<strong>{fmtAmt(Math.abs(carryforward))}</strong> carries to next year (only $3,000 allowed annually).
            Confirm exact ST/LT split from your completed Schedule D to determine character of carryforward.
          </p>
        </Callout>
      )}

      {!hasBrokerData && (
        <Callout kind="info" title="ℹ 1099-B Not Yet Uploaded">
          <p>
            No reviewed broker_1099 or 1099-B documents found. Upload and review brokerage 1099 documents in the
            Overview tab (All Tax Documents section) to include brokerage transactions in this analysis.
          </p>
        </Callout>
      )}
    </div>
  )
}
