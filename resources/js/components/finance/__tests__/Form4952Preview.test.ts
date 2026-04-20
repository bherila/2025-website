import currency from 'currency.js'

import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

import { computeForm4952Lines } from '../Form4952Preview'

// ── Fixture helpers (mirrors Form1116Preview.test.ts) ─────────────────────────

function makeK1Data(overrides: Partial<FK1StructuredData> = {}): FK1StructuredData {
  return {
    schemaVersion: '2026.1',
    formType: 'K-1-1065',
    fields: {},
    codes: {},
    ...overrides,
  }
}

function makeK1Doc(data: FK1StructuredData, partnerName = 'Test Partnership'): TaxDocument {
  return {
    id: 1,
    user_id: 1,
    tax_year: 2024,
    form_type: 'k1',
    employment_entity_id: null,
    account_id: null,
    original_filename: null,
    stored_filename: null,
    s3_path: null,
    mime_type: 'application/pdf',
    file_size_bytes: 0,
    file_hash: 'abc',
    is_reviewed: true,
    notes: null,
    human_file_size: '0 B',
    download_count: 0,
    genai_job_id: null,
    genai_status: null,
    parsed_data: data,
    uploader: null,
    employment_entity: { id: 1, display_name: partnerName },
    account: null,
    account_links: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }
}

const defaultIncome1099 = {
  interestIncome: currency(0),
  dividendIncome: currency(0),
  qualifiedDividends: currency(0),
}

// ── Issue 1: Box 13 K/L/AE suspension logic ──────────────────────────────────

describe('computeForm4952Lines — §67(g) suspension (Issue 1)', () => {
  it('suspends Box 13K (2% floor) — K does NOT flow to invIntSources', () => {
    const data = makeK1Data({
      fields: { '5': { value: '10000' } },
      codes: {
        '13': [
          { code: 'H', value: '5000' },
          { code: 'K', value: '1000' },
        ],
      },
    })
    const result = computeForm4952Lines({
      reviewedK1Docs: [makeK1Doc(data)],
      reviewed1099Docs: [],
      income1099: defaultIncome1099,
    })
    // 13H should be in invIntSources, 13K should not (it's suspended)
    const hSource = result.invIntSources.find((s) => s.label.includes('Box 13H'))
    expect(hSource).toBeDefined()
    // Normalized to -Math.abs for consistency with other expense sources
    expect(hSource!.amount).toBe(-5000)
    // K is suspended, should not appear in invIntSources
    const kSource = result.invIntSources.find((s) => s.label.includes('Box 13K'))
    expect(kSource).toBeUndefined()
  })

  it('does NOT suspend Box 13L (no 2% floor) — L flows through invIntSources or is excluded from suspended', () => {
    const data = makeK1Data({
      fields: { '5': { value: '10000' } },
      codes: {
        '13': [
          { code: 'L', value: '2000' },
        ],
      },
    })
    const result = computeForm4952Lines({
      reviewedK1Docs: [makeK1Doc(data)],
      reviewed1099Docs: [],
      income1099: defaultIncome1099,
    })
    // L should NOT appear in suspendedLines (it's not a 2% floor deduction)
    // L does not flow to Form 4952 either (it's a Sch A deduction) — but it shouldn't be suspended
    const lSuspended = result.invIntSources.find((s) => s.label.includes('suspended'))
    expect(lSuspended).toBeUndefined()
  })

  it('suspends Box 13AE (portfolio income deductions, 2% floor)', () => {
    const data = makeK1Data({
      fields: { '5': { value: '10000' } },
      codes: {
        '13': [
          { code: 'H', value: '5000' },
          { code: 'AE', value: '3000' },
        ],
      },
    })
    const result = computeForm4952Lines({
      reviewedK1Docs: [makeK1Doc(data)],
      reviewed1099Docs: [],
      income1099: defaultIncome1099,
    })
    // AE should NOT be in invIntSources (it's suspended)
    const aeSource = result.invIntSources.find((s) => s.label.includes('Box 13AE'))
    expect(aeSource).toBeUndefined()
  })

  it('K-1 with K=1000 and L=2000 — correct suspendedLines and invIntSources', () => {
    const data = makeK1Data({
      fields: { '5': { value: '20000' } },
      codes: {
        '13': [
          { code: 'H', value: '8000' },
          { code: 'K', value: '1000' },
          { code: 'L', value: '2000' },
        ],
      },
    })
    const result = computeForm4952Lines({
      reviewedK1Docs: [makeK1Doc(data)],
      reviewed1099Docs: [],
      income1099: defaultIncome1099,
    })
    // H goes to invIntSources
    expect(result.invIntSources.some((s) => s.label.includes('Box 13H'))).toBe(true)
    // K does NOT go to invIntSources (suspended)
    expect(result.invIntSources.some((s) => s.label.includes('Box 13K'))).toBe(false)
    // L does NOT go to invIntSources (it's a Sch A deduction, not investment interest)
    expect(result.invIntSources.some((s) => s.label.includes('Box 13L'))).toBe(false)
    // Total investment interest expense = 8000 (from H only)
    expect(result.totalInvIntExpense).toBe(8000)
  })
})

