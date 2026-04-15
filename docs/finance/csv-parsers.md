# CSV & File Parsers

## Supported Formats

| Parser | File | Broker |
|--------|------|--------|
| `parseEtradeCsv.ts` | E-Trade CSV | E-Trade |
| `parseSchwabCsv.ts` | Schwab CSV | Charles Schwab |
| `parseFidelityCsv.ts` | Fidelity CSV | Fidelity |
| `parseIbCsv.ts` | IB Activity Statement | Interactive Brokers |
| `parseQuickenQFX.ts` | QFX/OFX | Various |
| `parseWealthfrontHAR.ts` | HAR export | Wealthfront |

---

## Unified Import Parser

The `parseImportData.ts` module provides a unified entry point for parsing imported data:

**Location**: `resources/js/data/finance/parseImportData.ts`

```typescript
import { parseImportData } from '@/data/finance/parseImportData'

const { data, statement, parseError } = parseImportData(text)
```

The parser tries each format in order until one succeeds:
1. E-Trade CSV
2. Quicken QFX/OFX
3. Wealthfront HAR
4. Schwab CSV (before Fidelity to avoid misdetection)
5. Fidelity CSV
6. Interactive Brokers CSV (with statement data)
7. Generic CSV fallback

---

## Schwab CSV Parser

**Location**: `resources/js/data/finance/parseSchwabCsv.ts`

Schwab CSV format headers:
```
"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"
```

- Dates may include an "as of" qualifier: `"11/17/2025 as of 11/15/2025"` — the primary date is used
- Amounts use `$` prefix and may be negative: `"$1,234.56"` or `"-$1,234.56"`
- `isSchwabCsv()` detection: scans first 5 lines for "Action" and "Fees & Comm" headers
- Action types mapped to canonical `t_type` values (e.g., `Short Sale` → `Sell Short`, `Buy to Cover` → `Cover`, `Cash In Lieu` → `Cash In Lieu`)

---

## IB CSV Statement Data

The IB CSV parser (`parseIbCsv.ts`) extracts both transaction-level and statement-level data:

**Transaction Data:** Trades (stocks and options), Interest, Fees

**Statement Data:**
- Statement info (period, account, broker)
- Net Asset Value (NAV) by asset class
- Cash Report line items
- Open Positions with cost basis
- Mark-to-Market Performance by symbol
- Realized & Unrealized Performance summary

Statement data is stored in dedicated tables linked to `fin_statements`:
- `fin_statement_nav` — NAV breakdown
- `fin_statement_cash_report` — Cash flow items
- `fin_statement_positions` — Holdings snapshot
- `fin_statement_performance` — P/L by symbol
- `fin_statement_details` — Statement line items (MTD/YTD values)
