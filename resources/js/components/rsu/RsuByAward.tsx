import currency from 'currency.js'

import { getShares, isVested, todayIso } from '@/components/rsu/helpers'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { groupBy, maxValue, minValue } from '@/lib/arrayUtils'
import type { IAward } from '@/types/finance'

export function RsuByAward(props: { rsu: IAward[]; hideFullyVested?: boolean }) {
  const { rsu, hideFullyVested = false } = props
  const grouped = groupBy(rsu, (r) => r.award_id)
  const now = todayIso()
  return (
    <Table>
      <TableHeader>
        <tr>
          <TableHead>Grant ID</TableHead>
          <TableHead>Shares</TableHead>
          <TableHead>Avg grant price</TableHead>
          <TableHead>Total value at grant</TableHead>
          <TableHead style={{ borderLeft: '2px solid #e5e7eb' }}>Avg vest price</TableHead>
          <TableHead>Vested value at vest</TableHead>
          <TableHead>Unvested value at vest</TableHead>
          <TableHead>Total value at vest</TableHead>
        </tr>
      </TableHeader>
      <TableBody>
        {Object.keys(grouped).map((k, i) => {
          const lRSU = grouped[k]
          if (!lRSU) return null
          if (hideFullyVested && lRSU.every((r) => isVested(r, now))) return null

          const minDate = minValue(lRSU.map((x) => x.vest_date))
          const maxDate = maxValue(lRSU.map((x) => x.vest_date))
          let totalVested = 0
          let totalUnvested = 0
          let total = 0
          let vestedValue = currency(0)
          let unvestedValue = currency(0)
          let totalValue = currency(0)
          let weightedSum = currency(0)
          let weightedShares = 0
          let totalGrantValue = currency(0)
          let weightedGrantSum = currency(0)
          let weightedGrantShares = 0
          for (const share of lRSU) {
            const shares = getShares(share)
            const price = share.vest_price ?? null
            if (shares != null) {
              total += shares
              if (isVested(share, now)) {
                totalVested += shares
                if (price != null) vestedValue = vestedValue.add(currency(shares).multiply(price))
              } else {
                totalUnvested += shares
                if (price != null) unvestedValue = unvestedValue.add(currency(shares).multiply(price))
              }
              if (price != null) {
                totalValue = totalValue.add(currency(shares).multiply(price))
                weightedSum = weightedSum.add(currency(shares).multiply(price))
                weightedShares += shares
              }
              if (share.grant_price != null) {
                totalGrantValue = totalGrantValue.add(currency(shares).multiply(share.grant_price))
                weightedGrantSum = weightedGrantSum.add(currency(shares).multiply(share.grant_price))
                weightedGrantShares += shares
              }
            }
          }
          const avgPrice = weightedShares > 0 ? weightedSum.divide(weightedShares).format() : ''
          const avgGrantPrice = weightedGrantShares > 0 ? weightedGrantSum.divide(weightedGrantShares).format() : ''
          return (
            <TableRow key={i}>
              <TableCell>
                {k}
                <br />
                <small>
                  {minDate} to {maxDate}
                </small>
              </TableCell>
              <TableCell>
                <span style={{ textDecoration: 'line-through' }}>{totalVested}</span>/{total}
              </TableCell>
              <TableCell>{avgGrantPrice}</TableCell>
              <TableCell>{totalGrantValue.value ? totalGrantValue.format() : ''}</TableCell>
              <TableCell style={{ borderLeft: '2px solid #e5e7eb' }}>{avgPrice}</TableCell>
              <TableCell>{vestedValue.value ? vestedValue.format() : ''}</TableCell>
              <TableCell>{unvestedValue.value ? unvestedValue.format() : ''}</TableCell>
              <TableCell>{totalValue.value ? totalValue.format() : ''}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
