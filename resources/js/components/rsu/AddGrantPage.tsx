'use client'

import { useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import currency from 'currency.js'
import { fetchWrapper } from '@/fetchWrapper'
import type { IAward } from '@/types/finance'
import RsuSubNav from '@/components/rsu/RsuSubNav'

export default function AddGrantPage() {
  const [shares, setShares] = useState<string>('')
  const [numShares, setNumShares] = useState('')
  const [awardId, setAwardId] = useState('')
  const [symbol, setSymbol] = useState('META')
  const [grantDate, setGrantDate] = useState('')

  const rowsToImport: IAward[] = shares
    .split('\n')
    .map((line) => {
      const cols = line
        .split(/\s/)
        .map((r) => r.trim())
        .filter(Boolean)
      if (cols.length !== 2) {
        return null
      }
      try {
        const vest_date = cols[0]
        const share_count_str = cols[1]
        if (!vest_date || !share_count_str) return null

        return {
          award_id: awardId,
          grant_date: grantDate,
          vest_date: vest_date,
          share_count: currency(share_count_str),
          symbol,
        }
      } catch {
        return null
      }
    })
    .filter((r) => r !== null) as IAward[]

  return (
    <>
      <RsuSubNav />

      <Card>
        <div className="p-6">
          <h3 className="text-xl font-semibold mb-4">Add an award</h3>
          <p className="mb-4 text-muted-foreground">
            Duplicate items (based on grant date + award id + vest date + symbol) will not be added
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              fetchWrapper.post('/api/rsu', rowsToImport).finally(() => {
                setShares('')
              })
            }}
          >
            <div className="space-y-4 mb-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium">Award ID</label>
                <Input value={awardId} onChange={(e) => setAwardId(e.target.value)} placeholder="Enter award ID" />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">Symbol</label>
                <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Enter symbol" />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">Grant date (yyyy-mm-dd)</label>
                <Input
                  value={grantDate}
                  onChange={(e) =>
                    setGrantDate(e.target.value.trim().replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g, '$3-$1-$2'))
                  }
                  placeholder="Enter grant date"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">Number of shares</label>
                <Input
                  value={numShares}
                  onChange={(e) => setNumShares(e.target.value)}
                  placeholder="Enter number of shares"
                />
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <label className="block text-sm font-medium">
                Shares: Paste in format Vest date THEN # of shares. Note that m/d/y dates will be converted to yyyy-mm-dd
                format.
              </label>
              <textarea
                className="w-full p-2 border rounded-md"
                rows={10}
                onChange={(e) =>
                  setShares(
                    e.currentTarget.value.replace(/\t\r?\n/g, '\t').replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g, '$3-$1-$2')
                  )
                }
                value={shares}
              />
            </div>

            <Table className="mb-4">
              <TableHeader>
                <TableRow>
                  <TableHead>Vest date</TableHead>
                  <TableHead>Granted on</TableHead>
                  <TableHead>Shares</TableHead>
                  <TableHead>Grant ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsToImport.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.vest_date}</TableCell>
                    <TableCell>{r.grant_date}</TableCell>
                    <TableCell>{r.share_count?.toString()}</TableCell>
                    <TableCell>{r.award_id}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Button type="submit">Import grants & vests</Button>
          </form>
        </div>
      </Card>
    </>
  )
}