// ── Issue 2: Box 13AC flows to Form 4952 ─────────────────────────────────────

describe('computeForm4952Lines — Box 13AC (Issue 2)', () => {
  it('includes Box 13AC (debt-financed distrib. interest) in invIntSources', () => {
    const data = makeK1Data({
      fields: { '5': { value: '10000' } },
      codes: {
        '13': [
          { code: 'AC', value: '5000' },
        ],
      },
    })
    const result = computeForm4952Lines({
      reviewedK1Docs: [makeK1Doc(data)],
      reviewed1099Docs: [],
      income1099: defaultIncome1099,
    })
    const acSource = result.invIntSources.find((s) => s.label.includes('Box 13AC'))
    expect(acSource).toBeDefined()
    expect(acSource!.amount).toBe(-5000)
    expect(result.totalInvIntExpense).toBe(5000)
  })
})

// ── Issue 7: Box 13AD and Box 20B flow to Form 4952 ──────────────────────────

describe('computeForm4952Lines — Box 13AD (Issue 7)', () => {
  it('includes Box 13AD (interest expense on oil/gas) in invIntSources', () => {
    const data = makeK1Data({
      fields: { '5': { value: '10000' } },
      codes: {
        '13': [
          { code: 'AD', value: '3000' },
        ],
      },
    })
    const result = computeForm4952Lines({
      reviewedK1Docs: [makeK1Doc(data)],
      reviewed1099Docs: [],
      income1099: defaultIncome1099,
    })
    const adSource = result.invIntSources.find((s) => s.label.includes('Box 13AD'))
    expect(adSource).toBeDefined()
    expect(adSource!.amount).toBe(-3000)
  })
})

describe('computeForm4952Lines — sign normalization (defense-in-depth)', () => {
  it('normalizes negatively-stored Box 13H so it cannot cancel against -Math.abs siblings', () => {
    // GenAI extraction does not guarantee positive values. If 13H arrives
    // negative, the pre-fix code pushed raw n, which would cancel against
    // already-negative 1099-INT Box 5 entries and understate totalInvIntExpense.
    const data = makeK1Data({
      fields: { '5': { value: '10000' } },
      codes: {
        '13': [{ code: 'H', value: '-5000' }],
      },
    })
    const doc = makeK1Doc(data)
    const oneKDoc = {
      ...doc,
      parsed_data: {
        payer_name: 'Acme Broker',
        box5_investment_expense: 1000,
      },
    } as unknown as TaxDocument

    const result = computeForm4952Lines({
      reviewedK1Docs: [doc],
      reviewed1099Docs: [oneKDoc],
      income1099: defaultIncome1099,
    })
    // 13H should be -5000 after normalization (not +5000 from raw parse)
    const hSource = result.invIntSources.find((s) => s.label.includes('Box 13H'))
    expect(hSource!.amount).toBe(-5000)
    // Total = |-5000 + -1000| = 6000 (no cancellation)
    expect(result.totalInvIntExpense).toBe(6000)
  })
})

describe('computeForm4952Lines — Box 20B (Issue 7)', () => {
  it('includes Box 20B (investment expenses) in invIntSources as negative', () => {
    const data = makeK1Data({
      fields: { '5': { value: '10000' } },
      codes: {
        '20': [
          { code: 'B', value: '2500' },
        ],
      },
    })
    const result = computeForm4952Lines({
      reviewedK1Docs: [makeK1Doc(data)],
      reviewed1099Docs: [],
      income1099: defaultIncome1099,
    })
    const bSource = result.invIntSources.find((s) => s.label.includes('Box 20B'))
    expect(bSource).toBeDefined()
    expect(bSource!.amount).toBe(-2500)
  })
})
