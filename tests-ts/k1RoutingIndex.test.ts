import { buildK1RoutingIndex, k1CellKey, routingLabel, routingToFormId } from '@/lib/finance/k1RoutingIndex'
import type { TaxFactSource, TaxPreviewFacts } from '@/types/generated/tax-preview-facts'

function source(overrides: Partial<TaxFactSource>): TaxFactSource {
  return {
    sourceType: 'K1',
    routing: null,
    id: 'src',
    label: 'label',
    amount: 0,
    taxDocumentId: null,
    taxDocumentAccountId: null,
    accountId: null,
    formType: 'K-1-1065',
    box: null,
    code: null,
    routingReason: null,
    notes: null,
    isReviewed: false,
    reviewStatus: 'pending',
    reviewAction: null,
    ...overrides,
  }
}

describe('routingToFormId', () => {
  it.each([
    ['schedule_b_line_1', 'sch-b'],
    ['schedule_d_line_5', 'sch-d'],
    ['schedule_e_line_28', 'sch-e'],
    ['schedule_se_line_2', 'sch-se'],
    ['schedule_a_line_9', 'sch-a'],
    ['schedule_1_line_15', 'sch-1'],
    ['sch_1_8z', 'sch-1'],
    ['schedule_3_line_1', 'sch-3'],
    ['form_1040_line_2b', 'form-1040'],
    ['form_1116_line_1a', 'form-1116'],
    ['form_4952_line_1', 'form-4952'],
    ['form_4797_part_i_line_7', 'form-4797'],
    ['form_8995_line_1', 'form-8995'],
    ['excluded_form_4952_line_5', 'form-4952'],
    ['default_schedule_1_8z', 'sch-1'],
    ['needs_review_schedule_d_line_5_or_12', 'sch-d'],
  ])('maps %s -> %s', (routing, formId) => {
    expect(routingToFormId(routing)).toBe(formId)
  })

  it.each(['form_8829_line_36', 'form_8959_line_1', 'form_8960_line_1', 'unknown_routing'])(
    'returns undefined for forms without a registry column: %s',
    (routing) => {
      expect(routingToFormId(routing)).toBeUndefined()
    },
  )
})

describe('routingLabel', () => {
  it.each([
    ['schedule_d_line_5', 'Sch D line 5'],
    ['form_1116_line_1a', 'Form 1116 line 1a'],
    ['schedule_se_line_2', 'Sch SE line 2'],
    ['form_1040_line_2b', 'Form 1040 line 2b'],
  ])('prettifies %s', (routing, label) => {
    expect(routingLabel(routing)).toBe(label)
  })
})

describe('buildK1RoutingIndex', () => {
  it('returns an empty map for null facts', () => {
    expect(buildK1RoutingIndex(null).size).toBe(0)
  })

  it('groups sources by (taxDocumentId, box, code) and dedupes by routing', () => {
    const facts = {
      scheduleB: {
        interestSources: [
          source({ taxDocumentId: 101, box: '5', code: null, routing: 'schedule_b_line_1', routingReason: 'reason A' }),
          // duplicate routing for the same cell — should be deduped
          source({ taxDocumentId: 101, box: '5', code: null, routing: 'schedule_b_line_1', routingReason: 'reason A2' }),
        ],
      },
      scheduleE: {
        box11ZZSources: [
          source({ taxDocumentId: 102, box: '11', code: 'ZZ', routing: 'schedule_e_line_28' }),
        ],
      },
      // sources missing taxDocumentId or box are ignored
      scheduleA: {
        otherItemizedSources: [source({ taxDocumentId: null, box: '5', routing: 'schedule_a_line_16' })],
      },
    } as unknown as TaxPreviewFacts

    const index = buildK1RoutingIndex(facts)

    const box5 = index.get(k1CellKey(101, '5', null))
    expect(box5).toHaveLength(1)
    expect(box5?.[0]).toMatchObject({ routing: 'schedule_b_line_1', formId: 'sch-b', label: 'Sch B line 1' })

    const box11zz = index.get(k1CellKey(102, '11', 'zz'))
    expect(box11zz).toHaveLength(1)
    expect(box11zz?.[0]).toMatchObject({ routing: 'schedule_e_line_28', formId: 'sch-e' })

    // null-doc source was skipped
    expect([...index.keys()].some((key) => key.startsWith('|') || key.includes('null'))).toBe(false)
  })
})
