'use client'
import { useState } from 'react'
import ImportTransactions from './ImportTransactions'
import Container from '@/components/container'
import { type AccountLineItem } from '@/data/finance/AccountLineItem'
import { Button } from '@/components/ui/button'

export default function ImportTransactionsClient({ id, accountName }: { id: number; accountName: string }) {
  const [duplicates, setDuplicates] = useState<AccountLineItem[]>([])
  const [importFinished, setImportFinished] = useState(false)

  return (
    <Container fluid className="px-4">
      <p className="text-sm my-4">
        You can paste or drag/drop: CSV from bank/brokerage, QFX (limited), or HAR (Wealthfront)
      </p>
      {importFinished && (
        <div className="my-4">
          <p>
            Import finished. Duplicates were ignored.
          </p>
          <Button onClick={() => (window.location.href = `/finance/${id}`)}>Back to Account</Button>
        </div>
      )}
      <ImportTransactions
        accountId={id}
        duplicates={duplicates}
        onImportFinished={() => setImportFinished(true)}
      />
    </Container>
  )
}
