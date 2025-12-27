import type { IAward } from '@/types/finance'
import _ from 'lodash'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { vestStyle } from '@/components/rsu/vestStyle'
import currency from 'currency.js'

export function RsuByVestDate(props: { rsu: IAward[] }) {
  const { rsu } = props
  const grouped = _.groupBy(rsu, (r) => r.vest_date)
  const now = new Date().toISOString().slice(0, 10)
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
        {Object.keys(grouped).map((k, i) => {
          const lRSU = grouped[k]
          if (!lRSU) return null

          const vested = k < now
          const totalShares = lRSU.reduce((p, c) => p.add(c.share_count!), currency(0))
          // Compute weighted average price and total value using currency.js
          const totalValue = lRSU.reduce((sum, c) => {
            const shares = typeof c.share_count === 'object' ? c.share_count.value : c.share_count
            return sum.add(shares && c.vest_price ? currency(shares).multiply(c.vest_price) : currency(0))
          }, currency(0))
          const totalGrantValue = lRSU.reduce((sum, c) => {
            const shares = typeof c.share_count === 'object' ? c.share_count.value : c.share_count
            return sum.add(shares && c.grant_price ? currency(shares).multiply(c.grant_price) : currency(0))
          }, currency(0))
          // If all have vest_price, show average price
          const avgPrice = lRSU.every((c) => c.vest_price != null && c.share_count != null)
            ? totalValue.divide(totalShares.value).format()
            : ''
          const avgGrantPrice = lRSU.every((c) => c.grant_price != null && c.share_count != null)
            ? totalGrantValue.divide(totalShares.value).format()
            : ''
          return (
            <TableRow key={i} style={vested ? vestStyle : {}}>
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
