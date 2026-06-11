import currency from 'currency.js'

import { getShares, todayIso } from '@/components/rsu/helpers'
import { vestStyle } from '@/components/rsu/vestStyle'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { groupBy } from '@/lib/arrayUtils'
import type { IAward } from '@/types/finance'

export function RsuByVestDate(props: { rsu: IAward[] }) {
  const { rsu } = props
  const actualRsu = rsu.filter((r) => !r.isVirtual)
  const grouped = groupBy(actualRsu, (r) => r.vest_date)
  const now = todayIso()
  return (
    <Table>
      <TableHeader>
        <tr>
          <TableHead>Vest date</TableHead>
          <TableHead>Shares</TableHead>
          <TableHead>Grant price</TableHead>
          <TableHead>Total value at grant</TableHead>
          <TableHead style={{ borderLeft: '2px solid #e5e7eb' }}>Vest price</TableHead>
          <TableHead>Total value at vest</TableHead>
        </tr>
      </TableHeader>
      <TableBody>
        {Object.keys(grouped).map((k) => {
          const lRSU = grouped[k]
          if (!lRSU) return null

          const vested = k <= now
          const totalShares = lRSU.reduce((p, c) => p.add(getShares(c) ?? 0), currency(0))
          // Compute weighted average price and total value using currency.js
          const totalValue = lRSU.reduce((sum, c) => {
            const shares = getShares(c)
            return sum.add(shares && c.vest_price ? currency(shares).multiply(c.vest_price) : currency(0))
          }, currency(0))
          const totalGrantValue = lRSU.reduce((sum, c) => {
            const shares = getShares(c)
            return sum.add(shares && c.grant_price ? currency(shares).multiply(c.grant_price) : currency(0))
          }, currency(0))
          // If all have vest_price, show average price
          const avgPrice = totalShares.value > 0 && lRSU.every((c) => c.vest_price != null && getShares(c) != null)
            ? totalValue.divide(totalShares.value).format()
            : ''
          const avgGrantPrice = totalShares.value > 0 && lRSU.every((c) => c.grant_price != null && getShares(c) != null)
            ? totalGrantValue.divide(totalShares.value).format()
            : ''
          return (
            <TableRow key={k} style={vested ? vestStyle : {}}>
              <TableCell>
                {vested && '✔ '}
                {k}
              </TableCell>
              <TableCell>{totalShares.value}</TableCell>
              <TableCell>{avgGrantPrice}</TableCell>
              <TableCell>{totalGrantValue.value ? totalGrantValue.format() : ''}</TableCell>
              <TableCell style={{ borderLeft: '2px solid #e5e7eb' }}>{avgPrice}</TableCell>
              <TableCell>{totalValue.value ? totalValue.format() : ''}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
