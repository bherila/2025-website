import { normalizeGeminiImportResponse } from './importTypes'

describe('normalizeGeminiImportResponse', () => {
  it('normalizes tool-call payloads into typed account blocks', () => {
    const result = normalizeGeminiImportResponse({
      toolCalls: [
        {
          toolName: 'addFinanceAccount',
          payload: {
            statementInfo: {
              brokerName: 'Broker',
              accountNumber: '1234',
              periodStart: '2025-01-01T12:30:00Z',
              closingBalance: '(1,234.56)',
            },
            statementDetails: [
              {
                section: 'Statement Summary ($)',
                line_item: 'Net Return',
                statement_period_value: '(23.50)',
                ytd_value: '100.25',
                is_percentage: 'false',
              },
            ],
            transactions: [{ date: '2025-01-01 09:00:00', description: 'Deposit', amount: '100.50' }],
            lots: [{ symbol: 'AAPL', quantity: '1', purchaseDate: '2024-01-01T00:00:00Z', costBasis: '50.10' }],
          },
        },
      ],
    })

    expect(result).toEqual({
      accounts: [
        {
          statementInfo: {
            brokerName: 'Broker',
            accountNumber: '1234',
            periodStart: '2025-01-01',
            closingBalance: -1234.56,
          },
          statementDetails: [
            {
              section: 'Statement Summary ($)',
              line_item: 'Net Return',
              statement_period_value: -23.5,
              ytd_value: 100.25,
              is_percentage: false,
            },
          ],
          transactions: [{ date: '2025-01-01', description: 'Deposit', amount: 100.5 }],
          lots: [{ symbol: 'AAPL', quantity: 1, purchaseDate: '2024-01-01', costBasis: 50.1 }],
        },
      ],
    })
  })

  it('keeps multi-account tool-call responses intact', () => {
    const result = normalizeGeminiImportResponse({
      toolCalls: [
        {
          toolName: 'addFinanceAccount',
          payload: {
            statementInfo: { brokerName: 'Broker A', accountNumber: '1111' },
            statementDetails: [],
            transactions: [{ date: '2025-01-01', description: 'Deposit', amount: 100 }],
            lots: [],
          },
        },
        {
          toolName: 'addFinanceAccount',
          payload: {
            statementInfo: { brokerName: 'Broker B', accountNumber: '2222' },
            statementDetails: [],
            transactions: [{ date: '2025-01-02', description: 'Dividend', amount: 50 }],
            lots: [],
          },
        },
      ],
    })

    expect(result?.accounts).toHaveLength(2)
    expect(result?.accounts[0]?.statementInfo?.accountNumber).toBe('1111')
    expect(result?.accounts[1]?.transactions?.[0]?.description).toBe('Dividend')
  })

  it('normalizes legacy single-account JSON into tool-call compatible accounts array', () => {
    const result = normalizeGeminiImportResponse({
      statementInfo: { brokerName: 'Broker' },
      transactions: [{ date: '2025-01-01', description: 'Deposit', amount: 100 }],
    })

    expect(result).toEqual({
      accounts: [
        {
          statementInfo: { brokerName: 'Broker' },
          statementDetails: [],
          transactions: [{ date: '2025-01-01', description: 'Deposit', amount: 100 }],
          lots: [],
        },
      ],
    })
  })
})
