# IB Statement Schema

Interactive Brokers CSV statements contain multiple sections beyond just trades. This doc covers what sections exist and how they're stored.

## IB CSV Sections

| Section | Description | Import Priority |
|---------|-------------|-----------------|
| `Statement` | Broker name, account info, period | Low (metadata) |
| `Account Information` | Account details | Low (metadata) |
| `Net Asset Value` | NAV by asset class | Medium |
| `Change in NAV` | NAV changes | Medium |
| `Mark-to-Market Performance Summary` | MTM P&L by symbol | High |
| `Realized & Unrealized Performance Summary` | P&L summary | High |
| `Cash Report` | Cash movements by currency | High |
| `Open Positions` | End-of-period positions | High |
| `Forex Balances` | FX position values | Medium |
| `Trades` | Transaction details | **Already parsed** |
| `Transaction Fees` | Detailed fee breakdown | Medium |
| `Fees` | Fee summary | **Already parsed** |
| `Interest` | Interest income/expense | **Already parsed** |
| `Interest Accruals` | Accrued interest | Low |
| `GST Details` | Tax details (Singapore) | Low |
| `Borrow Fee Details` | Short borrow fees | Medium |
| `Stock Yield Enhancement Program` | Securities lending | Low |
| `Financial Instrument Information` | Instrument details | **Used for lookup** |

## Schema: Dedicated Tables (Recommended)

Dedicated tables provide type-safe columns, efficient queries, and clear data model. Linked to `fin_account_balance_snapshot` via `snapshot_id`.

### `fin_statement_positions` — Open Positions

