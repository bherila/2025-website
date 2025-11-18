import { parseOptionDescription } from './StockOptionUtil'

describe('parseOptionDescription', () => {
  it('should parse valid option descriptions correctly', () => {
    // Test case 1: NIO Put option
    const nioOption = parseOptionDescription("NIO Jan 20 '23 $85 Put")
    expect(nioOption).toEqual({
      symbol: 'NIO',
      optionType: 'put',
      maturityDate: '2023-01-20',
      strikePrice: 85,
    })

    // Test case 2: BIDU Call option
    const biduOption = parseOptionDescription("BIDU Jan 15 '21 $280 Call")
    expect(biduOption).toEqual({
      symbol: 'BIDU',
      optionType: 'call',
      maturityDate: '2021-01-15',
      strikePrice: 280,
    })

    // Test case 3: ZM Call option
    const zmOption = parseOptionDescription("ZM Jan 15 '21 $430 Call")
    expect(zmOption).toEqual({
      symbol: 'ZM',
      optionType: 'call',
      maturityDate: '2021-01-15',
      strikePrice: 430,
    })

    // Test case 4: TSLA Call option
    const tslaOption = parseOptionDescription("TSLA Mar 19 '21 $1000 Call")
    expect(tslaOption).toEqual({
      symbol: 'TSLA',
      optionType: 'call',
      maturityDate: '2021-03-19',
      strikePrice: 1000,
    })

    // Test case 5: NVDA Call option
    const nvdaOption = parseOptionDescription('CALL NVDA   01/05/24   500.000')
    expect(nvdaOption).toEqual({
      symbol: 'NVDA',
      optionType: 'call',
      maturityDate: '2024-01-05',
      strikePrice: 500,
    })

    // Test case 6: CALL ZM     01/12/2475.000 with tab
    const callZmOption = parseOptionDescription('CALL ZM\t01/12/24\t75.000')
    expect(callZmOption).toEqual({
      symbol: 'ZM',
      optionType: 'call',
      maturityDate: '2024-01-12',
      strikePrice: 75,
    })
  })

  it('should throw an error for invalid option descriptions', () => {
    const invalidDescriptions = [
      'Invalid Description',
      'NIO Jan 20 $85 Put', // Missing year
      "NIO Jan 20 '23 Put", // Missing strike price
      "NIO Jan 20 '23 $85", // Missing option type
    ]

    invalidDescriptions.forEach((description) => {
      expect(parseOptionDescription(description)).toBeNull()
    })
  })
})
