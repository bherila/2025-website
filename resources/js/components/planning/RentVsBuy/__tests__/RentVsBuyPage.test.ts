import { parseInputs, serializeInputs } from '@/components/planning/RentVsBuy/RentVsBuyPage'

describe('RentVsBuyPage URL state', () => {
  it('round-trips useCaliforniaProp13 through serialize/parse', () => {
    const enabled = parseInputs('?prop13=true')
    expect(enabled.useCaliforniaProp13).toBe(true)
    expect(parseInputs(`?${serializeInputs(enabled)}`).useCaliforniaProp13).toBe(true)

    const disabled = parseInputs('?prop13=false')
    expect(disabled.useCaliforniaProp13).toBe(false)
    expect(parseInputs(`?${serializeInputs(disabled)}`).useCaliforniaProp13).toBe(false)
  })

  it('serializes booleans as "true"/"false" so the reader contract holds', () => {
    const params = new URLSearchParams(serializeInputs(parseInputs('?prop13=true')))
    expect(params.get('prop13')).toBe('true')

    const offParams = new URLSearchParams(serializeInputs(parseInputs('?prop13=false')))
    expect(offParams.get('prop13')).toBe('false')
  })

  it('also accepts the legacy "1" truthy alias', () => {
    expect(parseInputs('?prop13=1').useCaliforniaProp13).toBe(true)
  })
})
