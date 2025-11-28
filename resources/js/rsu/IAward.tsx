import currency from 'currency.js'
export interface IAward {
  award_id?: string | undefined
  grant_date?: string | undefined
  vest_date?: string | undefined
  share_count?: currency | number | undefined
  symbol?: string | undefined
  vest_price?: number | undefined // price per share at vest date
  grant_price?: number | undefined // price per share at grant date
}
