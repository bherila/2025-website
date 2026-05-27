/**
 * Normalized lot DTO shape returned by GET /api/finance/lot-workspace.
 * This is the single source of truth for lot data across all consumer surfaces.
 */
export interface NormalizedLot {
  id: number
  source: string | null
  lot_origin: string | null
  document_id: number | null
  statement_id: number | null
  account_id: number
  account_name: string | null
  account_number: string | null
  symbol: string
  cusip: string | null
  description: string | null
  quantity: string
  acquired_date: string | null
  sold_date: string | null
  basis: string
  proceeds: string | null
  wash_sale_disallowed: string | null
  realized_gain: string | null
  is_short_term: boolean | null
  form_8949_box: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | null
  is_covered: boolean | null
  accrued_market_discount: string | null
  reconciliation_state: string | null
  superseded_by: number | null
  lot_source: string | null
  created_at: string | null
  updated_at: string | null
}

export interface LotWorkspaceSummary {
  total_proceeds: number
  total_basis: number
  total_wash_sale: number
  total_realized_gain: number
  count: number
  counts_by_source: Record<string, number>
  counts_by_state: Record<string, number>
}

export interface LotWorkspaceMeta {
  current_page: number
  last_page: number
  per_page: number
  total: number
}

export interface LotWorkspaceResponse {
  data: NormalizedLot[]
  summary: LotWorkspaceSummary
  meta: LotWorkspaceMeta
}
