import { getLabel, optionsForEntityType, requiredEntityType } from '../taxCharacteristics'

describe('tax characteristics', () => {
  it('includes investment management fee classification-only characteristics', () => {
    expect(getLabel('fee_irc67g')).toBe('Investment Management Fee (Personal)')
    expect(getLabel('fee_schE')).toBe('Investment Management Fee (Sch E)')
    expect(requiredEntityType('fee_irc67g')).toBeNull()
    expect(requiredEntityType('fee_schE')).toBeNull()

    const personalOptions = optionsForEntityType(null)
    expect(personalOptions).toContainEqual({
      value: 'fee_irc67g',
      label: 'Investment Management Fee (Personal)',
    })
    expect(personalOptions).toContainEqual({
      value: 'fee_schE',
      label: 'Investment Management Fee (Sch E)',
    })
  })
})
