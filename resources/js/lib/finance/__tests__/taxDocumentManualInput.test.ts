import { buildManualInputPrompt, extractBrokerEntriesFromManualInput, formatManualTaxInput, parseManualTaxInput } from '../taxDocumentManualInput'

describe('taxDocumentManualInput', () => {
  it('round-trips TOON input client-side before API submission', () => {
    const value = {
      payer_name: 'Fidelity',
      box1a_ordinary: 1816.11,
      box1b_qualified: 1732.51,
    }

    const toon = formatManualTaxInput(value, 'toon')

    expect(parseManualTaxInput(toon, 'toon')).toEqual(value)
  })

  it('accepts TOON copied with a markdown fence or language label', () => {
    const value = {
      payer_name: 'Fidelity',
      transactions: [
        { symbol: 'ABBV', proceeds: 2087.74, cost_basis: 2085.98 },
      ],
    }
    const toon = formatManualTaxInput(value, 'toon')

    expect(parseManualTaxInput(`\`\`\`toon\n${toon}\n\`\`\``, 'toon')).toEqual(value)
    expect(parseManualTaxInput(`toon\n${toon}`, 'toon')).toEqual(value)
  })

  it('extracts broker entries from a TOON-decoded accounts object', () => {
    const parsed = parseManualTaxInput(formatManualTaxInput({
      accounts: [
        {
          account_identifier: 'x2070',
          account_name: 'Schwab RSU Account',
          form_type: '1099_div',
          tax_year: 2025,
          parsed_data: { box1a_ordinary: 50 },
        },
      ],
    }, 'toon'), 'toon')

    expect(extractBrokerEntriesFromManualInput(parsed)).toEqual([
      {
        account_identifier: 'x2070',
        account_name: 'Schwab RSU Account',
        form_type: '1099_div',
        tax_year: 2025,
        parsed_data: { box1a_ordinary: 50 },
      },
    ])
  })

  it('builds a TOON-specific prompt while preserving schema context', () => {
    const prompt = buildManualInputPrompt({
      prompt: 'Return ONLY a valid JSON object with payer_name.',
      form_label: '1099-DIV',
      json_schema: { type: 'OBJECT', properties: { payer_name: { type: 'STRING' } } },
    }, 'toon')

    expect(prompt).toContain('Return ONLY valid TOON')
    expect(prompt).toContain('return TOON instead')
    expect(prompt).toContain('payer_name')
  })
})
