'use client'

import { useEffect, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { fetchWrapper } from '@/fetchWrapper'
import type { IAward } from '@/types/finance'
import { RsuByVestDate } from '@/components/rsu/RsuByVestDate'
import { RsuByAward } from '@/components/rsu/RsuByAward'
import RsuChart from '@/components/rsu/RsuChart'
import RsuSubNav from '@/components/rsu/RsuSubNav'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import currency from 'currency.js'
import Container from '@/components/container'

export default function RSUPage() {
  const [loading, setLoading] = useState(true)
  const [rsu, setRsu] = useState<IAward[]>([])
  const [chartMode, setChartMode] = useState<'shares' | 'value'>('shares')
  useEffect(() => {
    fetchWrapper
      .get('/api/rsu')
      .then((response) => setRsu(response))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
  }, [])

  if (!rsu) {
    return null
  }

  const now = new Date().toISOString().slice(0, 10)
  return (
    <Container>
      <RsuSubNav />
      <div className="mb-8">
        <Tabs defaultValue={chartMode} onValueChange={(v) => setChartMode(v as 'shares' | 'value')} className="mb-2">
          <TabsList>
            <TabsTrigger value="shares">Share count</TabsTrigger>
            <TabsTrigger value="value">Value</TabsTrigger>
          </TabsList>
        </Tabs>
        <RsuChart rsu={rsu} mode={chartMode} />
      </div>
      <Tabs defaultValue="all-vests">
        <TabsList className="mb-4">
          <TabsTrigger value="all-vests">All vests</TabsTrigger>
          <TabsTrigger value="per-vest-date">Per vest date</TabsTrigger>
          <TabsTrigger value="per-award">Per award</TabsTrigger>
        </TabsList>
        <TabsContent value="all-vests">
          <Card className="mb-8">
            <div className="p-6">
              <h3 className="text-xl font-semibold mb-4">All vests</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vest date</TableHead>
                    <TableHead>Granted on</TableHead>
                    <TableHead>Shares</TableHead>
                    <TableHead>Grant price</TableHead>
                    <TableHead>Grant value</TableHead>
                    <TableHead style={{ borderLeft: '2px solid #e5e7eb' }}>Vest price</TableHead>
                    <TableHead>Total value at vest</TableHead>
                    <TableHead>Grant ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rsu.map((r, i) => {
                    const vested = r.vest_date! < now
                    const shares = typeof r.share_count === 'object' ? r.share_count.value : r.share_count
                    const price = r.vest_price ?? null
                    const total = price != null && shares != null ? currency(shares).multiply(price) : null
                    const grantPrice = r.grant_price ?? null
                    const grantValue = grantPrice != null && shares != null ? currency(shares).multiply(grantPrice) : null
                    return (
                      <TableRow key={i} className={vested ? 'opacity-50 line-through' : ''}>
                        <TableCell>
                          {vested && '✔ '}
                          {r.vest_date}
                        </TableCell>
                        <TableCell>{r.grant_date}</TableCell>
                        <TableCell>{shares}</TableCell>
                        <TableCell>{grantPrice != null ? currency(grantPrice).format() : ''}</TableCell>
                        <TableCell>{grantValue ? grantValue.format() : ''}</TableCell>
                        <TableCell style={{ borderLeft: '2px solid #e5e7eb' }}>
                          {price != null ? currency(price).format() : ''}
                        </TableCell>
                        <TableCell>{total ? total.format() : ''}</TableCell>
                        <TableCell>{r.award_id}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {loading && (
                <div className="flex justify-center py-4">
                  <Spinner />
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="per-vest-date">
          <Card className="mb-8">
            <div className="p-6">
              <h3 className="text-xl font-semibold mb-4">Per vest date</h3>
              <RsuByVestDate rsu={rsu} />
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="per-award">
          <Card className="mb-8">
            <div className="p-6">
              <h3 className="text-xl font-semibold mb-4">Per award</h3>
              <RsuByAward rsu={rsu} />
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </Container>
  )
}
