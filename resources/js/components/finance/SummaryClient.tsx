import currency from 'currency.js'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import Masonry from '@/components/ui/masonry'

interface Props {
  totals: {
    total_volume: number
    total_commission: number
    total_fee: number
  }
  symbolSummary: {
    t_symbol: string
    total_amount: number
  }[]
  monthSummary: {
    month: string
    total_amount: number
  }[]
}

export default function SummaryClient({ totals, symbolSummary, monthSummary }: Props) {
  return (
    <Masonry columnsCount={3} gutter="16px">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Account Totals</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell>Total Volume</TableCell>
                <TableCell className="text-end">{currency(totals.total_volume.valueOf()).format()}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Total Commissions</TableCell>
                <TableCell className="text-end">{currency(totals.total_commission).format()}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Total Fees</TableCell>
                <TableCell className="text-end">{currency(totals.total_fee).format()}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>By Symbol</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead className="text-end">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {symbolSummary.map(({ t_symbol, total_amount }) => (
                <TableRow key={t_symbol}>
                  <TableCell>{t_symbol}</TableCell>
                  <TableCell className="text-end">{currency(total_amount).format()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>By Month</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-end">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthSummary.map(({ month, total_amount }) => (
                <TableRow key={month}>
                  <TableCell>{month}</TableCell>
                  <TableCell className="text-end">{currency(total_amount).format()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Masonry>
  )
}