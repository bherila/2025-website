# ADR / Spec: §731 / §736 / §751 disposition-character treatment

## Status

Accepted (spec only — no behavior change). Decomposed from #943; part of the partnership
outside-basis follow-up epic (#956). Implements the spec deliverable of #955.

## Context

The basis ledger already computes the *amount* of gain/loss on a partnership disposition:

- **Excess cash distributions** (IRC §731(a)(1)): when cumulative distributions exceed available
  outside basis, the excess is gain. See `PartnershipBasisFactsBuilder::distributionGainAllocations()`.
- **Sale/exchange of the whole interest** (IRC §741): amount realized − outside basis. See
  `PartnershipBasisFactsBuilder::saleExchangeAllocations()` and `PartnershipBasisSaleExchangeMath`.
- **Liquidation estimate**: a fallback `liquidation_gain_loss_cents` derived from remaining outside
  basis when no explicit `sale_exchange` event exists.

What it does **not** know is the **character** of that gain/loss. The general rule (§741) is that
gain or loss is capital, reported on Form 8949 / Schedule D — which is what the ledger already does
(short → line 3 / box C, long → line 10 / box F, indeterminate → review-only). But three Code
sections override or recharacterize that capital treatment, and each needs inputs the basis ledger
cannot derive from the K-1 rollforward alone:

- **§751** — "hot assets" recharacterize part of an otherwise-capital gain as **ordinary**.
- **§736** — payments to a *retiring/withdrawing* partner split into ordinary (§736(a)) and
  property/capital (§736(b)) components.
- **§731(b)/(c) + §732** — the **character and basis of distributed property received**, which
  determines later gain when the partner disposes of that property.

This spec documents, for each, the required inputs, what the ledger can vs. cannot infer today, and
the recommendation on what to automate vs. keep review-only.

## §731 — gain/loss on the deemed sale of the interest (already implemented for cash)

**Rule.** Under §731(a)(1) a partner recognizes gain only to the extent money distributed exceeds
the adjusted basis of the partner's interest. That gain is treated as gain from the sale or exchange
of the partnership interest — i.e. **capital** under §741, subject to §751.

**What the ledger has.** Distribution events, running outside basis, and a deemed disposition date
per excess-distribution slice. This is fully implemented and routed to Form 8949 / Schedule D with a
holding-period determination (`dispositionRouting()`), or left review-only when the holding period is
indeterminate.

**Worked example (implemented).**

| Input | Value |
|-------|-------|
| Beginning outside basis | $100,000 |
| Cash distribution (2024-09-30) | $130,000 |
| Interest acquired | 2019-06-01 (long-term) |

Outside basis absorbs $100,000; the remaining **$30,000 is §731(a)(1) gain**. Holding period is
long-term, so it routes to Form 8949 Part II (box F) → Schedule D line 10. Cost basis on the 8949
row is `0` because the basis was already consumed by the tax-free portion of the distribution.

**Gap (deferred to §751 below).** The $30,000 is reported as capital. If the partnership held hot
assets, part of it is ordinary. The ledger has no hot-asset data, so today it reports 100% capital.

## §751 — hot assets recharacterize part of the gain as ordinary

**Rule.** §751(a) (sale/exchange of an interest) and §751(b) (disproportionate distributions)
recharacterize the portion of gain attributable to the partner's share of **unrealized receivables**
and **inventory items** ("§751 property" / "hot assets") as **ordinary income**, regardless of the
otherwise-capital character under §741/§731. The mechanism is a deemed sale of the hot-asset share:
the ordinary piece is the partner's share of (FMV − basis) of the hot assets; the residual is capital.

**Inputs required.**

1. The partnership's hot-asset schedule at the disposition date: FMV and tax basis of unrealized
   receivables and inventory, and the partner's allocable share. This is partnership-level data that
   appears on a **§751 statement** attached to the K-1, **not** on the K-1 boxes the ledger parses.
2. The total gain being recharacterized (the ledger already has this).

**What the ledger can infer today.** Nothing about hot-asset FMV/basis. The basis rollforward tracks
the partner's *outside* basis and tax/book capital; it has no line item for the partnership's inside
unrealized-receivable or inventory positions. There is **no event type** for hot-asset character and
no metadata key carrying a §751 ordinary amount on `sale_exchange` events
(`PartnershipBasisSaleExchangeMath` reads only `proceeds_cents`, `liability_relief_cents`,
`selling_expenses_cents`).

**Worked example (not currently representable).**

| Input | Value |
|-------|-------|
| §741/§731 gain on disposition | $30,000 |
| Partner's share of hot-asset FMV | $50,000 |
| Partner's share of hot-asset basis | $38,000 |
| §751 ordinary amount (FMV − basis) | **$12,000** |
| Residual capital gain | **$18,000** |

The $12,000 ordinary piece flows to ordinary income (and Form 4797 / Schedule 1 mechanics, with a
§751 statement on the return); the $18,000 capital piece stays on Form 8949 / Schedule D. The ledger
cannot split this because it does not capture the $50,000 / $38,000 hot-asset figures.

**Recommendation: review-only, optionally with a manual ordinary-split input.** Do **not** attempt to
infer hot-asset character. The conservative path that matches existing patterns:

- Add (in a *future* implementation issue) an optional metadata key on the `sale_exchange` /
  excess-distribution path, e.g. `section751_ordinary_cents`, that a reviewer enters from the K-1's
  §751 statement. When present, the builder would emit a second `TaxFactSource` for the ordinary
  portion and reduce the capital Form 8949 row by the same amount (currency.js / `MoneyMath`
  arithmetic, never raw float math).
- When absent, keep today's behavior (100% capital) and surface a review note that a §751 statement
  may require an ordinary split. This is a *disclosure*, not a computation.

This keeps automation only where an explicit, reviewer-supplied number exists, mirroring how
`is_complete` already gates the sale/exchange row.

## §736 — payments to a retiring / withdrawing partner

**Rule.** §736 governs payments by a continuing partnership to a *retiring partner or a deceased
partner's successor* in liquidation of the entire interest. Payments split into two buckets:

- **§736(b)** — payments for the partner's **interest in partnership property** → treated as a
  distribution; gain/loss is the §731/§741 capital result (subject to §751).
- **§736(a)** — payments **not** for property:
  - §736(a)(1) — a distributive share of income → ordinary, taxed like a distributive share.
  - §736(a)(2) — a **guaranteed payment** → ordinary income to the recipient.

Allocation between (a) and (b) depends on the partnership/operating agreement and on whether capital
is a material income-producing factor (relevant for the unstated-goodwill rules of §736(b)(2)/(3)).

**Inputs required.**

1. Total liquidation payments to the withdrawing partner (the ledger has cash/property distribution
   events).
2. The **§736(a) vs §736(b) split**, plus the §736(a)(1)/(a)(2) sub-split. This is a
   characterization the partnership makes and reports — typically via guaranteed-payment income on
   the K-1 (Box 4) and the liquidation terms. It is **not** derivable from the basis rollforward.

**What the ledger can infer today.** It records `liquidation_distribution_cash` /
`liquidation_distribution_property` events and a `liquidation_gain_loss_cents` estimate, all routed
**review-only** (`NeedsReviewScheduleDLine5Or12`, "confirm the character of property received").
It cannot tell which portion of a liquidation payment is a §736(a) ordinary guaranteed payment vs. a
§736(b) property payment — those are different *characters* on different forms (§736(a) ordinary on
Schedule E/Schedule 1 vs. §736(b) capital on Schedule D).

**Worked example (character split is review-only today).**

| Input | Value |
|-------|-------|
| Total liquidation payment | $200,000 |
| §736(b) property portion (per agreement) | $150,000 |
| §736(a)(2) guaranteed-payment portion | $50,000 |
| Withdrawing partner's outside basis | $120,000 |

The $150,000 §736(b) payment vs. $120,000 basis → **$30,000 capital gain** (Schedule D, subject to
§751). The $50,000 §736(a)(2) payment is **ordinary** guaranteed-payment income (and is usually
already on the K-1's guaranteed-payment line). The ledger sees a $200,000 distribution and a basis of
$120,000; it cannot know the $150k/$50k split, so the liquidation gain/loss stays an estimate routed
to review.

**Recommendation: keep review-only.** §736 character is a legal/agreement determination, not a ledger
inference. Preserve the existing review-only liquidation handling. A future issue could add a
reviewer-supplied split (e.g. `section736a_ordinary_cents`) analogous to the §751 suggestion, but the
default and the floor must remain review-only.

## §731(b)/(c) + §732 — character/basis of distributed property received

**Rule.** A partner generally recognizes no gain on a distribution of *property* (other than money);
instead the property takes a substituted/carryover basis under §732 and the partner's outside basis
is reduced. Character matters **later**: the basis the property carries out, and whether it is an
unrealized receivable or inventory item (which keeps an ordinary taint under §735), determine the
character of gain on the partner's eventual sale of that property. §731(c) treats certain
**marketable securities** as money (potential current gain).

**Inputs required.** FMV and inside basis of each distributed property, asset class (receivable /
inventory / capital / §1231), and for §731(c) whether a distributed security is "marketable."

**What the ledger can infer today.** It records `property_distribution_basis`,
`liquidation_distribution_property`, and `marketable_securities_distribution` event types and reduces
outside basis accordingly. It emits a `PartnershipPropertyDistribution` source (and, for years
≥ 2024, a `PartnershipForm7217Required` review source). It does **not** model the per-asset basis or
character of the property received, so it cannot compute future gain character.

**Recommendation: keep review-only (already is).** Continue surfacing property distributions and the
Form 7217 review prompt without inferring character. The basis-reduction mechanics are correct; the
*character of property received* is explicitly out of scope and stays review-only, consistent with
the existing `routingReason` ("confirm the character of property received before reporting").

## Data-availability summary

| Treatment | Amount known? | Character/split known? | Today | Recommendation |
|-----------|---------------|------------------------|-------|----------------|
| §731(a)(1) excess cash distribution | Yes | Capital (per §741) — yes | Form 8949 / Sch D 3/10, else review | Keep |
| §741 sale/exchange of interest | Yes (when metadata complete) | Capital — yes; §751 split — no | Form 8949 / Sch D, else review | Keep; layer optional §751 split |
| §751 hot-asset ordinary recharacterization | No (needs §751 statement) | No | Reported 100% capital | Review-only; optional reviewer-entered `section751_ordinary_cents` |
| §736(a) ordinary / guaranteed payment | Partial (total payment) | No (agreement-driven) | Review-only estimate | Keep review-only; optional reviewer split |
| §736(b) property payment (capital) | Partial | No | Review-only estimate | Keep review-only |
| §732 character/basis of property received | Basis-reduction only | No | Property-distribution source + Form 7217 review | Keep review-only |

## Decision

1. **No behavior change in #955.** The current §731 → Schedule D line 3/10 routing, the
   holding-period proxy (interest start date / metadata dates), the read-only reconciliation, and the
   review-only liquidation handling are all **preserved**.
2. **§751, §736, and §732 character stay review-only** because they require partnership-level or
   agreement-level inputs (hot-asset FMV/basis, the §736(a)/(b) split, per-asset character) that the
   outside-basis rollforward cannot infer.
3. **Future, narrowly-scoped automation is permitted only behind explicit reviewer-supplied inputs.**
   The recommended extension point is optional `sale_exchange` / distribution metadata keys
   (`section751_ordinary_cents`, `section736a_ordinary_cents`) that, when present, let the builder
   emit an additional ordinary `TaxFactSource` and reduce the capital Form 8949 row by the same
   amount via `MoneyMath` (never raw float arithmetic). Absent those inputs, the floor remains
   review-only. Each is its own future implementation issue, not part of this spec.

## Consequences

- The ledger continues to report disposition gain as capital by default; reviewers remain responsible
  for the §751/§736 character split using the K-1's §751 statement and the partnership agreement.
- The extension points are documented so a later implementation issue can add reviewer-entered splits
  without re-deriving this analysis.
- No migration, DTO, API, or compute change ships with this spec.

## References

- `app/Services/Finance/TaxPreviewFacts/Builders/PartnershipBasisFactsBuilder.php`
- `app/Services/Finance/PartnershipBasisSaleExchangeMath.php`
- `app/Enums/Finance/PartnershipBasisEventType.php`
- IRC §731, §732, §735, §736, §741, §751; Form 8949 / Schedule D; Form 7217.
