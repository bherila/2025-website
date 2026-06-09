# ADR: RSU domain integration

## Status

Accepted.

## Decision

RSU data is modeled as one finance domain with three distinct data lifecycles:

1. `fin_equity_awards` is the canonical mutable source for actual RSU vesting events.
2. Career Comparison stores immutable RSU snapshots and never stores live pointers back to mutable award rows.
3. Future current-job refreshers remain virtual projections and are never written as actual award rows.

## Invariants

- One `fin_equity_awards` row represents one vesting event/tranche.
- Rows with the same `uid`, `award_id`, `grant_date`, and `symbol` form one award schedule.
- Fractional shares are allowed and are stored with decimal precision.
- Same-day vests count as vested.
- Quote-derived vest prices are persisted with `vest_price_source = quote_close` and a fetch timestamp.
- Legacy prices without provenance are marked with the `unknown` source during migration.
- RSU vest settlement is modeled separately from individual vest rows in `fin_rsu_vest_settlements`.
- Whole-share tax withholding is settlement-level data.
- Proportional allocation back to vest rows is analytical and may be fractional.
- Typed RSU links connect settlements, allocations, and vest rows to brokerage transactions, lots, and payslips.

## Consequences

- UI and API language must distinguish award schedules from vesting events.
- Manual, bulk, and GenAI writes must flow through the shared RSU service so omitted prices do not erase existing values.
- Career Comparison share snapshots do not auto-refresh when the user later edits actual RSU rows.
- Tax Preview consumes backend RSU facts rather than duplicating RSU tax math in React.
