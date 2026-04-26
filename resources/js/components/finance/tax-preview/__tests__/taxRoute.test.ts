import {
  EMPTY_ROUTE,
  parseHash,
  pushColumn,
  replaceFrom,
  routesEqual,
  serializeRoute,
  truncateTo,
} from '../taxRoute'

describe('taxRoute', () => {
  describe('parseHash', () => {
    it('returns empty route for empty hash', () => {
      expect(parseHash('')).toEqual(EMPTY_ROUTE)
      expect(parseHash('#')).toEqual(EMPTY_ROUTE)
      expect(parseHash('#/')).toEqual(EMPTY_ROUTE)
    })

    it('parses a single form column', () => {
      expect(parseHash('#/form-1040')).toEqual({
        columns: [{ form: 'form-1040' }],
      })
    })

    it('parses a multi-column drill-down', () => {
      expect(parseHash('#/form-1040/sch-1/form-1116')).toEqual({
        columns: [{ form: 'form-1040' }, { form: 'sch-1' }, { form: 'form-1116' }],
      })
    })

    it('parses an instance key from the form:instance suffix', () => {
      expect(parseHash('#/form-1040/form-1116:passive')).toEqual({
        columns: [{ form: 'form-1040' }, { form: 'form-1116', instance: 'passive' }],
      })
    })

    it('decodes URI-encoded instance keys', () => {
      expect(parseHash('#/sch-e:rental%20property')).toEqual({
        columns: [{ form: 'sch-e', instance: 'rental property' }],
      })
    })

    it('drops unknown form ids silently', () => {
      expect(parseHash('#/form-1040/unknown-form/sch-1')).toEqual({
        columns: [{ form: 'form-1040' }, { form: 'sch-1' }],
      })
    })

    it('handles trailing slashes and empty segments', () => {
      expect(parseHash('#/form-1040///sch-1/')).toEqual({
        columns: [{ form: 'form-1040' }, { form: 'sch-1' }],
      })
    })
  })

  describe('serializeRoute', () => {
    it('serializes the empty route to empty string', () => {
      expect(serializeRoute(EMPTY_ROUTE)).toBe('')
    })

    it('serializes a single column', () => {
      expect(serializeRoute({ columns: [{ form: 'form-1040' }] })).toBe('#/form-1040')
    })

    it('serializes form:instance segments', () => {
      expect(
        serializeRoute({
          columns: [{ form: 'form-1040' }, { form: 'form-1116', instance: 'passive' }],
        }),
      ).toBe('#/form-1040/form-1116:passive')
    })

    it('URI-encodes instance keys with special characters', () => {
      expect(
        serializeRoute({
          columns: [{ form: 'sch-e', instance: 'rental property' }],
        }),
      ).toBe('#/sch-e:rental%20property')
    })

    it('round-trips parse → serialize', () => {
      const inputs = [
        '#/form-1040',
        '#/form-1040/sch-1/form-1116:passive',
        '#/sch-e:3',
        '#/form-1040/form-1116:general/wks-se-401k',
      ]
      for (const input of inputs) {
        expect(serializeRoute(parseHash(input))).toBe(input)
      }
    })
  })

  describe('pushColumn', () => {
    it('appends a column to the end', () => {
      const before = { columns: [{ form: 'form-1040' as const }] }
      const after = pushColumn(before, { form: 'sch-1' })
      expect(after.columns).toEqual([{ form: 'form-1040' }, { form: 'sch-1' }])
    })

    it('does not mutate the input route', () => {
      const before = { columns: [{ form: 'form-1040' as const }] }
      pushColumn(before, { form: 'sch-1' })
      expect(before.columns).toEqual([{ form: 'form-1040' }])
    })
  })

  describe('truncateTo', () => {
    const route = {
      columns: [{ form: 'form-1040' as const }, { form: 'sch-1' as const }, { form: 'form-1116' as const }],
    }

    it('keeps the first N columns', () => {
      expect(truncateTo(route, 1).columns).toEqual([{ form: 'form-1040' }])
      expect(truncateTo(route, 2).columns).toEqual([{ form: 'form-1040' }, { form: 'sch-1' }])
    })

    it('returns empty for depth 0', () => {
      expect(truncateTo(route, 0)).toEqual(EMPTY_ROUTE)
    })

    it('returns empty for negative depth', () => {
      expect(truncateTo(route, -1)).toEqual(EMPTY_ROUTE)
    })

    it('returns the full route when depth exceeds length', () => {
      expect(truncateTo(route, 99)).toEqual(route)
    })
  })

  describe('replaceFrom', () => {
    const route = {
      columns: [{ form: 'form-1040' as const }, { form: 'sch-1' as const }, { form: 'form-1116' as const }],
    }

    it('replaces the column at depth and drops the right side', () => {
      expect(replaceFrom(route, 1, { form: 'sch-2' }).columns).toEqual([
        { form: 'form-1040' },
        { form: 'sch-2' },
      ])
    })

    it('replaces at depth 0', () => {
      expect(replaceFrom(route, 0, { form: 'home' }).columns).toEqual([{ form: 'home' }])
    })

    it('treats negative depth as a full reset', () => {
      expect(replaceFrom(route, -1, { form: 'home' }).columns).toEqual([{ form: 'home' }])
    })
  })

  describe('routesEqual', () => {
    it('returns true for identical routes', () => {
      expect(
        routesEqual(
          { columns: [{ form: 'form-1040' }, { form: 'form-1116', instance: 'passive' }] },
          { columns: [{ form: 'form-1040' }, { form: 'form-1116', instance: 'passive' }] },
        ),
      ).toBe(true)
    })

    it('returns false when columns differ', () => {
      expect(
        routesEqual(
          { columns: [{ form: 'form-1040' }] },
          { columns: [{ form: 'form-1040' }, { form: 'sch-1' }] },
        ),
      ).toBe(false)
    })

    it('returns false when instance differs', () => {
      expect(
        routesEqual(
          { columns: [{ form: 'form-1116', instance: 'passive' }] },
          { columns: [{ form: 'form-1116', instance: 'general' }] },
        ),
      ).toBe(false)
    })
  })
})
