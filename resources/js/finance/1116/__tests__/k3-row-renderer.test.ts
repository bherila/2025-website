import type { K3Section } from '@/types/finance/k1-data'

import { renderK3SectionRows } from '../k3-row-renderer'

describe('renderK3SectionRows', () => {
  it('renders row arrays into structured rows', () => {
    const section: K3Section = {
      sectionId: 'part2_section1',
      title: 'Part II Section 1',
      data: {
        rows: [
          { line: '6', country: 'DE', col_a_us_source: 10, col_c_passive: 20, col_f_sourced_by_partner: 5, col_g_total: 35 },
        ],
      },
    }

    const rows = renderK3SectionRows(section)
    expect(rows[0]?.isHeader).toBe(true)
    expect(rows[1]?.line).toBe('Line 6')
    expect(rows[1]?.amount).toBe(35)
    expect(rows[1]?.note).toContain('Country: DE')
  })
})
