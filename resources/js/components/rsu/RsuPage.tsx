'use client'

import currency from 'currency.js'
import { useEffect, useState } from 'react'

import Container from '@/components/container'
import { getShares, isVested,shareValue, todayIso } from '@/components/rsu/helpers'
import { RsuByAward } from '@/components/rsu/RsuByAward'
import { RsuByVestDate } from '@/components/rsu/RsuByVestDate'
import RsuChart from '@/components/rsu/RsuChart'
import RsuSubNav from '@/components/rsu/RsuSubNav'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent,TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchWrapper } from '@/fetchWrapper'
import type { IAward } from '@/types/finance'

export default function RsuPage() {
  const [loading, setLoading] = useState(true)
  const [rsu, setRsu] = useState<IAward[]>([])
  const [chartMode, setChartMode] = useState<'shares' | 'value'>('shares')
  const [showOnlyUnvested, setShowOnlyUnvested] = useState(false)
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

  const now = todayIso()
  const filteredRsu = showOnlyUnvested ? rsu.filter((r) => !isVested(r, now)) : rsu
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
          <label className="flex items-center gap-2 text-sm select-none cursor-pointer">
            <Switch checked={showOnlyUnvested} onCheckedChange={setShowOnlyUnvested} />
            Only show unvested
          </label>
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
              <RsuByAward rsu={rsu} hideFullyVested={showOnlyUnvested} />
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </Container>
  )
}
