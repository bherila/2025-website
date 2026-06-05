# Fee Analytics

Fee analytics are implemented in `app/Services/Finance/FeeAnalyticsService.php` and surfaced through the account Fees tab and all-accounts Fees tab.

## Signed Fee Convention

The load-bearing convention is:

- Fee charge: positive cost.
- Fee credit or reversal: negative cost.

The source column determines the sign transform:

| Source row | Signed fee cost |
|------------|-----------------|
| `t_type` in `Fee`, `Advisory Fee`, `Management Fee` | `-t_amt` |
| Other fee rows with `t_fee` | `t_fee` |

Fee transaction rows use `-t_amt` because imported charges store negative transaction amounts and credits store positive transaction amounts. Embedded fee rows use `t_fee` directly because imported charges store positive fees and credits store negative fees.

Exact zero fee amounts are skipped. Non-zero credits stay in actual totals, characteristic buckets, monthly fee drag, and `line_items`.

## Actual Fee Buckets

Actual fee payloads are net signed values:

- `actual.total`
- `actual.by_characteristic.fee_schE`
- `actual.by_characteristic.fee_irc67g`
- `actual.by_characteristic.untagged`
- `actual.line_items[].fee_amount`

These values may be negative when credits exceed charges. The total is always the sum of the three characteristic buckets.

Fee tags choose the bucket:

- `fee_schE` routes to Schedule E.
- `fee_irc67g` routes to personal Section 67(g) fees.
- Rows without either fee tax characteristic route to `untagged`.
- If both fee characteristics are present, Schedule E wins for deterministic treatment.

## Monthly Fee Drag

Monthly fee drag uses the same signed helper as actual fees. A month with net fee credits can therefore have negative `fees`.

The chart payload reports annualized return percentages, not return dollars:

- `net_return_pct = ((ending balance - starting balance + withdrawals - deposits) / starting balance) * 12 * 100`
- `gross_return_pct = ((net return + signed fees) / starting balance) * 12 * 100`

Annualization is intentionally simple multiplication by 12, not compounding. The `fees` payload field stays in signed dollars for tooltip/context display.

If there is no usable starting balance or no statement closing in the month, both percentage fields are `null`; the chart treats that as a gap rather than a 0% flatline. Months after the latest available statement close are flagged with `is_projected: true`: because they have no in-month statement their own metrics are `null`, so the series carries the most recent actual annualized return forward into them as a flat value, and the UI draws those projected segments with dotted lines (anchored to the last actual point). Projected months stay `null` only when no prior actual month produced a return to carry. The all-accounts series computes a blended percentage using the sum of account starting balances as the denominator instead of averaging account-level percentages.

## K-1 Reconciliation

K-1 fee buckets are parsed as gross absolute values. To avoid false mismatches after actual statement fees became net signed values, K-1 reconciliation compares those K-1 buckets against gross statement buckets only for reconciliation.

Gross statement buckets are computed by summing `abs(fee_amount)` by characteristic. The account Summary card and all-accounts totals remain net signed values.
