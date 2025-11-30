# IB Statement Import - Schema Design

## Overview

Interactive Brokers CSV statements contain multiple sections beyond just trades. This document proposes a schema design to store these additional sections.

## IB CSV Sections

Based on the sample IB CSV, the following sections are available:

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

## Proposed Schema

### Option 1: Generic Statement Details Table

```sql
CREATE TABLE fin_statement_details (
    sd_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sd_account INT UNSIGNED NOT NULL,
    sd_statement_date DATE NOT NULL,
    sd_section VARCHAR(100) NOT NULL,
    sd_key VARCHAR(100) NOT NULL,
    sd_subkey VARCHAR(100) DEFAULT NULL,
    sd_value_text VARCHAR(255) DEFAULT NULL,
    sd_value_numeric DECIMAL(18,6) DEFAULT NULL,
    sd_currency VARCHAR(10) DEFAULT NULL,
    sd_symbol VARCHAR(50) DEFAULT NULL,
    sd_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_account_date (sd_account, sd_statement_date),
    INDEX idx_section (sd_section),
    INDEX idx_symbol (sd_symbol),
    
    FOREIGN KEY (sd_account) REFERENCES fin_accounts(acct_id)
);
```

**Pros:**
- Flexible schema accommodates any section type
- Easy to add new sections without schema changes
- Good for exploratory data analysis

**Cons:**
- Queries can be complex (pivoting)
- No type safety on values
- Storage less efficient

### Option 2: Section-Specific Tables

#### fin_statement_positions
```sql
CREATE TABLE fin_statement_positions (
    pos_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    pos_account INT UNSIGNED NOT NULL,
    pos_date DATE NOT NULL,
    pos_asset_category VARCHAR(50) NOT NULL,
    pos_currency VARCHAR(10) NOT NULL,
    pos_symbol VARCHAR(50) NOT NULL,
    pos_quantity DECIMAL(18,6) NOT NULL,
    pos_multiplier INT DEFAULT 1,
    pos_cost_price DECIMAL(13,4) DEFAULT NULL,
    pos_cost_basis DECIMAL(13,4) DEFAULT NULL,
    pos_close_price DECIMAL(13,4) DEFAULT NULL,
    pos_value DECIMAL(13,4) DEFAULT NULL,
    pos_unrealized_pl DECIMAL(13,4) DEFAULT NULL,
    pos_code VARCHAR(50) DEFAULT NULL,
    
    INDEX idx_account_date (pos_account, pos_date),
    INDEX idx_symbol (pos_symbol),
    
    FOREIGN KEY (pos_account) REFERENCES fin_accounts(acct_id)
);
```

#### fin_statement_cash
```sql
CREATE TABLE fin_statement_cash (
    cash_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    cash_account INT UNSIGNED NOT NULL,
    cash_date DATE NOT NULL,
    cash_currency VARCHAR(10) NOT NULL,
    cash_category VARCHAR(100) NOT NULL,
    cash_description VARCHAR(255) DEFAULT NULL,
    cash_total DECIMAL(13,4) DEFAULT NULL,
    cash_securities DECIMAL(13,4) DEFAULT NULL,
    cash_futures DECIMAL(13,4) DEFAULT NULL,
    
    INDEX idx_account_date (cash_account, cash_date),
    
    FOREIGN KEY (cash_account) REFERENCES fin_accounts(acct_id)
);
```

#### fin_statement_performance
```sql
CREATE TABLE fin_statement_performance (
    perf_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    perf_account INT UNSIGNED NOT NULL,
    perf_date DATE NOT NULL,
    perf_type ENUM('mtm', 'realized', 'unrealized') NOT NULL,
    perf_asset_category VARCHAR(50) NOT NULL,
    perf_symbol VARCHAR(50) DEFAULT NULL,
    perf_prior_qty DECIMAL(18,6) DEFAULT NULL,
    perf_current_qty DECIMAL(18,6) DEFAULT NULL,
    perf_prior_price DECIMAL(13,4) DEFAULT NULL,
    perf_current_price DECIMAL(13,4) DEFAULT NULL,
    perf_cost DECIMAL(13,4) DEFAULT NULL,
    perf_realized_st DECIMAL(13,4) DEFAULT NULL,
    perf_realized_lt DECIMAL(13,4) DEFAULT NULL,
    perf_unrealized_st DECIMAL(13,4) DEFAULT NULL,
    perf_unrealized_lt DECIMAL(13,4) DEFAULT NULL,
    perf_total DECIMAL(13,4) DEFAULT NULL,
    
    INDEX idx_account_date (perf_account, perf_date),
    INDEX idx_symbol (perf_symbol),
    
    FOREIGN KEY (perf_account) REFERENCES fin_accounts(acct_id)
);
```

**Pros:**
- Type-safe columns
- Efficient queries
- Clear data model

**Cons:**
- Requires new table for each section type
- Schema changes when adding new sections

## Recommendation

**Start with Option 1 (Generic Table)** for these reasons:

1. **Exploratory Phase**: We're still discovering what data is useful
2. **Low Volume**: Statement imports happen infrequently (monthly)
3. **Flexibility**: Can store any section without code changes
4. **Migration Path**: Can later create specific tables for high-use sections

### Initial Implementation

Create `fin_statement_details` table and add helper functions to:
- Store section data as key-value pairs
- Query specific sections with pivot
- Generate reports from stored data

### Future Optimization

Once usage patterns are clear:
1. Identify frequently-queried sections
2. Create specific tables for those sections
3. Migrate data from generic table
4. Keep generic table for less-used sections

## Integration with Existing Schema

The statement details work alongside existing tables:

```
fin_accounts
    └── fin_account_line_items (trades, interest, fees)
    └── fin_statement_details (positions, performance, cash)
    └── fin_account_balance_snapshots (balance history)
```

## Next Steps

1. Create `fin_statement_details` migration
2. Add API endpoint to import statement sections
3. Add UI to view statement details
4. Create reports from statement data
