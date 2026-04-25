import { formRegistry } from '../registry'

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
})
