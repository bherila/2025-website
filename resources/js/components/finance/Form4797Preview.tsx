'use client'

import currency from 'currency.js'

import { Callout, FormBlock, FormLine, FormSubLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'

export interface Form4797Inputs {
  /** Part I line 7 — net §1231 gain/(loss) on property held > 1 year. */
  partINet1231: number
  /** Part II line 18b — ordinary gains/(losses) — not §1231 treatment. */
  partIIOrdinary: number
  /** Part III — depreciation recapture totals (§1245 / §1250 / etc.). */
  partIIIRecapture: number
}

export interface Form4797Lines extends Form4797Inputs {
  /**
   * Net gain flowing to Schedule 1 line 4.
   * Per Form 4797 instructions: Part I § 1231 gain when net positive flows
   * to Schedule D as a long-term capital gain; when net negative, it flows
   * to Schedule 1 line 4 as an ordinary loss. Part II ordinary results and
   * Part III recapture always flow to Schedule 1 line 4 as ordinary.
   */
  netToSchedule1Line4: number
  /** Part I gain routed to Schedule D (long-term) when net positive. */
  netToScheduleDLongTerm: number
  hasActivity: boolean
}

export function computeForm4797({
  partINet1231,
  partIIOrdinary,
  partIIIRecapture,
}: Form4797Inputs): Form4797Lines {
  const partIRoutedAsOrdinary = partINet1231 < 0 ? partINet1231 : 0
  const partIRoutedAsCapital = partINet1231 > 0 ? partINet1231 : 0

  const netToSchedule1Line4 = currency(partIRoutedAsOrdinary)
    .add(partIIOrdinary)
    .add(partIIIRecapture).value

  return {
    partINet1231,
    partIIOrdinary,
    partIIIRecapture,
    netToSchedule1Line4,
    netToScheduleDLongTerm: partIRoutedAsCapital,
    hasActivity: partINet1231 !== 0 || partIIOrdinary !== 0 || partIIIRecapture !== 0,
  }
}

interface Form4797PreviewProps {
  selectedYear: number
  form4797: Form4797Lines
  partINet1231Input?: React.ReactNode
  partIIOrdinaryInput?: React.ReactNode
  partIIIRecaptureInput?: React.ReactNode
}

function InputLine({
  boxRef,
  label,
  value,
  input,
}: {
  boxRef?: string
  label: string
  value: number
  input?: React.ReactNode
}): React.ReactElement {
  if (!input) {
    return <FormLine boxRef={boxRef ?? ''} label={label} value={value} />
  }
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="w-14 shrink-0 select-none font-mono text-[10px] text-muted-foreground">{boxRef ?? ''}</span>
      <span className="flex-1 text-[13px]">{label}</span>
      <span className="shrink-0">{input}</span>
    </div>
  )
}

export default function Form4797Preview({
  selectedYear,
  form4797,
  partINet1231Input,
  partIIOrdinaryInput,
  partIIIRecaptureInput,
}: Form4797PreviewProps) {
  const f = form4797

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Form 4797 — Sales of Business Property — {selectedYear}</h2>
        <p className="text-xs text-muted-foreground">
          §1231 / §1245 / §1250 dispositions. Values are user-entered — there is no reviewed tax-document source yet.
        </p>
      </div>

      {!f.hasActivity && (
        <Callout kind="info" title="No Form 4797 activity entered">
          <p>
            Enter net §1231 gain/(loss), ordinary gain/(loss), or depreciation recapture below to populate
            the form. Net values flow to Schedule 1 line 4 (ordinary) or Schedule D (when Part I nets positive).
          </p>
        </Callout>
      )}

      <FormBlock title="Part I — §1231 property held > 1 year">
        <InputLine
          boxRef="7"
          label="Net §1231 gain or (loss)"
          value={f.partINet1231}
          input={partINet1231Input}
        />
        <FormSubLine text="Net positive → Schedule D as long-term capital gain. Net negative → Schedule 1 line 4 as ordinary loss." />
      </FormBlock>

      <FormBlock title="Part II — Ordinary gains and losses">
        <InputLine
          boxRef="18b"
          label="Net ordinary gain or (loss)"
          value={f.partIIOrdinary}
          input={partIIOrdinaryInput}
        />
        <FormSubLine text="Always flows to Schedule 1 line 4 as ordinary income." />
      </FormBlock>

      <FormBlock title="Part III — Depreciation recapture (§1245 / §1250 / §1252 / §1254 / §1255)">
        <InputLine
          boxRef=""
          label="Total recapture amount"
          value={f.partIIIRecapture}
          input={partIIIRecaptureInput}
        />
        <FormSubLine text="Included in Part II line 18a — treated as ordinary income." />
      </FormBlock>

      <FormTotalLine
        label="Net → Schedule 1 line 4 (Other gains/losses)"
        value={f.netToSchedule1Line4}
        double
      />
      {f.netToScheduleDLongTerm > 0 && (
        <FormTotalLine
          label="Net §1231 gain → Schedule D long-term"
          value={f.netToScheduleDLongTerm}
        />
      )}
    </div>
  )
}
