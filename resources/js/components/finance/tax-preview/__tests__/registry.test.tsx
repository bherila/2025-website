import { ALL_FORM_IDS } from '../formRegistry'
import { formRegistry } from '../registry'
import { FORM_IDS } from '../taxRoute'

describe('formRegistry', () => {
  it('registers entries with matching id field', () => {
    for (const [key, entry] of Object.entries(formRegistry)) {
      expect(entry).toBeDefined()
      expect(entry!.id).toBe(key)
    }
  })

  it('column-presentation entries have a component', () => {
    for (const entry of Object.values(formRegistry)) {
      if (entry?.presentation === 'column') {
        expect(entry.component).toBeDefined()
      }
    }
  })

  it('every entry has at least one keyword for command-palette search', () => {
    for (const entry of Object.values(formRegistry)) {
      expect(entry).toBeDefined()
      expect(entry!.keywords.length).toBeGreaterThan(0)
    }
  })

  it('includes the initial migrated forms', () => {
    expect(formRegistry['form-1040']).toBeDefined()
    expect(formRegistry['sch-1']).toBeDefined()
    expect(formRegistry.home).toBeDefined()
  })

  it('schedules use Schedule category, forms use Form category', () => {
    expect(formRegistry['sch-1']!.category).toBe('Schedule')
    expect(formRegistry['form-1040']!.category).toBe('Form')
    expect(formRegistry.home!.category).toBe('App')
  })

  it('renders Estimate at the same wide column width as Documents', () => {
    expect(formRegistry.estimate!.wide).toBe(true)
    expect(formRegistry.documents!.wide).toBe(true)
  })

  it('every registered form id is in the route allowlist so it can be navigated to', () => {
    // The Miller router round-trips routes through the URL hash, dropping any
    // column whose id is not allowlisted in FORM_IDS. A registry id missing
    // from the allowlist therefore renders as a no-op click (it snaps back to
    // Home). This guards against that drift — see All-in-One K-1 (#745).
    for (const id of Object.keys(formRegistry)) {
      expect(FORM_IDS.has(id)).toBe(true)
    }
  })

  it('the route allowlist contains no ids without a registry entry', () => {
    for (const id of ALL_FORM_IDS) {
      expect(formRegistry[id]).toBeDefined()
    }
  })
})
