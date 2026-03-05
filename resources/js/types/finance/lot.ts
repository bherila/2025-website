export interface Lot {
    lot_id: number
    acct_id: number
    symbol: string
    description: string | null
    quantity: string
    purchase_date: string
    cost_basis: string
    cost_per_unit: string | null
    sale_date: string | null
    proceeds: string | null
    realized_gain_loss: string | null
    is_short_term: boolean | null
    lot_source: string | null
    open_t_id: number | null
    close_t_id: number | null
    statement?: {
        statement_id: number
        statement_closing_date: string
    } | null
}

export interface GainLossSummary {
    short_term_gains: number
    short_term_losses: number
    long_term_gains: number
    long_term_losses: number
    total_realized: number
}

export interface LotsResponse {
    lots: Lot[]
    summary: GainLossSummary | null
    closedYears: number[]
}

export interface ParsedLotRow {
    acquired: string
    dateSold: string | null
    quantity: number
    costBasis: number
    costBasisPerShare: number
    proceeds: number | null
    proceedsPerShare: number | null
    shortTermGainLoss: number | null
    longTermGainLoss: number | null
}

export interface LotImportRow extends ParsedLotRow {
    symbol: string
    description: string
    openTId: number | null
    closeTId: number | null
    openTIdMatched: boolean
    closeTIdMatched: boolean
    isDuplicate: boolean
}

export interface TransactionMatch {
    t_id: number
    t_date: string
    t_type: string | null
    t_description: string | null
    t_symbol: string | null
    t_qty: number | null
    t_amt: number | null
    t_price: number | null
}
