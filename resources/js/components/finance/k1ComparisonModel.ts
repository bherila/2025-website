import { ALL_K1_CODES } from '@/components/finance/k1/k1-codes'
import { K1_SPEC } from '@/components/finance/k1/k1-spec'
import { isFK1StructuredData } from '@/components/finance/k1/k1-types'
import { extractK3ForeignTaxTotal } from '@/finance/1116/k3-to-1116'
import type { K1CellRouting } from '@/lib/finance/k1RoutingIndex'
import { K1_CODE_ROUTING_NOTES, K1_ROUTING_NOTES } from '@/lib/finance/k1RoutingNotes'
import {
  getK1CodeItems,
  getK1PartnerName,
  k1CodeOverrideKey,
  k1FieldOverrideKey,
  k3ForeignTaxTotalOverrideKey,
  normalizeK1Code,
  parseK1Field,
  sumK1CodeItems,
} from '@/lib/finance/k1Utils'
import { parseMoneyOrZero, sumMoneyValues } from '@/lib/finance/money'
import {
  k1CodeSourceFieldId,
  k1FieldSourceFieldId,
  k3ForeignTaxTotalSourceFieldId,
} from '@/lib/finance/taxSourceFieldIds'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

export interface K1Column {
  doc: TaxDocument
  data: FK1StructuredData
  accountName: string
  extractedName: string
  ein: string
}

export interface K1Row {
  key: string
  label: string
  boxRef?: string
  /** IRS box used for routing lookup (omitted for non-routable rows). */
  box?: string
  code?: string | null
  kind: 'money' | 'text'
  routable: boolean
  fromHint?: string
  overrideKey?: string
  sourceFieldId?: string
  /** Per-doc cell value. */
  value: (data: FK1StructuredData) => number | string | null
  /** Extracted source value before an All-in-One source override is applied. */
  sourceValue: (data: FK1StructuredData) => number | string | null
  /** Static destination override (e.g. K-3 foreign taxes always route to Form 1116). */
  staticDestinations?: K1CellRouting[]
}

export interface K1Section {
  title: string
  rows: K1Row[]
}

const ENTITY_BOXES = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H1', 'H2', 'I1', 'I2', 'I3'])
/** Extracts the "<< source" half of a routing note for the From column. */
function fromHint(box: string, code: string | null | undefined): string | undefined {
  const note = code
    ? K1_CODE_ROUTING_NOTES[box]?.[normalizeK1Code(code)]
    : K1_ROUTING_NOTES[box]
  if (!note) {
    return undefined
  }
  const match = note.match(/<<\s*([^|]+)/)
  return match?.[1]?.trim()
}

/** First line of a possibly multi-line field value. */
export function firstLine(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  return value.split('\n')[0]?.trim() ?? null
}

function withoutSourceValueOverrides(data: FK1StructuredData): FK1StructuredData {
  const { sourceValueOverrides: _sourceValueOverrides, ...rest } = data
  return rest
}

function extractedK1Field(data: FK1StructuredData, box: string): number {
  return parseMoneyOrZero(data.fields[box]?.value)
}

function extractedK1CodeTotal(data: FK1StructuredData, box: string, code: string): number {
  return sumMoneyValues(getK1CodeItems(data, box, code).map((item) => item.value))
}

function sourceAccountName(doc: TaxDocument, data: FK1StructuredData): string {
  const linkedAccount = (doc.account_links ?? []).find((link) => link.account?.acct_name)?.account?.acct_name
  return doc.account?.acct_name
    ?? linkedAccount
    ?? getK1PartnerName(data, doc.employment_entity?.display_name ?? 'Partnership')
}

export function k1ColumnsFromDocs(k1Docs: TaxDocument[]): K1Column[] {
  return k1Docs
    .map((doc) => {
      if (!isFK1StructuredData(doc.parsed_data)) {
        return null
      }
      const data = doc.parsed_data
      return {
        doc,
        data,
        accountName: sourceAccountName(doc, data),
        extractedName: getK1PartnerName(data, doc.employment_entity?.display_name ?? 'Partnership'),
        ein: data.fields['A']?.value ?? '—',
      }
    })
    .filter((column): column is K1Column => column !== null)
}

export function moneyFillClass(value: number | null): string {
  if (value === null || value === 0) {
    return ''
  }
  return value > 0 ? 'bg-success/5' : 'bg-destructive/5'
}

export function k3ForeignTaxSourceValues(data: FK1StructuredData): Array<{ label: string; value: number }> {
  const section = data.k3?.sections?.find((entry) => entry.sectionId === 'part3_section4')
  const sectionData = (section?.data ?? {}) as Record<string, unknown>
  const nestedKey = Object.keys(sectionData).find((key) => key.includes('foreignTax') || key.includes('foreign_tax'))
  const nested = nestedKey ? sectionData[nestedKey] as Record<string, unknown> | undefined : undefined
  const countries = ((nested?.countries ?? sectionData.countries) as Array<Record<string, unknown>> | undefined) ?? []

  return countries.map((entry) => ({
    label: String(entry.country ?? entry.code ?? '—').trim() || '—',
    value: parseMoneyOrZero(entry.amount_usd ?? entry.total ?? entry.passiveForeign),
  }))
}

