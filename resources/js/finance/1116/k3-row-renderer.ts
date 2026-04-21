import type { K3Section } from '@/types/finance/k1-data'
import type { XlsxRow } from '@/types/finance/xlsx-export'

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function getLineLabel(raw: unknown): string | undefined {
  if (raw == null) {
    return undefined
  }
  const line = String(raw).trim()
  return line === '' ? undefined : `Line ${line}`
}

function renderArrayRow(section: K3Section, row: Record<string, unknown>): XlsxRow {
  const line = getLineLabel(row.line)
  const country = typeof row.country === 'string' ? row.country : undefined
  const total = toNumber(row.col_g_total) ?? toNumber(row.amount_usd)
  const noteParts = [
    country ? `Country: ${country}` : null,
    toNumber(row.col_a_us_source) != null ? `a=${toNumber(row.col_a_us_source)}` : null,
    toNumber(row.col_c_passive) != null ? `c=${toNumber(row.col_c_passive)}` : null,
    toNumber(row.col_d_general) != null ? `d=${toNumber(row.col_d_general)}` : null,
    toNumber(row.col_f_sourced_by_partner) != null ? `f=${toNumber(row.col_f_sourced_by_partner)}` : null,
    total == null && row.note ? String(row.note) : null,
  ].filter((part): part is string => Boolean(part))

  return {
    line,
    description: `${section.title}${line ? ` — ${line}` : ''}`,
    ...(total != null ? { amount: total } : {}),
    ...(noteParts.length > 0 ? { note: noteParts.join(' | ') } : {}),
  }
}

function renderObjectRows(section: K3Section, data: Record<string, unknown>): XlsxRow[] {
  const rows: XlsxRow[] = []

  for (const [key, value] of Object.entries(data)) {
    if (key === 'rows') {
      continue
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const rowData = value as Record<string, unknown>
      const total = toNumber(rowData.g) ?? toNumber(rowData.col_g_total)
      const noteParts = [
        toNumber(rowData.a) != null ? `a=${toNumber(rowData.a)}` : null,
        toNumber(rowData.c) != null ? `c=${toNumber(rowData.c)}` : null,
        toNumber(rowData.d) != null ? `d=${toNumber(rowData.d)}` : null,
        toNumber(rowData.f) != null ? `f=${toNumber(rowData.f)}` : null,
      ].filter((part): part is string => Boolean(part))

      rows.push({
        description: `${section.title} — ${key}`,
        ...(total != null ? { amount: total } : {}),
        ...(noteParts.length > 0 ? { note: noteParts.join(' | ') } : {}),
      })
      continue
    }

    const numeric = toNumber(value)
    rows.push({
      description: `${section.title} — ${key}`,
      ...(numeric != null ? { amount: numeric } : { note: String(value ?? '') }),
    })
  }

  return rows
}

export function renderK3SectionRows(section: K3Section): XlsxRow[] {
  const rows: XlsxRow[] = [{ isHeader: true, description: `${section.sectionId} — ${section.title}` }]
  const data = section.data ?? {}
  const dataObj = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {}
  const rawRows = Array.isArray(dataObj.rows) ? dataObj.rows : []

  if (rawRows.length > 0) {
    for (const row of rawRows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        continue
      }
      rows.push(renderArrayRow(section, row as Record<string, unknown>))
    }
  } else {
    rows.push(...renderObjectRows(section, dataObj))
  }

  if (rows.length === 1) {
    rows.push({
      description: `${section.title} — no extracted rows`,
      note: 'No structured line items detected in this section',
    })
  }

  return rows
}

export function renderK3SectionsRows(sections: K3Section[]): XlsxRow[] {
  return sections.flatMap((section) => renderK3SectionRows(section))
}
