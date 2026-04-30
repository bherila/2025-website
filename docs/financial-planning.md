# Financial Planning

The `/financial-planning` section hosts public, standalone planning calculators. These tools do not require authentication and should not depend on Tax Preview data, account data, or any logged-in user state.

## Routes

| Route | Purpose | Auth |
|-------|---------|------|
| `/financial-planning` | Landing page listing shipped calculators | Public |
| `/financial-planning/solo-401k` | Solo 401(k) contribution calculator | Public |

Routes are defined in `routes/web.php` outside the `auth` middleware group. Navbar wiring for this section is tracked separately so calculators can ship before the global nav changes.

## Solo 401(k) Calculator

The Solo 401(k) calculator implements the Pub 560 self-employed contribution worksheet for Schedule C / partnership self-employment earnings.

Key files:

- `resources/js/financial-planning/solo-401k.tsx` — standalone public page with manual inputs and URL state.
- `resources/js/financial-planning/solo401kUrlState.ts` — query-string parse/serialize helpers.
- `resources/js/lib/planning/solo401k.ts` — shared calculation library.
- `resources/js/components/planning/SoloSE401k/SoloSE401kForm.tsx` — shared presentational breakdown.
- `resources/js/components/finance/worksheets/WorksheetSE401k.tsx` — Tax Preview adapter that feeds Tax Preview values into the shared form.

Inputs:

- Tax year, from the keys of `SE_401K_LIMITS`.
- Net self-employment earnings from Schedule SE line 6.
- Deductible half of self-employment tax from Schedule 1 line 15, with an optional estimate helper.
- W-2 pre-tax 401(k) deferrals already made elsewhere in the year.
- Age 50+ catch-up toggle.

The standalone page persists scenarios entirely in the URL query string, for example:

```text
/financial-planning/solo-401k?year=2025&ne=120000&se=8500&w2=15000&catchup=1
```

## Shared Tax Preview Integration

Tax Preview and the standalone calculator intentionally share the same math and result presentation:

- `computeSe401k()` computes compensation base, employee deferral room, employer contribution room, remaining section 415(c) cap, and recommended contribution.
- `estimateDeductibleSeTax()` estimates deductible SE tax for users who do not have Schedule SE values in hand.
- `totalContributionWithCatchup()` adds the age 50+ catch-up amount outside the section 415(c) cap while still bounding the result by compensation.
- `SoloSE401kForm` renders the calculation breakdown for both public and Tax Preview contexts.

The Tax Preview worksheet remains read-only because its inputs come from the current Tax Preview return: Schedule SE net earnings, deductible SE tax, selected tax year, and W-2 pre-tax 401(k) amounts from payslips.

All monetary arithmetic in these files must use `currency.js`; exported calculation functions return plain numbers at their boundaries.