export function buildSections(columns: K1Column[]): K1Section[] {
  const entityRows: K1Row[] = []
  const capitalRows: K1Row[] = []

  for (const spec of K1_SPEC.filter((s) => s.side === 'left')) {
    const row: K1Row = {
      key: `box-${spec.box}`,
      label: spec.concise,
      boxRef: spec.box,
      kind: 'text',
      routable: false,
      sourceFieldId: k1FieldSourceFieldId(spec.box),
      value: (data) => firstLine(data.fields[spec.box]?.value),
      sourceValue: (data) => data.fields[spec.box]?.value ?? null,
    }
    if (ENTITY_BOXES.has(spec.box)) {
      entityRows.push(row)
    } else {
      capitalRows.push(row)
    }
  }

  const incomeRows: K1Row[] = []
  for (const spec of K1_SPEC.filter((s) => s.side === 'right')) {
    if (spec.fieldType === 'buttonDetails') {
      // Expand one sub-row per distinct code present across any fund.
      const codes = new Set<string>()
      for (const col of columns) {
        for (const item of col.data.codes[spec.box] ?? []) {
          codes.add(normalizeK1Code(item.code))
        }
      }
      const codeLabels = ALL_K1_CODES[spec.box] ?? {}
      for (const code of [...codes].sort()) {
        const hint = fromHint(spec.box, code)
        incomeRows.push({
          key: `box-${spec.box}-${code}`,
          label: codeLabels[code] ?? `Code ${code}`,
          boxRef: `${spec.box}${code}`,
          box: spec.box,
          code,
          kind: 'money',
          routable: true,
          ...(hint ? { fromHint: hint } : {}),
          overrideKey: k1CodeOverrideKey(spec.box, code),
          sourceFieldId: k1CodeSourceFieldId(spec.box, code),
          value: (data) => sumK1CodeItems(data, spec.box, code),
          sourceValue: (data) => extractedK1CodeTotal(data, spec.box, code),
        })
      }
    } else {
      const hint = fromHint(spec.box, null)
      incomeRows.push({
        key: `box-${spec.box}`,
        label: spec.concise,
        boxRef: spec.box,
        box: spec.box,
        kind: 'money',
        routable: true,
        ...(hint ? { fromHint: hint } : {}),
        overrideKey: k1FieldOverrideKey(spec.box),
        sourceFieldId: k1FieldSourceFieldId(spec.box),
        value: (data) => parseK1Field(data, spec.box),
        sourceValue: (data) => extractedK1Field(data, spec.box),
      })
    }
  }

  // Box 21 — foreign taxes paid/accrued (not in K1_SPEC's right panel).
  if (columns.some((c) => c.data.fields['21']?.value)) {
    const hint = fromHint('21', null)
    incomeRows.push({
      key: 'box-21',
      label: 'Foreign taxes paid or accrued',
      boxRef: '21',
      box: '21',
      kind: 'money',
      routable: true,
      ...(hint ? { fromHint: hint } : {}),
      overrideKey: k1FieldOverrideKey('21'),
      sourceFieldId: k1FieldSourceFieldId('21'),
      value: (data) => parseK1Field(data, '21'),
      sourceValue: (data) => extractedK1Field(data, '21'),
    })
  }

  const k3Rows: K1Row[] = []
  if (columns.some((c) => (c.data.k3?.sections?.length ?? 0) > 0)) {
    k3Rows.push({
      key: 'k3-foreign-tax',
      label: 'K-3 Part III §4 — Foreign taxes (total USD)',
      boxRef: 'K-3',
      kind: 'money',
      routable: true,
      fromHint: 'K-3 Part III, Section 4',
      overrideKey: k3ForeignTaxTotalOverrideKey(),
      sourceFieldId: k3ForeignTaxTotalSourceFieldId(),
      value: (data) => extractK3ForeignTaxTotal(data),
      sourceValue: (data) => extractK3ForeignTaxTotal(withoutSourceValueOverrides(data)),
      staticDestinations: [
        { routing: 'k3_all_in_one', routingReason: 'Open the full K-3 foreign income & tax breakdown across all funds.', label: 'K-3 detail', formId: 'k3-all-in-one' },
        { routing: 'form_1116_line_8', routingReason: 'Foreign taxes paid feed the Form 1116 foreign tax credit.', label: 'Form 1116', formId: 'form-1116' },
      ],
    })
  }

  return [
    { title: 'Entity & Partner Information', rows: entityRows },
    { title: 'Capital Account & Liabilities', rows: capitalRows },
    { title: 'Income, Deductions & Other (Boxes 1–21)', rows: incomeRows },
    { title: 'K-3 Foreign', rows: k3Rows },
  ].filter((section) => section.rows.length > 0)
}

