'use client'
import currency from 'currency.js'

import { type FinanceTag } from '@/components/finance/useFinanceTags'
import { Spinner } from '@/components/ui/spinner'
import { Table } from '@/components/ui/table'

interface Props {
  tags: FinanceTag[]
  isLoading: boolean
  error?: string | null
}

/**
 * Displays a table of total transaction amounts grouped by tag and year.
 * Expects each tag to have a `totals` field produced by the
 * GET /api/finance/tags?totals=true endpoint.
 */
export function TagTotalsView({ tags, isLoading, error }: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 gap-2">
        <Spinner size="small" />
        <span>Loading totals…</span>
      </div>
    )
  }

  if (error) {
    return <p className="text-destructive p-4">{error}</p>
  }

  const tagsWithTotals = tags.filter((t) => t.totals)

  if (tagsWithTotals.length === 0) {
    return (
      <p className="text-muted-foreground p-4">
        No tag totals available. Apply tags to transactions to see totals here.
      </p>
    )
  }

  // Collect all non-"all" years across all tags, sorted ascending
  const yearsSet = new Set<string>()
  for (const tag of tagsWithTotals) {
    for (const year of Object.keys(tag.totals ?? {})) {
      if (year !== 'all') yearsSet.add(year)
    }
  }
  const years = [...yearsSet].sort()

  return (
    <div className="overflow-x-auto">
      <Table style={{ fontSize: '90%' }}>
        <thead>
          <tr>
            <th className="text-left px-2 py-1">Tag</th>
            {years.map((y) => (
              <th key={y} className="text-right px-2 py-1">
                {y}
              </th>
            ))}
            <th className="text-right px-2 py-1 font-bold">All Years</th>
          </tr>
        </thead>
        <tbody>
          {tagsWithTotals.map((tag) => (
            <tr key={tag.tag_id}>
              <td className="px-2 py-1">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-medium bg-${tag.tag_color}-200 text-${tag.tag_color}-800`}
                >
                  {tag.tag_label}
                </span>
              </td>
              {years.map((y) => {
                const val = tag.totals?.[y] ?? 0
                return (
                  <td
                    key={y}
                    className="text-right px-2 py-1"
                    style={{ color: val >= 0 ? 'green' : 'red' }}
                  >
                    {currency(val).format()}
                  </td>
                )
              })}
              <td
                className="text-right px-2 py-1 font-bold"
                style={{ color: (tag.totals?.all ?? 0) >= 0 ? 'green' : 'red' }}
              >
                {currency(tag.totals?.all ?? 0).format()}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  )
}
