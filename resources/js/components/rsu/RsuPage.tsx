'use client'

import currency from 'currency.js'
import { useEffect, useMemo, useState } from 'react'

import Container from '@/components/container'
import { getShares, isVested, shareValue, todayIso } from '@/components/rsu/helpers'
import { RsuByAward } from '@/components/rsu/RsuByAward'
import { RsuByVestDate } from '@/components/rsu/RsuByVestDate'
import RsuChart from '@/components/rsu/RsuChart'
import RsuSubNav from '@/components/rsu/RsuSubNav'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchWrapper } from '@/fetchWrapper'
import type { IAward } from '@/types/finance'

export default function RsuPage() {
  const [loading, setLoading] = useState(true)
  const [rsu, setRsu] = useState<IAward[]>([])
  const [chartMode, setChartMode] = useState<'shares' | 'value'>('shares')
  const [filter, setFilter] = useState<'all' | 'unvested' | 'missing-price' | 'missing-settlement' | 'missing-link'>('all')
  useEffect(() => {
    fetchWrapper
      .get('/api/rsu')
      .then((response) => setRsu(response))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
  }, [])

  const now = todayIso()
  const filteredRsu = useMemo(() => {
    if (filter === 'unvested') return rsu.filter((r) => !isVested(r, now))
    if (filter === 'missing-price') return rsu.filter((r) => r.vest_price == null)
    if (filter === 'missing-settlement') return rsu.filter((r) => !r.settlement_allocations?.length)
    if (filter === 'missing-link') return rsu.filter((r) => !r.rsu_links?.length)
    return rsu
  }, [filter, now, rsu])
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
        <div className="mb-4 flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="all-vests">All vests</TabsTrigger>
            <TabsTrigger value="per-vest-date">Per vest date</TabsTrigger>
            <TabsTrigger value="per-award">Per award</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button className={filter === 'all' ? 'font-semibold' : 'text-muted-foreground'} onClick={() => setFilter('all')}>Actual only</button>
            <button className={filter === 'unvested' ? 'font-semibold' : 'text-muted-foreground'} onClick={() => setFilter('unvested')}>Only unvested</button>
            <button className={filter === 'missing-price' ? 'font-semibold' : 'text-muted-foreground'} onClick={() => setFilter('missing-price')}>Missing vest price</button>
            <button className={filter === 'missing-settlement' ? 'font-semibold' : 'text-muted-foreground'} onClick={() => setFilter('missing-settlement')}>Missing settlement</button>
            <button className={filter === 'missing-link' ? 'font-semibold' : 'text-muted-foreground'} onClick={() => setFilter('missing-link')}>Missing brokerage/payslip link</button>
          </div>
        </div>
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
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRsu.map((r, i) => {
                    const vested = isVested(r, now)
                    const shares = getShares(r)
                    const price = r.vest_price ?? null
                    const total = shareValue(shares, price)
                    const grantPrice = r.grant_price ?? null
                    const grantValue = shareValue(shares, grantPrice)
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
                        <TableCell>
                          <div className="flex flex-col gap-1 text-xs">
                            <span>{r.vest_price_source === 'quote_close' ? 'Quote-derived price' : r.vest_price_source ?? 'Price source missing'}</span>
                            <span>{r.settlement_allocations?.length ? 'Settlement linked' : 'Missing settlement'}</span>
                            <span>{r.rsu_links?.length ? 'Brokerage/payslip linked' : 'Missing link'}</span>
                          </div>
                        </TableCell>
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
              <RsuByVestDate rsu={filteredRsu} />
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="per-award">
          <Card className="mb-8">
            <div className="p-6">
              <h3 className="text-xl font-semibold mb-4">Per award</h3>
              <RsuByAward rsu={rsu} hideFullyVested={filter === 'unvested'} />
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </Container>
  )
}
