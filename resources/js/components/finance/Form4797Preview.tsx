'use client'

import { Callout, FactsLoadingPlaceholder, FormBlock, FormLine, FormSubLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import type { Form4797Facts } from '@/types/generated/tax-preview-facts'

interface Form4797PreviewProps {
  selectedYear: number
  form4797?: Form4797Facts | null
}

export default function Form4797Preview({
  selectedYear,
  form4797,
}: Form4797PreviewProps) {
  if (!form4797) {
    return <FactsLoadingPlaceholder label="Form 4797" />
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Form 4797 — Sales of Business Property — {selectedYear}</h2>
        <p className="text-xs text-muted-foreground">
          §1231 / §1245 / §1250 dispositions. Backend facts provide the amounts that flow to Schedule 1 or Schedule D.
        </p>
      </div>

      {!form4797.hasActivity && (
        <Callout kind="info" title="No Form 4797 activity detected">
          <p>
            No §1231 gain/loss, ordinary gain/loss, or depreciation recapture is present in the backend tax facts.
          </p>
        </Callout>
      )}

      <FormBlock title="Part I — §1231 property held > 1 year">
        <FormLine
          boxRef="7"
          label="Net §1231 gain or (loss)"
          value={form4797.partINet1231}
        />
        <FormSubLine text="Net positive → Schedule D as long-term capital gain. Net negative → Schedule 1 line 4 as ordinary loss." />
      </FormBlock>

      <FormBlock title="Part II — Ordinary gains and losses">
        <FormLine
          boxRef="18b"
          label="Net ordinary gain or (loss)"
          value={form4797.partIIOrdinary}
        />
        <FormSubLine text="Always flows to Schedule 1 line 4 as ordinary income." />
      </FormBlock>

      <FormBlock title="Part III — Depreciation recapture (§1245 / §1250 / §1252 / §1254 / §1255)">
        <FormLine
          label="Total recapture amount"
          value={form4797.partIIIRecapture}
        />
        <FormSubLine text="Included in Part II line 18a — treated as ordinary income." />
      </FormBlock>

      <FormTotalLine
        label="Net → Schedule 1 line 4 (Other gains/losses)"
        value={form4797.netToSchedule1Line4}
        double
      />
      {form4797.netToScheduleDLongTerm > 0 && (
        <>
          <FormTotalLine
            label="Net §1231 gain → Schedule D long-term"
            value={form4797.netToScheduleDLongTerm}
          />
          <FormSubLine text="Informational only — this amount is included through Schedule D backend facts when routed there." />
        </>
      )}
    </div>
  )
}
