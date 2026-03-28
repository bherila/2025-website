import { normalizeGeminiImportResponse } from './importTypes'

describe('normalizeGeminiImportResponse', () => {
  it('keeps unified accounts responses intact', () => {
    const result = normalizeGeminiImportResponse({
      accounts: [
        {
          statementInfo: { brokerName: 'Broker', accountNumber: '1234' },
          statementDetails: [],
          transactions: [{ date: '2025-01-01', description: 'Deposit', amount: 100 }],
          lots: [],
        },
      ],
    })

    expect(result).toEqual({
      accounts: [
        {
          statementInfo: { brokerName: 'Broker', accountNumber: '1234' },
          statementDetails: [],
          transactions: [{ date: '2025-01-01', description: 'Deposit', amount: 100 }],
          lots: [],
        },
      ],
    })
  })

  it('normalizes legacy single-account responses into accounts array', () => {
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
