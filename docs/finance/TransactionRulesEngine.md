# Transaction Rules Engine

The Transaction Rules Engine automates actions on financial transactions when they are created, imported, or when a rule is explicitly run against existing transactions. Rules are user-owned and only evaluated for transactions belonging to the same user.

## Overview

Rules consist of **conditions** (all combined with logical AND) and **actions** (executed in order). When all conditions match a transaction, the rule's actions are applied. Rules are evaluated in user-defined order, and a rule can optionally stop further rule processing when matched.

## Architecture

### File Layout

```
app/Finance/RulesEngine/
├── DTOs/
│   ├── ActionResult.php
│   ├── TransactionProcessingResult.php
│   └── RuleRunSummary.php
├── Conditions/
│   ├── RuleConditionEvaluatorInterface.php
│   ├── AmountConditionEvaluator.php
│   ├── StockSymbolConditionEvaluator.php
│   ├── OptionTypeConditionEvaluator.php
│   ├── AccountConditionEvaluator.php
│   ├── DirectionConditionEvaluator.php
│   ├── DescriptionContainsConditionEvaluator.php
│   └── ConditionEvaluatorRegistry.php
├── Actions/
│   ├── RuleActionHandlerInterface.php
│   ├── AddTagActionHandler.php
│   ├── RemoveTagActionHandler.php
│   ├── RemoveAllTagsActionHandler.php
│   ├── FindReplaceActionHandler.php
│   ├── SetDescriptionActionHandler.php
│   ├── SetMemoActionHandler.php
│   ├── NegateAmountActionHandler.php
│   ├── StopProcessingActionHandler.php
│   └── ActionHandlerRegistry.php
├── TransactionRuleLoader.php
└── TransactionRuleProcessor.php
```

### Database Tables

| Table | Purpose |
|-------|---------|
| `fin_rules` | Rule definitions with user ownership, ordering, and enable/disable |
| `fin_rule_conditions` | Conditions attached to rules (AND logic) |
| `fin_rule_actions` | Actions attached to rules (executed in order) |
| `fin_rule_logs` | Audit log of rule executions, errors, and timing |

### Models

- `FinRule` — Rule with conditions and actions relationships
- `FinRuleCondition` — Individual condition on a rule
- `FinRuleAction` — Individual action on a rule
- `FinRuleLog` — Execution log entry

## Conditions

All conditions on a rule are combined with logical **AND**. Zero conditions means the rule applies to all transactions.

| Type | Operators | Description |
|------|-----------|-------------|
| `amount` | `ABOVE`, `BELOW`, `EXACTLY`, `BETWEEN` | Compares absolute transaction amount |
| `stock_symbol_presence` | `HAVE`, `DO_NOT_HAVE` | Checks if stock symbol is present |
| `option_type` | `ANY`, `CALL`, `PUT` | Checks option type field |
| `account_id` | `EQUALS` | Matches specific account ID |
| `direction` | `INCOME`, `EXPENSE` | Checks if amount is positive or negative |
| `description_contains` | `CONTAINS`, `NOT_CONTAINS` | Case-insensitive substring match in description or memo |

## Actions

Actions are executed in their defined order. They mutate the in-memory transaction, and subsequent rules evaluate against the mutated state.

| Type | Target | Payload | Description |
|------|--------|---------|-------------|
| `add_tag` | Tag ID | — | Idempotently adds a tag to the transaction |
| `remove_tag` | Tag ID | — | Removes a specific tag |
| `remove_all_tags` | — | — | Removes all tags from the transaction |
| `find_replace` | Search string | Replace string | Case-insensitive find & replace in description and memo |
| `set_description` | New description | — | Sets the transaction description |
| `set_memo` | New memo | — | Sets the transaction memo/comment |
| `negate_amount` | — | — | Multiplies the amount by -1 |
| `stop_processing_if_match` | — | — | Stops evaluating further rules for this transaction |

## Processing Logic