```sql
CREATE TABLE `fin_statement_positions` (
  `position_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `snapshot_id` bigint unsigned NOT NULL,
  `asset_category` varchar(50) DEFAULT NULL,
  `currency` varchar(10) DEFAULT NULL,
  `symbol` varchar(50) NOT NULL,
  `quantity` decimal(18,8) DEFAULT NULL,
  `multiplier` int DEFAULT 1,
  `cost_price` decimal(18,8) DEFAULT NULL,
  `cost_basis` decimal(18,4) DEFAULT NULL,
  `close_price` decimal(18,8) DEFAULT NULL,
  `market_value` decimal(18,4) DEFAULT NULL,
  `unrealized_pl` decimal(18,4) DEFAULT NULL,
  `opt_type` enum('call','put') DEFAULT NULL,
  `opt_strike` varchar(20) DEFAULT NULL,
  `opt_expiration` date DEFAULT NULL,
  PRIMARY KEY (`position_id`),
  KEY `idx_snapshot` (`snapshot_id`),
  KEY `idx_symbol` (`symbol`),
  CONSTRAINT `fk_positions_snapshot` FOREIGN KEY (`snapshot_id`)
    REFERENCES `fin_account_balance_snapshot` (`snapshot_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### `fin_statement_performance` — MTM & Realized/Unrealized P&L

```sql
CREATE TABLE `fin_statement_performance` (
  `perf_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `snapshot_id` bigint unsigned NOT NULL,
  `perf_type` enum('mtm','realized_unrealized') NOT NULL,
  `asset_category` varchar(50) DEFAULT NULL,
  `symbol` varchar(50) NOT NULL,
  `prior_quantity` decimal(18,8) DEFAULT NULL,
  `current_quantity` decimal(18,8) DEFAULT NULL,
  `prior_price` decimal(18,8) DEFAULT NULL,
  `current_price` decimal(18,8) DEFAULT NULL,
  -- MTM columns
  `mtm_pl_position` decimal(18,4) DEFAULT NULL,
  `mtm_pl_transaction` decimal(18,4) DEFAULT NULL,
  `mtm_pl_commissions` decimal(18,4) DEFAULT NULL,
  `mtm_pl_other` decimal(18,4) DEFAULT NULL,
  `mtm_pl_total` decimal(18,4) DEFAULT NULL,
  -- Realized/Unrealized columns
  `realized_st_profit` decimal(18,4) DEFAULT NULL,
  `realized_st_loss` decimal(18,4) DEFAULT NULL,
  `realized_lt_profit` decimal(18,4) DEFAULT NULL,
  `realized_lt_loss` decimal(18,4) DEFAULT NULL,
  `realized_total` decimal(18,4) DEFAULT NULL,
  `unrealized_st_profit` decimal(18,4) DEFAULT NULL,
  `unrealized_st_loss` decimal(18,4) DEFAULT NULL,
  `unrealized_lt_profit` decimal(18,4) DEFAULT NULL,
  `unrealized_lt_loss` decimal(18,4) DEFAULT NULL,
  `unrealized_total` decimal(18,4) DEFAULT NULL,
  `total_pl` decimal(18,4) DEFAULT NULL,
  PRIMARY KEY (`perf_id`),
  KEY `idx_snapshot` (`snapshot_id`),
  KEY `idx_symbol` (`symbol`),
  CONSTRAINT `fk_performance_snapshot` FOREIGN KEY (`snapshot_id`)
    REFERENCES `fin_account_balance_snapshot` (`snapshot_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### `fin_statement_cash_report` — Cash Flow Summary

```sql
CREATE TABLE `fin_statement_cash_report` (
  `cash_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `snapshot_id` bigint unsigned NOT NULL,
  `currency` varchar(10) NOT NULL,
  `line_item` varchar(100) NOT NULL,
  `total` decimal(18,4) DEFAULT NULL,
  `securities` decimal(18,4) DEFAULT NULL,
  `futures` decimal(18,4) DEFAULT NULL,
  PRIMARY KEY (`cash_id`),
  KEY `idx_snapshot` (`snapshot_id`),
  CONSTRAINT `fk_cash_report_snapshot` FOREIGN KEY (`snapshot_id`)
    REFERENCES `fin_account_balance_snapshot` (`snapshot_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### `fin_statement_nav` — Net Asset Value

```sql
CREATE TABLE `fin_statement_nav` (
  `nav_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `snapshot_id` bigint unsigned NOT NULL,
  `asset_class` varchar(50) NOT NULL,
  `prior_total` decimal(18,4) DEFAULT NULL,
  `current_long` decimal(18,4) DEFAULT NULL,
  `current_short` decimal(18,4) DEFAULT NULL,
  `current_total` decimal(18,4) DEFAULT NULL,
  `change_amount` decimal(18,4) DEFAULT NULL,
  PRIMARY KEY (`nav_id`),
  KEY `idx_snapshot` (`snapshot_id`),
  CONSTRAINT `fk_nav_snapshot` FOREIGN KEY (`snapshot_id`)
    REFERENCES `fin_account_balance_snapshot` (`snapshot_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### `fin_statement_securities_lent` — Stock Yield Enhancement Program

```sql
CREATE TABLE `fin_statement_securities_lent` (
  `lent_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `snapshot_id` bigint unsigned NOT NULL,
  `symbol` varchar(50) NOT NULL,
  `start_date` date DEFAULT NULL,
  `fee_rate` decimal(10,6) DEFAULT NULL,
  `quantity` decimal(18,8) DEFAULT NULL,
  `collateral_amount` decimal(18,4) DEFAULT NULL,
  `interest_earned` decimal(18,4) DEFAULT NULL,
  PRIMARY KEY (`lent_id`),
  KEY `idx_snapshot` (`snapshot_id`),
  CONSTRAINT `fk_securities_lent_snapshot` FOREIGN KEY (`snapshot_id`)
    REFERENCES `fin_account_balance_snapshot` (`snapshot_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## Alternative: Generic `fin_statement_details` Table

For simpler initial implementation, the existing `fin_statement_details` table stores everything as key-value rows with `json_data` for complex structures. Less queryable but requires no schema changes per section.

## Import Flow

1. Parse IB CSV using `parseIbCsv()`
2. Extract statement period end date from `Statement,Data,Period`
3. Extract total NAV from `Net Asset Value,Data,Total`
4. Create `fin_account_balance_snapshot` record
5. Import each section into the corresponding table:
   - `Net Asset Value` → `fin_statement_nav`
   - `Cash Report` → `fin_statement_cash_report`
   - `Open Positions` → `fin_statement_positions`
   - `Mark-to-Market Performance Summary` → `fin_statement_performance` (`perf_type='mtm'`)
   - `Realized & Unrealized Performance Summary` → `fin_statement_performance` (`perf_type='realized_unrealized'`)
   - `Stock Yield Enhancement Program` → `fin_statement_securities_lent`
