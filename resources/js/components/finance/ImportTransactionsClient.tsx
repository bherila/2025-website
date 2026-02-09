'use client'
import { useCallback,useState } from 'react'

import Container from '@/components/container'
import { Button } from '@/components/ui/button'
import { type IbStatementData } from '@/data/finance/parseIbCsv'

import ImportTransactions from './ImportTransactions'

export default function ImportTransactionsClient({ id, accountName }: { id: number; accountName: string }) {
  const [importFinished, setImportFinished] = useState(false)
  const [currentStatement, setCurrentStatement] = useState<IbStatementData | null>(null)

  const handleStatementParsed = useCallback((statement: IbStatementData | null) => {
    setCurrentStatement(statement)
  }, [])

  return (
    <Container fluid className="px-4">
      <p className="text-sm my-4">
        You can paste or drag/drop: CSV from bank/brokerage, QFX (limited), HAR (Wealthfront), or IB Activity Statement
      </p>
      {importFinished && (
        <div className="my-4">
          <p>
            Import finished. Duplicates were ignored.
            {currentStatement && ' Statement data was imported.'}
          </p>
          <Button onClick={() => (window.location.href = `/finance/${id}`)}>Back to Account</Button>
        </div>
      )}
      <ImportTransactions
        accountId={id}
        onImportFinished={() => setImportFinished(true)}
        onStatementParsed={handleStatementParsed}
      />
    </Container>
  )
}
