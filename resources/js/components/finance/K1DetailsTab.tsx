'use client'

import currency from 'currency.js'
import { useState } from 'react'

import { isFK1StructuredData } from '@/components/finance/k1'
import { BOX11_CODES, BOX13_CODES } from '@/components/finance/k1/k1-codes'
import { K1_SPEC } from '@/components/finance/k1/k1-spec'
import K1CodesModal from '@/components/finance/k1/K1CodesModal'
import { Callout, fmtAmt, FormBlock, FormLine, FormSubLine, FormTotalLine, parseFieldVal } from '@/components/finance/tax-preview-primitives'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { FK1StructuredData, K1CodeItem, K3Section } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

// ── Helpers ───────────────────────────────────────────────────────────────────

function pk1(data: FK1StructuredData, box: string): number {
  const v = data.fields[box]?.value
  if (!v) return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}


function codeSum(items: K1CodeItem[]): number {
  return items.reduce((acc, i) => {
    const n = parseFloat(i.value)
    return isNaN(n) ? acc : acc.add(n)
  }, currency(0)).value
}

// ── K-3 Part II table ─────────────────────────────────────────────────────────

function K3Part2Table({ sections }: { sections: K3Section[] }) {
  const part2Sections = sections.filter(
    (s) => s.sectionId === 'part2_section1' || s.sectionId === 'part2_section2',
  )
  if (part2Sections.length === 0) return null

  return (
    <div className="border rounded-lg overflow-hidden text-xs">
      <div className="bg-muted/40 px-3 py-2 text-xs font-semibold tracking-wide border-b">
        K-3 Part II — Foreign Income
      </div>
      <Table className="text-xs">
        <TableHeader className="bg-muted/10">
          <TableRow>
            <TableHead className="text-xs h-7 w-8">Line</TableHead>
            <TableHead className="text-xs h-7">Description</TableHead>
            <TableHead className="text-xs h-7">Country</TableHead>
            <TableHead className="text-xs h-7 text-right">U.S. Source</TableHead>
            <TableHead className="text-xs h-7 text-right">Passive</TableHead>
            <TableHead className="text-xs h-7 text-right">General</TableHead>
            <TableHead className="text-xs h-7 text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {part2Sections.map((sec) => {
            const rows = ((sec.data as Record<string, unknown>)?.rows as Array<Record<string, unknown>> | undefined) ?? []
            return rows.map((row, i) => {
              const us = parseFieldVal(String(row.col_a_us_source ?? '')) ?? 0
              const passive = parseFieldVal(String(row.col_c_passive ?? '')) ?? 0
              const general = parseFieldVal(String(row.col_d_general ?? '')) ?? 0
              const total = parseFieldVal(String(row.col_g_total ?? '')) ?? us + passive + general
              const country = (row.country as string | undefined) ?? ''
              const line = (row.line as string | undefined) ?? ''
              const desc = (row.description as string | undefined) ?? (row.line_description as string | undefined) ?? ''
              return (
                <TableRow key={`${sec.sectionId}-${i}`} className="hover:bg-muted/10">
                  <TableCell className="py-1 font-mono text-muted-foreground">{line}</TableCell>
                  <TableCell className="py-1">{desc}</TableCell>
                  <TableCell className="py-1 font-mono text-muted-foreground">{country}</TableCell>
                  <TableCell className="py-1 text-right font-mono tabular-nums">{us !== 0 ? fmtAmt(us) : '—'}</TableCell>
                  <TableCell className="py-1 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-500">
                    {passive !== 0 ? fmtAmt(passive) : '—'}
                  </TableCell>
                  <TableCell className="py-1 text-right font-mono tabular-nums">{general !== 0 ? fmtAmt(general) : '—'}</TableCell>
                  <TableCell className="py-1 text-right font-mono tabular-nums font-semibold">{total !== 0 ? fmtAmt(total) : '—'}</TableCell>
                </TableRow>
              )
            })
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// ── K-3 Part III foreign taxes table ─────────────────────────────────────────

type K3ForeignTaxRow = {
  country: string
  tax_type?: string
  basket?: string
  amount_usd: number
}

function K3ForeignTaxTable({ sections }: { sections: K3Section[] }) {
  const sec = sections.find((s) => s.sectionId === 'part3_section4')
  if (!sec) return null
  const d = sec.data as Record<string, unknown>
  const countries = d?.countries as K3ForeignTaxRow[] | undefined
  const grandTotal = d?.grandTotalUSD as number | undefined

  if (!countries?.length) return null

  return (
    <div className="border rounded-lg overflow-hidden text-xs">
      <div className="bg-muted/40 px-3 py-2 text-xs font-semibold tracking-wide border-b">
        K-3 Part III §4 — Foreign Taxes by Country
      </div>
      <Table className="text-xs">
        <TableHeader className="bg-muted/10">
          <TableRow>
            <TableHead className="text-xs h-7">Country</TableHead>
            <TableHead className="text-xs h-7 text-right">Amount USD</TableHead>
            <TableHead className="text-xs h-7">Type</TableHead>
            <TableHead className="text-xs h-7">Basket</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {countries.map((row, i) => (
            <TableRow key={i}>
              <TableCell className="py-1 font-mono font-semibold">{row.country}</TableCell>
              <TableCell className="py-1 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-500">
                {fmtAmt(row.amount_usd, 2)}
              </TableCell>
              <TableCell className="py-1 text-muted-foreground">{row.tax_type ?? '—'}</TableCell>
              <TableCell className="py-1 text-muted-foreground">{row.basket ?? '—'}</TableCell>
            </TableRow>
          ))}
          {grandTotal !== undefined && (
            <TableRow className="font-semibold bg-muted/20 border-t">
              <TableCell className="py-1.5">Grand Total</TableCell>
              <TableCell className="py-1.5 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-500">
                {fmtAmt(grandTotal, 2)}
              </TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

// ── Single K-1 card ───────────────────────────────────────────────────────────

function K1Card({ doc, data }: { doc: TaxDocument; data: FK1StructuredData }) {
  const [codesModal, setCodesModal] = useState<{ box: string } | null>(null)
  const activeCodesSpec = codesModal ? K1_SPEC.find((s) => s.box === codesModal.box) : null
  const partnerName = data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
  const ein = data.fields['A']?.value ?? '—'
  const partnerNumber = data.fields['partnerNumber']?.value ?? null

  // Capital account
  const jEndingCapital = parseFieldVal(data.fields['J_capital_ending']?.value ?? data.fields['J']?.value)
  const kEndingInterest = parseFieldVal(data.fields['J_profit']?.value)

  const box5 = pk1(data, '5')
  const box6a = pk1(data, '6a')
  const box6b = pk1(data, '6b')
  const box7 = pk1(data, '7')
  const box8 = pk1(data, '8')
  const box9a = pk1(data, '9a')
  const box9b = pk1(data, '9b')
  const box9c = pk1(data, '9c')
  const box10 = pk1(data, '10')
  const box21 = pk1(data, '21')

  // Box 11 code items
  const box11Items = data.codes['11'] ?? []
  const box11ZZItems = box11Items.filter((i) => i.code === 'ZZ')
  const box11NonZZ = box11Items.filter((i) => i.code !== 'ZZ')

  // Box 13 code items
  const box13Items = data.codes['13'] ?? []
  const box13Suspended = box13Items.filter((i) => i.code === 'K' || i.code === 'AE')

  // K-3
  const k3Sections = data.k3?.sections ?? []
  const hasK3 = k3Sections.length > 0

  const netIncome =
    box5 + box6a + box7 + box8 + box9a + box9b + box9c + box10 +
    codeSum(box11Items) + codeSum(box13Items) + codeSum(data.codes['12'] ?? [])

  return (
    <div className="border rounded-lg overflow-hidden space-y-0">
      {/* Header */}
      <div className="bg-muted/50 px-4 py-3 border-b">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-sm">{partnerName}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              EIN {ein}
              {partnerNumber ? ` · Partner #${partnerNumber}` : ''}
              {jEndingCapital != null ? ` · ${jEndingCapital.toFixed(2)}% ending capital` : ''}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-sm font-mono font-semibold tabular-nums ${netIncome < 0 ? 'text-destructive' : netIncome > 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-muted-foreground'}`}>
              {fmtAmt(netIncome)}
            </div>
            <div className="text-[10px] text-muted-foreground">net K-1</div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Income items */}
        <FormBlock title="Income Items">
          {box5 !== 0 && <FormLine boxRef="Box 5" label="Interest income" value={box5} />}
          {box6a !== 0 && <FormLine boxRef="Box 6a" label="Ordinary dividends" value={box6a} />}
          {box6b !== 0 && <FormLine boxRef="Box 6b" label="Qualified dividends" value={box6b} />}
          {box7 !== 0 && <FormLine boxRef="Box 7" label="Royalties" value={box7} />}
          {box8 !== 0 && <FormLine boxRef="Box 8" label="Net S/T capital gain (loss)" value={box8} />}
          {box9a !== 0 && <FormLine boxRef="Box 9a" label="Net L/T capital gain (loss)" value={box9a} />}
          {box9b !== 0 && <FormLine boxRef="Box 9b" label="Collectibles (28%) gain (loss)" value={box9b} />}
          {box9c !== 0 && <FormLine boxRef="Box 9c" label="Unrecaptured §1250 gain" value={box9c} />}
          {box10 !== 0 && <FormLine boxRef="Box 10" label="Net §1231 gain (loss)" value={box10} />}
          {box11NonZZ.length > 0 && (() => {
            const total = box11NonZZ.reduce((acc, item) => acc.add(parseFieldVal(item.value) ?? 0), currency(0)).value
            const uniqueCodes = [...new Set(box11NonZZ.map((i) => i.code))].filter((c): c is string => Boolean(c))
            const firstCode = uniqueCodes[0] ?? ''
            const label = uniqueCodes.length === 1
              ? (BOX11_CODES[firstCode] ?? `Other income — code ${firstCode}`)
              : `Other income (${uniqueCodes.length} codes)`
            return (
              <FormLine
                boxRef={uniqueCodes.length === 1 ? `Box 11${firstCode}` : 'Box 11'}
                label={label}
                value={total}
                onDetails={() => setCodesModal({ box: '11' })}
              />
            )
          })()}
          {box5 === 0 && box6a === 0 && box7 === 0 && box8 === 0 && box9a === 0 && box10 === 0 && box11NonZZ.length === 0 && (
            <FormLine label="No income items" raw="—" />
          )}
        </FormBlock>

        {/* Box 11ZZ — Ordinary income items */}
        {box11ZZItems.length > 0 && (
          <>
            <FormBlock title="Box 11ZZ — Supplemental / Ordinary Items">
              {box11ZZItems.map((item, i) => (
                <div key={`zzitem-${i}`}>
                  <FormLine label={item.notes ??`ZZ item ${i + 1}`} value={parseFieldVal(item.value)} />
                  {item.notes && <FormSubLine text={item.notes} />}
                </div>
              ))}
            </FormBlock>
            <Callout kind="warn" title="Box 11ZZ — All Items Are Ordinary Income/Loss, Not Capital">
              <ul className="list-disc list-inside space-y-1">
                <li>Sec. 988 FX loss → IRC §988; ordinary; Schedule E Part II nonpassive</li>
                <li>Swap loss → K-1 footnote directs Schedule E nonpassive; ordinary</li>
                <li>PFIC MTM income → IRC §1296 mark-to-market; ordinary</li>
              </ul>
              <p className="mt-1">None of these items go to Schedule D.</p>
            </Callout>
          </>
        )}

        {/* Deduction items */}
        {(box13Items.length > 0 || box21 !== 0) && (
          <FormBlock title="Deductions &amp; Credits">
            {box13Items.length > 0 && (() => {
              const total = box13Items.reduce((acc, item) => {
                const v = parseFieldVal(item.value)
                return v !== null ? acc.add(-Math.abs(v)) : acc
              }, currency(0)).value
              const uniqueCodes = [...new Set(box13Items.map((i) => i.code))].filter((c): c is string => Boolean(c))
              const firstCode = uniqueCodes[0] ?? ''
              const hasSuspended = box13Suspended.length > 0
              const label = uniqueCodes.length === 1
                ? (BOX13_CODES[firstCode] ?? `Deduction — code ${firstCode}`)
                : `Other deductions (${uniqueCodes.length} codes)`
              return (
                <FormLine
                  boxRef={uniqueCodes.length === 1 ? `Box 13${firstCode}` : 'Box 13'}
                  label={
                    hasSuspended ? (
                      <span className="flex items-center gap-1.5">
                        {label}
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-amber-400 text-amber-600">§67(g) suspended</Badge>
                      </span>
                    ) : label
                  }
                  value={total}
                  onDetails={() => setCodesModal({ box: '13' })}
                />
              )
            })()}
            {box21 !== 0 && <FormLine boxRef="Box 21" label="Foreign taxes paid / accrued" value={box21} />}
          </FormBlock>
        )}

        {/* §67(g) callout if applicable */}
        {box13Suspended.length > 0 && (
          <Callout kind="warn" title={`§67(g) — ${fmtAmt(Math.abs(codeSum(box13Suspended)))} Suspended Federal Deductions`}>
            <p>
              These items are not deductible on the federal return under TCJA §67(g) (miscellaneous itemized
              deduction suspension through 2025).
            </p>
            <p>
              <strong>California does NOT conform</strong> — these may be claimed on Schedule CA (540). See Action Items tab.
            </p>
          </Callout>
        )}

        {/* K-3 foreign income / taxes */}
        {hasK3 && (
          <>
            <K3Part2Table sections={k3Sections} />
            <K3ForeignTaxTable sections={k3Sections} />
            {box21 === 0 && (
              <Callout kind="good" title="✓ No Form 1116 from This Partnership">
                <p>K-3 shows zero foreign income and taxes in every basket. No Form 1116 arises from this fund.</p>
              </Callout>
            )}
          </>
        )}

        {/* Capital account */}
        {(data.fields['L_beginning_capital'] || data.fields['L_ending_capital'] || kEndingInterest != null) && (
          <FormBlock title="Capital Account &amp; Liabilities">
            {parseFieldVal(data.fields['L_beginning_capital']?.value) != null && (
              <FormLine label="Beginning capital account" value={parseFieldVal(data.fields['L_beginning_capital']?.value)} />
            )}
            {parseFieldVal(data.fields['L_contributed']?.value) != null && (
              <FormLine label="Contributions during year" value={parseFieldVal(data.fields['L_contributed']?.value)} />
            )}
            {parseFieldVal(data.fields['L_current_year_net']?.value) != null && (
              <FormLine label="Current-year net income (loss)" value={parseFieldVal(data.fields['L_current_year_net']?.value)} />
            )}
            {parseFieldVal(data.fields['L_withdrawals']?.value) != null && (
              <FormLine label="Withdrawals & distributions" value={parseFieldVal(data.fields['L_withdrawals']?.value)} />
            )}
            {parseFieldVal(data.fields['L_ending_capital']?.value) != null && (
              <FormTotalLine label="Ending capital account" value={parseFieldVal(data.fields['L_ending_capital']?.value)} />
            )}
            {parseFieldVal(data.fields['K_recourse']?.value) != null && (
              <FormLine label="Recourse liabilities" value={parseFieldVal(data.fields['K_recourse']?.value)} />
            )}
            {parseFieldVal(data.fields['K_nonrecourse']?.value) != null && (
              <FormLine label="Nonrecourse liabilities" value={parseFieldVal(data.fields['K_nonrecourse']?.value)} />
            )}
          </FormBlock>
        )}
      </div>

      {codesModal && activeCodesSpec?.codes && (
        <K1CodesModal
          open
          boxLabel={`Box ${activeCodesSpec.box}: ${activeCodesSpec.label}`}
          box={activeCodesSpec.box}
          codeDefinitions={activeCodesSpec.codes}
          items={data.codes[codesModal.box] ?? []}
          readOnly
          onClose={() => setCodesModal(null)}
          onChange={() => setCodesModal(null)}
        />
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface K1DetailsTabProps {
  reviewedK1Docs: TaxDocument[]
  selectedYear?: number
}

export default function K1DetailsTab({ reviewedK1Docs, selectedYear }: K1DetailsTabProps) {
  const taxYear = selectedYear ?? new Date().getFullYear()
  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  // Aggregate §67(g) suspended deductions across all funds
  const allSuspended = k1Parsed.flatMap(({ doc, data }) => {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    return (data.codes['13'] ?? [])
      .filter((i) => i.code === 'K' || i.code === 'AE')
      .map((i) => ({
        fund: partnerName,
        code: i.code,
        description: i.notes ?? `Box 13${i.code}`,
        amount: parseFieldVal(i.value) ?? 0,
      }))
  })
  const totalSuspended = allSuspended.reduce((acc, i) => acc.add(Math.abs(i.amount)), currency(0)).value

  if (k1Parsed.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        No reviewed K-1 documents found for this year.
        <br />
        Review K-1 documents in the Documents tab to see details here.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold mb-0.5">K-1 Details — All Reviewed Partnerships</h2>
        <p className="text-xs text-muted-foreground">
          Detailed view of income, deductions, and K-3 foreign data for each reviewed K-1.
        </p>
      </div>

      {k1Parsed.map(({ doc, data }) => (
        <K1Card key={doc.id} doc={doc} data={data} />
      ))}

      {/* Cross-fund §67(g) summary */}
      {allSuspended.length > 0 && (
        <div className="space-y-3">
          <Callout kind="warn" title={`§67(g) — ${fmtAmt(totalSuspended)} Total Suspended Federal Deductions`}>
            <p>
              None of the following are deductible on the {taxYear} federal return under TCJA §67(g) miscellaneous
              itemized deduction suspension.
            </p>
            <div className="mt-2 rounded border border-current/20 overflow-hidden">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-current/10">
                    <th className="text-left px-2 py-1 font-semibold">Fund</th>
                    <th className="text-left px-2 py-1 font-semibold">Box</th>
                    <th className="text-left px-2 py-1 font-semibold">Description</th>
                    <th className="text-right px-2 py-1 font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {allSuspended.map((item, i) => (
                    <tr key={i} className="border-t border-current/10">
                      <td className="px-2 py-1">{item.fund}</td>
                      <td className="px-2 py-1 font-mono">13{item.code}</td>
                      <td className="px-2 py-1">{item.description}</td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums">({fmtAmt(Math.abs(item.amount))})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5">
              <strong>California does NOT conform</strong> — see Action Items tab for Schedule CA (540) treatment.
              At 13.3% CA marginal rate, potential CA tax savings ≈{' '}
              <strong>{fmtAmt(totalSuspended * 0.133)}</strong>.
            </p>
          </Callout>
        </div>
      )}
    </div>
  )
}
