import currency from 'currency.js'

import { type FK1StructuredData,isFK1StructuredData } from '@/types/finance/k1-data'

/**
 * Returns the K-3 "Sourced by Partner" election state for a K-1 document.
 * Accepts `unknown` so it works with both typed FK1StructuredData and the
 * untyped `parsed_data` / `editData` coming from the review modal.
 */
export function getSbpElection(data: unknown): boolean {
  if (!isFK1StructuredData(data)) return false
  return data.k3Elections?.sourcedByPartnerAsUSSource ?? false
}

export function parseK1Field(data: FK1StructuredData, box: string): number {
  const v = data.fields[box]?.value
  if (!v) return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

export function parseK1Codes(data: FK1StructuredData, box: string): number {
  const items = data.codes[box] ?? []
  return items.reduce((acc, item) => {
    const n = parseFloat(item.value)
    return isNaN(n) ? acc : acc.add(n)
  }, currency(0)).value
}

export function k1NetIncome(data: FK1StructuredData): number {
  // Box 6b (qualified dividends) is a subset of Box 6a (ordinary dividends) — exclude to avoid double-counting.
  const INCOME_BOXES = ['1', '2', '3', '4', '5', '6a', '6c', '7', '8', '9a', '9b', '9c', '10']
  const incomeTotal = INCOME_BOXES.reduce((acc, box) => acc.add(parseK1Field(data, box)), currency(0))
    .add(parseK1Codes(data, '11'))
  const box12 = parseK1Field(data, '12')
  const box21 = parseK1Field(data, '21')
  const deductionTotal = currency(0)
    .add(box12 !== 0 ? -Math.abs(box12) : 0)
    .subtract(parseK1Codes(data, '13'))
    .add(box21 !== 0 ? -Math.abs(box21) : 0)
  return incomeTotal.add(deductionTotal).value
}
