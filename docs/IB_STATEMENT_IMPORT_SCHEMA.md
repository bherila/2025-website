# IB Statement Import Schema Design

## Overview

Interactive Brokers CSV exports contain multiple sections beyond transactions. This document proposes a schema to store this data linked to `fin_account_balance_snapshot`.

## Existing Tables

- `fin_account_balance_snapshot` - Statement date and total balance
- `fin_statement_details` - Flexible key-value storage for statement line items

## Proposed New Tables

### 1. `fin_statement_positions` - Open Positions at Statement Date

Stores the snapshot of holdings at the statement date.

```sql
CREATE TABLE `fin_statement_positions` (
  `position_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `snapshot_id` bigint unsigned NOT NULL,
  `asset_category` varchar(50) DEFAULT NULL,       -- 'Stocks', 'Equity and Index Options', 'Forex'
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

### 2. `fin_statement_performance` - Mark-to-Market & Realized/Unrealized Summary

Stores performance data per symbol for the statement period.

```sql
CREATE TABLE `fin_statement_performance` (
  `perf_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `snapshot_id` bigint unsigned NOT NULL,
  `perf_type` enum('mtm','realized_unrealized') NOT NULL,  -- Which summary section
  `asset_category` varchar(50) DEFAULT NULL,
  `symbol` varchar(50) NOT NULL,
  `prior_quantity` decimal(18,8) DEFAULT NULL,
  `current_quantity` decimal(18,8) DEFAULT NULL,
  `prior_price` decimal(18,8) DEFAULT NULL,
  `current_price` decimal(18,8) DEFAULT NULL,
  -- Mark-to-Market columns
  `mtm_pl_position` decimal(18,4) DEFAULT NULL,
  `mtm_pl_transaction` decimal(18,4) DEFAULT NULL,
  `mtm_pl_commissions` decimal(18,4) DEFAULT NULL,
  `mtm_pl_other` decimal(18,4) DEFAULT NULL,
  `mtm_pl_total` decimal(18,4) DEFAULT NULL,
  -- Realized/Unrealized columns
  `cost_adj` decimal(18,4) DEFAULT NULL,
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

### 3. `fin_statement_cash_report` - Cash Flow Summary

Stores the Cash Report section data.

```sql
CREATE TABLE `fin_statement_cash_report` (
  `cash_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `snapshot_id` bigint unsigned NOT NULL,
  `currency` varchar(10) NOT NULL,              -- 'USD', 'SGD', 'Base Currency Summary'
  `line_item` varchar(100) NOT NULL,            -- 'Starting Cash', 'Commissions', etc.
  `total` decimal(18,4) DEFAULT NULL,
  `securities` decimal(18,4) DEFAULT NULL,
  `futures` decimal(18,4) DEFAULT NULL,
  PRIMARY KEY (`cash_id`),
  KEY `idx_snapshot` (`snapshot_id`),
  CONSTRAINT `fk_cash_report_snapshot` FOREIGN KEY (`snapshot_id`) 
    REFERENCES `fin_account_balance_snapshot` (`snapshot_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4. `fin_statement_nav` - Net Asset Value Breakdown

Stores the Net Asset Value section.

```sql
CREATE TABLE `fin_statement_nav` (
  `nav_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `snapshot_id` bigint unsigned NOT NULL,
  `asset_class` varchar(50) NOT NULL,           -- 'Cash', 'Stock', 'Options', etc.
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

### 5. `fin_statement_securities_lent` - Stock Yield Enhancement Program

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

## Import Flow

1. Parse IB CSV using `parseIbCsv()`
2. Extract statement period end date from `Statement,Data,Period`
3. Extract total NAV from `Net Asset Value,Data,Total`
4. Create `fin_account_balance_snapshot` record with date and balance
5. Import each section into corresponding table:
   - `Net Asset Value` → `fin_statement_nav`
   - `Cash Report` → `fin_statement_cash_report`
   - `Open Positions` → `fin_statement_positions`
   - `Mark-to-Market Performance Summary` → `fin_statement_performance` (perf_type='mtm')
   - `Realized & Unrealized Performance Summary` → `fin_statement_performance` (perf_type='realized_unrealized')
   - `Stock Yield Enhancement Program` → `fin_statement_securities_lent`

## Alternative: Use Existing `fin_statement_details`

For a simpler initial implementation, we could extend the existing `fin_statement_details` table:

```sql
-- Existing structure
CREATE TABLE `fin_statement_details` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `snapshot_id` bigint unsigned NOT NULL,
  `section` varchar(100) NOT NULL,        -- e.g., 'Net Asset Value', 'Cash Report'
  `line_item` varchar(255) NOT NULL,      -- e.g., 'Cash', 'Starting Cash'
  `statement_period_value` decimal(18,4) DEFAULT NULL,
  `ytd_value` decimal(18,4) DEFAULT NULL,
  `is_percentage` tinyint(1) DEFAULT 0,
  -- Add new columns for IB data
  `symbol` varchar(50) DEFAULT NULL,
  `currency` varchar(10) DEFAULT NULL,
  `sub_category` varchar(100) DEFAULT NULL,
  `json_data` json DEFAULT NULL,          -- For complex row data
  PRIMARY KEY (`id`),
  KEY `idx_snapshot_section` (`snapshot_id`, `section`)
);
```

This approach stores everything in one table using `json_data` for complex structures, which is simpler but less queryable.

## Recommendation

Start with the **dedicated tables approach** for these reasons:
1. Type-safe columns for financial data
2. Efficient queries for specific data types
3. Proper decimal precision for monetary values
4. Clear data model for future reporting

The dedicated tables make it easy to build views like:
- "Show all open positions as of date X"
- "Compare performance between two periods"
- "Track securities lending income over time"
