'use client'
import { useState } from 'react'
import ImportTransactions from './ImportTransactions'
import { fetchWrapper } from '@/fetchWrapper'
import AccountNavigation from './AccountNavigation'
import Container from '@/components/container'
import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import dayjs from 'dayjs'

export default function ImportTransactionsClient({ id, accountName }: { id: number; accountName: string }) {
  const [loading, setLoading] = useState(false)
  const [duplicates, setDuplicates] = useState<AccountLineItem[]>([])
  const [importResult, setImportResult] = useState<{ imported: number; duplicates: number } | null>(null)

  return (
    <Container fluid className="px-4">
      <AccountNavigation accountId={id} accountName={accountName} activeTab="import" />
      <p className="text-sm my-4">
        You can paste or drag/drop: CSV from bank/brokerage, QFX (limited), or HAR (Wealthfront)
      </p>
      {importResult && (
        <div className="my-4">
          <p>
            Imported {importResult.imported} new transactions. Found {importResult.duplicates} duplicates.
          </p>
          <Button onClick={() => (window.location.href = `/finance/${id}`)}>Back to Account</Button>
        </div>
      )}
      <ImportTransactions
        duplicates={duplicates}
        onImportClick={async (data) => {
          z.array(AccountLineItemSchema).parse(data)
          setLoading(true)

          const earliestDate = data.reduce((min, p) => (dayjs(p.t_date).isBefore(dayjs(min)) ? p.t_date : min), data[0].t_date)
          const latestDate = data.reduce((max, p) => (dayjs(p.t_date).isAfter(dayjs(max)) ? p.t_date : max), data[0].t_date)

          const existingTransactions = await fetchWrapper.get(
            `/api/finance/${id}/line_items?start_date=${earliestDate}&end_date=${latestDate}`,
          )

          const duplicates = data.filter((item) =>
            existingTransactions.some(
              (dup: AccountLineItem) =>
                dup.t_date === item.t_date &&
                (dup.t_type ?? '').includes(item.t_type ?? '') &&
                (dup.t_description ?? '').includes(item.t_description ?? '') &&
                (dup.t_qty ?? 0) === (item.t_qty ?? 0) &&
                dup.t_amt === item.t_amt,
            ),
          )
          setDuplicates(duplicates)

          const newTransactions = data.filter(
            (item) =>
              !duplicates.some(
                (dup) =>
                  dup.t_date === item.t_date &&
                  (dup.t_type ?? '').includes(item.t_type ?? '') &&
                  (dup.t_description ?? '').includes(item.t_description ?? '') &&
                  (dup.t_qty ?? 0) === (item.t_qty ?? 0) &&
                  dup.t_amt === item.t_amt,
              ),
          )

          if (newTransactions.length > 0) {
            const response = await fetchWrapper.post(`/api/finance/${id}/line_items`, newTransactions)
            setImportResult({ imported: response.imported, duplicates: duplicates.length })
          } else {
            setImportResult({ imported: 0, duplicates: duplicates.length })
          }

          setLoading(false)
        }}
      />
    </Container>
  )
}