1. Load active rules for the user, ordered by `order` field
2. For each transaction:
   a. For each rule (skip if `is_disabled`):
      - Evaluate all conditions (AND). If any fail, skip (no log entry).
      - If all match: execute actions in order, mutating the transaction
      - On action error: catch, log to `fin_rule_logs`, report to Sentry, continue
      - If `stop_processing_if_match` flag or action: stop evaluating further rules
      - Write log entry with action summary and processing time
3. Errors on one transaction do not stop the batch

### Run Now

The "Run Rule Now" feature processes the rule against the latest **1,000 transactions** (by `id DESC`) across the user's accounts. Log entries are marked with `is_manual_run = true`.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/finance/rules` | List all rules for current user |
| `POST` | `/api/finance/rules` | Create a new rule with conditions and actions |
| `PUT` | `/api/finance/rules/{id}` | Update a rule (replaces conditions and actions) |
| `DELETE` | `/api/finance/rules/{id}` | Soft-delete a rule |
| `POST` | `/api/finance/rules/reorder` | Swap order of two adjacent rules |
| `POST` | `/api/finance/rules/{id}/run` | Run a rule against latest 1,000 transactions |

## UI

The rules management UI is accessible from the **Config** page (`/finance/config`), represented by a gear (Settings) icon in the Finance navigation bar.

### Components

| Component | Description |
|-----------|-------------|
| `RulesList` | Main page showing all rules with empty state |
| `RuleRow` | Individual rule display with controls |
| `RuleEditorModal` | Dialog for creating/editing rules |
| `ConditionsEditor` | Dynamic condition row builder |
| `ActionsEditor` | Dynamic action row builder |
| `OrderControls` | Up/down arrow buttons for reordering |

### Features

- **Empty state**: "No rules yet. Create your first rule to automate transaction processing."
- **Ordering**: Up/down arrows swap adjacent rules (no rule re-execution on reorder)
- **Run Now**: Optional checkbox in editor with confirmation prompt
- **Keyboard**: Ctrl+Enter submits the editor dialog
- **Loading state**: Save button shows spinner during save operation

## Testing

### PHP Tests (`tests/Feature/FinanceRulesEngine/`)

- `RuleConditionEvaluatorTest` — All 6 condition evaluators
- `RuleActionHandlerTest` — All 8 action handlers including tag idempotency
- `TransactionRuleProcessorTest` — End-to-end processing, ordering, stop-processing, batch
- `TransactionRuleLoaderTest` — Loading, ordering, user isolation
- `FinRuleLogTest` — Audit logging, error recording, timing

### TypeScript Tests (`resources/js/components/finance/rules_engine/__tests__/`)

- `RulesList.test.tsx` — Empty state, loading, list rendering
- `RuleEditorModal.test.tsx` — Form validation, loading state, Ctrl+Enter
- `ConditionsEditor.test.tsx` — Add/remove conditions
- `ActionsEditor.test.tsx` — Add/remove actions
- `OrderControls.test.tsx` — Arrow button behavior and disabled states

## Future Improvements

- **OR groups / nested logic**: Allow combining conditions with OR in addition to AND
- **Regex support**: Add regex matching for description/memo conditions
- **Scheduled rule execution**: Run rules on a schedule (e.g., daily)
- **Rule templates**: Pre-built rule templates for common patterns (e.g., "tag all Amazon purchases")
- **Bulk run**: Run all rules against all transactions (with pagination)
- **Rule import/export**: JSON-based rule sharing between users
- **Condition: date range**: Match transactions by date range
- **Condition: tag presence**: Match transactions that have/don't have specific tags
- **Action: set category**: Set Schedule C category directly
- **Action: merge transactions**: Combine related transactions
- **Audit trail UI**: View rule execution history in the UI
- **Rule performance metrics**: Dashboard showing rule match rates and processing times
- **Dry-run mode**: Preview what a rule would do without applying changes
- **Rule groups/folders**: Organize rules into categories
- **Webhook/notification**: Notify user when rules match specific patterns
