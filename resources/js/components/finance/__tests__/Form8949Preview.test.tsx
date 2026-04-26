import { classifyBox, computeForm8949, type Form8949Lot } from '../Form8949Preview'

function mkLot(overrides: Partial<Form8949Lot> = {}): Form8949Lot {
  return {
    symbol: 'AAPL',
    description: '100 sh. AAPL',
    quantity: 100,
    purchase_date: '2023-03-15',
    cost_basis: 10000,
    sale_date: '2025-06-20',
    proceeds: 12000,
    realized_gain_loss: 2000,
    is_short_term: 0,
    lot_source: '1099b',
    ...overrides,
  }
}

describe('classifyBox', () => {
  it('routes 1099b-sourced short-term lots to box A', () => {
    expect(classifyBox(mkLot({ is_short_term: 1, lot_source: '1099b' }))).toBe('A')
  })

  it('routes 1099b-sourced long-term lots to box D', () => {
    expect(classifyBox(mkLot({ is_short_term: 0, lot_source: '1099b' }))).toBe('D')
  })

  it('routes broker-statement short-term lots to box B', () => {
    expect(classifyBox(mkLot({ is_short_term: 1, lot_source: 'broker_statement' }))).toBe('B')
  })

  it('routes manual-entry short-term lots to box C (not on a 1099-B)', () => {
    expect(classifyBox(mkLot({ is_short_term: 1, lot_source: 'manual' }))).toBe('C')
  })

  it('routes manual-entry long-term lots to box F', () => {
    expect(classifyBox(mkLot({ is_short_term: 0, lot_source: 'manual' }))).toBe('F')
  })
})

describe('computeForm8949', () => {
  it('returns empty sections when no lots are provided', () => {
    const data = computeForm8949([])
    expect(data.shortTerm).toHaveLength(0)
    expect(data.longTerm).toHaveLength(0)
    expect(data.partITotals.gain).toBe(0)
    expect(data.partIITotals.gain).toBe(0)
  })

  it('aggregates totals per section (proceeds, basis, gain)', () => {
    const lots: Form8949Lot[] = [
      mkLot({ is_short_term: 1, proceeds: 1000, cost_basis: 800, realized_gain_loss: 200 }),
      mkLot({ is_short_term: 1, proceeds: 500, cost_basis: 600, realized_gain_loss: -100 }),
    ]
    const data = computeForm8949(lots)
    expect(data.shortTerm).toHaveLength(1)
    const sec = data.shortTerm[0]!
    expect(sec.box).toBe('A')
    expect(sec.totals.proceeds).toBe(1500)
    expect(sec.totals.basis).toBe(1400)
    expect(sec.totals.gain).toBe(100)
    expect(data.partITotals.gain).toBe(100)
  })

  it('splits lots across boxes A/B/C and D/E/F by lot_source + holding period', () => {
    const lots: Form8949Lot[] = [
      mkLot({ is_short_term: 1, lot_source: '1099b' }), // A
      mkLot({ is_short_term: 1, lot_source: 'manual' }), // C
      mkLot({ is_short_term: 0, lot_source: '1099b' }), // D
      mkLot({ is_short_term: 0, lot_source: 'broker_statement' }), // E
    ]
    const data = computeForm8949(lots)
    expect(data.shortTerm.map((s) => s.box)).toEqual(['A', 'C'])
    expect(data.longTerm.map((s) => s.box)).toEqual(['D', 'E'])
  })

  it('marks rows with a wash-sale code W when proceeds − basis ≠ gain (i.e. adjustment applied)', () => {
    const lots: Form8949Lot[] = [
      mkLot({
        is_short_term: 1,
        proceeds: 1000,
        cost_basis: 1500,
        // realized_gain_loss is 0 instead of -500 → the engine disallowed the loss
        realized_gain_loss: 0,
      }),
    ]
    const data = computeForm8949(lots)
    const row = data.shortTerm[0]!.rows[0]!
    expect(row.code).toBe('W')
    // Adjustment = proceeds − basis − realized_gain_loss → 1000 − 1500 − 0 = -500.
    // Negative adjustment = disallowed loss added back; magnitude is what matters.
    expect(row.adjustment).toBe(-500)
  })

  it('leaves the code blank when proceeds − basis already equals gain (no adjustment)', () => {
    const lots: Form8949Lot[] = [
      mkLot({ is_short_term: 1, proceeds: 1000, cost_basis: 800, realized_gain_loss: 200 }),
    ]
    const data = computeForm8949(lots)
    const row = data.shortTerm[0]!.rows[0]!
    expect(row.code).toBe('')
    expect(row.adjustment).toBe(0)
  })
})
