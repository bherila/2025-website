# Finance Onboarding Dashboard Implementation Plan

## Goal

Make `/finance` the browser-first landing page for Finance. A new or returning user should be able to answer four questions from one screen:

- What is already set up?
- What is missing for the selected tax year?
- What needs review before Tax Preview is useful?
- Which existing Finance tool should I open next?

This workstream is strictly web/session Finance UX. It does not add Agent API, MCP, REST agent, OpenAPI, TOON, token setup, signed upload/download agent workflow, CPA-return comparison, Career Comparison agent workflow, Tax agent workflow, or lock-guard functionality.

The user path this plan supports:

```text
Create accounts
Import transactions
Import tax documents
Review mappings
Set up jobs and businesses
Set up K-1 / partnership basis
Enter carryovers
Review tax readiness
Deep-link into the correct existing tool
```

## Exclusion Boundary

Treat issue 976 and its PR3 split as frozen until PR3 is uploaded and reviewable.

Do not touch these files in this workstream:

```text
routes/agent.php
routes/ai.php
app/Http/Controllers/Agent/**
app/Http/Middleware/AuthenticateAgentRequest.php
app/Http/Middleware/OptionalAgentRequest.php
app/Http/Middleware/NegotiatesAgentPayload.php
app/Mcp/**
app/Support/Agent/**
app/Support/Payload/**
app/Services/Finance/Agent/**
resources/js/components/agent/**
resources/js/user/agent-tokens.tsx
docs/agent-access.md
docs/finance/mcp-server.md
.claude/skills/finance-mcp.md
.mcp.example.json
```

Do not add or modify these surfaces:

```text
Agent tokens
MCP discovery
Agent OpenAPI
TOON manifests
/api/agent/v1/*
CPA-return comparison
signed-upload/download agent workflows
lock guard abstraction
Career Comparison agent workflows
Tax agent workflows
```

Avoid these chokepoints until PR3 is visible, then rebase and inspect conflicts first:

```text
routes/api.php
routes/web.php
bootstrap/app.php
bootstrap/providers.php
resources/js/components/finance/FinanceConfigPage.tsx
shared navigation/settings entry points
generated TypeScript files
```

## Current Finance Surface

The app already has the modules needed for the first version:

- Web Finance pages in `routes/web.php` for Accounts, Documents, Payslips, RSU, Tags, Config, Tax Preview, and account-scoped tools.
- Canonical all-account transactions and import routes:
  - `/finance/account/all/transactions`
  - `/finance/account/all/import`
- Finance navigation definitions in `resources/js/lib/financeNavigation.ts`.
- Finance shell mounting in `resources/js/finance/bootstrap.tsx`.
- Browser readiness data already exposed to Tax Preview:
  - `GET /api/finance/tax-preview-data`
  - `GET /api/finance/tax-years/{year}/readiness-summary`
  - `GET /api/finance/tax-years/{year}/reconciliation-summary`
  - `GET /api/finance/tax-years/{year}/lot-reconciliation`
- `App\Services\Finance\ReadinessSummaryService`, which already aggregates document counts, pending review, missing account mappings, parsing failures, lot reconciliation health, and matcher timestamps.

The missing product layer is orchestration, not new finance engines.

## Delivery Sequence

### Phase 0: This Planning PR

Branch:

```text
planning/finance-onboarding-dashboard
```

Scope:

- Add this implementation plan only.
- Do not touch routes, nav, config, generated TypeScript, Agent API, MCP, OpenAPI, TOON, or Finance Config.
- Create or update the GitHub issue that tracks the implementation work.

Acceptance:

- Only `docs/finance/onboarding-dashboard.md` changes.
- The issue links to this plan and describes the implementation sequence.

### PR A: Finance Home Skeleton

Implement after PR3 is uploaded and this branch is rebased.

Add:

```text
GET /finance
```

Suggested files:

```text
app/Http/Controllers/FinanceTool/FinanceHomeController.php
resources/views/finance/home.blade.php
resources/js/finance/pages/home.tsx
resources/js/components/finance/FinanceHomePage.tsx
```

Route requirements:

```text
web
auth
feature:finance.access
```

UI requirements:

- Use `layouts.finance` and the existing `FinanceNavbar`.
- Render the dashboard as the first screen. Do not make a marketing page.
- Include a year selector, overall readiness state, setup checklist, pending work list, and primary actions.
- Use static or minimal server-provided placeholder state in this PR. Do not build the full summary service yet.
- Do not render an Agent/API Access card. PR 978 owns the Config card.

Initial screen structure:

```text
[Year selector] [Overall readiness]

Setup checklist
  Accounts
  Transactions
  Documents
  Jobs and Businesses
  Payslips
  RSU
  K-1 / Partnership Basis
  Lots / 1099-B Reconciliation
  Carryovers
  Categorization
  Tax Preview

Recent and pending work
  Pending document reviews
  Missing account mappings
  Lot reconciliation drift
  Duplicate transactions
  Unlinked transfers
  Failed imports

Primary actions
  Add account
  Import transactions
  Import tax documents
  Open Tax Preview
```

Tests:

- Feature test: authenticated user with `finance.access` can load `/finance`.
- Feature test: user without `finance.access` cannot load `/finance`.
- Frontend test: `FinanceHomePage` renders checklist sections and primary actions.

### PR B: Browser Onboarding Summary API

Add a browser-only summary endpoint:

```text
GET /api/finance/onboarding-summary?year=YYYY
```

Suggested files:

```text
app/Http/Controllers/Finance/OnboardingSummaryController.php
app/Services/Finance/Onboarding/FinanceOnboardingSummaryService.php
resources/js/types/finance/onboarding-summary.ts
tests/Feature/Finance/OnboardingSummaryControllerTest.php
tests/Unit/Services/Finance/Onboarding/FinanceOnboardingSummaryServiceTest.php
```

Route requirements:

```text
web
auth
feature:finance.access
```

This endpoint is not an Agent API endpoint. Do not add it to MCP discovery, Agent capabilities, OpenAPI, TOON, REST agent routing, or any `/api/agent/v1/*` namespace.

Target TypeScript contract:

```ts
export type FinanceOnboardingSummary = {
  year: number
  availableYears: number[]
  sections: FinanceReadinessSection[]
  primaryActions: FinanceAction[]
  warnings: FinanceWarning[]
}

export type FinanceReadinessSection = {
  id:
    | 'accounts'
    | 'transactions'
    | 'documents'
    | 'employment'
    | 'payslips'
    | 'rsu'
    | 'k1_basis'
    | 'lots'
    | 'carryovers'
    | 'categorization'
    | 'tax_preview'
  status: 'not_started' | 'needs_attention' | 'in_progress' | 'ready' | 'optional' | 'no_access'
  title: string
  summary: string
  counts?: Record<string, number>
  actions: FinanceAction[]
}

export type FinanceAction = {
  id: string
  label: string
  href: string
  kind: 'primary' | 'secondary'
  permission?: string
}

export type FinanceWarning = {
  id: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  href?: string
}
```

Service behavior:

- Resolve the requested year from `?year=YYYY`.
- If no year is provided, prefer the latest available Finance tax/transaction year; fall back to the current calendar year.
- Gather permissions server-side. Return only actions the user can open. Sections may be omitted or marked `no_access`, but route middleware remains the security boundary.
- Reuse existing services where possible. Do not duplicate tax or reconciliation business rules.
- Keep the payload compact and UI-oriented. It is not a tax calculation API.

Tests:

- Blank user summary returns actionable `not_started` sections.
- User with accounts but no transactions gets `accounts: ready` and `transactions: not_started`.
- User with pending parsed tax documents gets `documents: needs_attention`.
- User lacking granular permissions does not receive unauthorized actions.
- Endpoint requires `finance.access`.
- Unit tests cover section status computation and action filtering.

### PR C: Finance Home Data Integration

Wire `FinanceHomePage` to `GET /api/finance/onboarding-summary`.

Requirements:

- Fetch summary for the selected year.
- Preserve the selected year in the URL query string.
- Show loading, empty, ready, needs-attention, no-access, and error states.
- Make every action a real deep link into an existing browser flow.
- Keep hidden cards as UX only; do not rely on client hiding for security.

Frontend tests:

- Renders setup checklist from API data.
- Shows actionable blank slate when all sections are `not_started`.
- Hides or disables unauthorized actions from the response.
- Changing year fetches the selected year summary.
- Error state keeps primary links to Accounts, Import, Documents, and Tax Preview when permissions allow.

### PR D: Navigation and Blank-State Cleanup

Implement after PR3 route/nav conflicts are known.

Changes:

1. Add Home to Finance top tools in `resources/js/lib/financeNavigation.ts`:

```ts
{
  id: 'home',
  label: 'Home',
  href: '/finance',
  permission: 'finance.access',
  keywords: ['home', 'dashboard', 'setup', 'readiness', 'onboarding']
}
```

2. Make the Finance brand in `FinanceNavbar` link to `/finance`.

3. Ensure the command palette can find Finance Home.

4. Update universal navigation to use canonical browser routes:

```text
Finance Home        /finance
Transactions        /finance/account/all/transactions
Import              /finance/account/all/import
Accounts            /finance/accounts
Documents           /finance/documents
Tax Preview         /finance/tax-preview
RSU                 /finance/rsu
Payslips            /finance/payslips
Tags                /finance/tags
Config              /finance/config
Financial Planning  /financial-planning
```

5. Do not add links to routes owned by later PRs. The Import Center PR owns `/finance/import`; the Categorization PR owns `/finance/categorization`.

6. Do not add Agent/API Access to primary nav. Config remains the place for the card owned by PR 978.

7. Improve blank states:

- Transactions: if all-account import is supported, enable it and label it `Import multi-account statement`; otherwise remove the route in a separate decision PR.
- Documents: offer `Import W-2, 1099, K-1, or broker tax package`.
- Tax Preview: link back to Finance Home checklist when inputs are missing.
- Schedule C related empty states: link to employment/business setup and transaction categorization.

Tests:

- `FinanceNavbar` brand links to `/finance`.
- Command palette includes Finance Home for users with `finance.access`.
- Universal nav no longer points users to `/finance/all-transactions`.
- Empty transaction state links to all-account import when allowed.

### PR E: Account Navigation Deduplication

Current issue:

- `FinanceNavbar` renders account tabs for account pages.
- `AccountNavigation` also builds account tool tabs from `FINANCE_ACCOUNT_TOOLS`.

Desired state:

```text
FinanceNavbar
  Owns account tab navigation.

AccountNavigation
  Owns contextual controls only:
  [Year selector] [Import] [Maintenance]
```

Requirements:

- Account pages have one tab row, not two.
- Year selection still works.
- Import and Maintenance remain available when permitted.
- No generated TypeScript changes unless required by the final implementation.

Tests:

- Existing `AccountNavigation` tests updated to assert no duplicate tab row.
- Account page tests still find Import and Maintenance controls when permissions allow.

### PR F: Browser Import Center

Add:

```text
GET /finance/import
```

Suggested files:

```text
app/Http/Controllers/FinanceTool/FinanceImportCenterController.php
resources/views/finance/import.blade.php
resources/js/finance/pages/import.tsx
resources/js/components/finance/FinanceImportCenterPage.tsx
```

Purpose:

Users should not need to know whether a file belongs in transactions, tax documents, RSU, payslips, lots, or basis before starting.

Import choices:

```text
Bank / brokerage transactions
  CSV, QFX/OFX, HAR, IB activity statement, broker statement PDF
  Deep link: /finance/account/all/import

Tax documents
  W-2, 1099, 1099-B, K-1, 1116
  Deep link: /finance/documents

Payslips
  Payroll PDFs or manual entry
  Deep link: /finance/payslips or /finance/payslips/entry

RSU / equity awards
  Grants, vesting, settlement review
  Deep link: /finance/rsu

K-1 / partnership basis history
  K-1 forms, basis events, capital account history
  Deep link: /finance/documents and account basis pages

Prior filed return / carryovers
  Future placeholder unless already supported by Tax Preview forms
  Deep link: /finance/tax-preview
```

Hard boundary:

- Routing and UI only.
- No new backend import semantics.
- No signed URL changes.
- No signed upload/download agent workflow changes.
- No MCP or `/api/agent/v1/*` exposure.

Tests:

- Import Center renders each choice.
- Choices hide or disable when permissions are missing.
- Links point to existing browser flows.

### PR G: Account Setup Metadata

Problem:

Multi-account PDF import can use suffix matching, but account creation primarily collects name plus liability/retirement flags.

Change:

- Add optional account metadata to creation and maintenance forms:
  - Institution.
  - Account number suffix / last 4.
  - Account kind.
  - Tax relevance.
  - Default import hint.
- Prefer existing columns first, especially:
  - `acct_number`
  - `acct_is_debt`
  - `acct_is_retirement`
- Avoid schema changes unless the existing model cannot represent the field.

UX copy:

```text
Account suffix helps match broker/bank PDFs to the correct account. Store only the last 4 digits when possible.
```

Tests:

- User can create an account with an account suffix.
- Existing create-account requests without the new fields still work.
- Account maintenance preserves and updates suffix metadata.

### PR H: Categorization Page

Add after PR3 and after Config conflicts are known:

```text
GET /finance/categorization
```

Suggested tabs:

```text
Tags
Rules
Tax Characteristics
Schedule C Mapping
```

Initial implementation:

- Reuse existing Tags and Rules components or endpoints.
- Keep `/finance/tags` working.
- Link Categorization from Finance Home and navigation.
- Do not move or duplicate `AgentAccessCard`.
- Do not touch Finance Config unless the final PR3 conflict inspection makes that safe.

Tests:

- Categorization page loads with `finance.rules.manage` or the final selected permission.
- Existing `/finance/tags` route still works.
- Finance Home links categorization actions to the new page when permitted.

## Execution Plan

Every implementation PR has one common external dependency: wait until issue 976 PR3 is uploaded, rebase, and inspect shared route/nav/config conflicts before touching code. After that gate, the work can be split into independent lanes.

### Dependency Matrix

| PR | Internal dependencies | Can run in parallel with | Merge notes |
|---|---|---|---|
| PR A: Finance Home Skeleton | None after PR3 gate. | PR B, PR E, PR F, PR G, PR H. | Should merge before PR C and PR D. Keep the route/page skeleton minimal. |
| PR B: Browser Onboarding Summary API | None after PR3 gate. | PR A, PR E, PR F, PR G, PR H. | Should merge before PR C. No frontend dependency. |
| PR C: Finance Home Data Integration | PR A and PR B. | PR E, PR F, PR G, PR H if those avoid `FinanceHomePage`. | Merge after A+B. Owns only dashboard data fetching/rendering. |
| PR D: Navigation and Blank-State Cleanup | PR A. | PR B and PR G. Can run beside PR E only if the file split is agreed first. | Merge after A. Do not add Import Center or Categorization links unless PR F/H have already landed. |
| PR E: Account Navigation Deduplication | None after PR3 gate. | PR A, PR B, PR F, PR G, PR H. | Avoid `FinanceNavbar` changes already owned by PR D where possible; focus on `AccountNavigation`. |
| PR F: Browser Import Center | None after PR3 gate. | PR A, PR B, PR E, PR G, PR H. | Can merge independently as a route/page. Add top-level nav/home links only after PR A/D are present or keep those links inside this PR after rebasing. |
| PR G: Account Setup Metadata | None after PR3 gate. | PR A, PR B, PR D, PR E, PR F, PR H. | Avoid schema changes unless existing columns are insufficient. Summary usage can be a later enhancement. |
| PR H: Categorization Page | None after PR3 gate. | PR A, PR B, PR E, PR F, PR G. | Can merge independently as a route/page. Add nav/home links after PR A/D/C are present or keep those links inside this PR after rebasing. |

### Parallel Work Waves

Wave 1 can start immediately after the PR3 gate:

```text
PR A: Finance Home Skeleton
PR B: Browser Onboarding Summary API
PR E: Account Navigation Deduplication
PR F: Browser Import Center
PR G: Account Setup Metadata
PR H: Categorization Page
```

Wave 2 starts after its blockers merge:

```text
PR C: Finance Home Data Integration
  depends on PR A + PR B

PR D: Navigation and Blank-State Cleanup
  depends on PR A
```

Recommended merge order:

```text
1. PR A and PR B first, in either order.
2. PR C after PR A and PR B.
3. PR D after PR A; rebase after PR F/H if it wants to point nav at those new pages.
4. PR E, PR F, PR G, and PR H can merge whenever clean, subject to route/nav conflict checks.
```

### Isolation Rules

- PR A owns the `/finance` route, Finance Home Blade page, React entry point, and static dashboard component.
- PR B owns the browser summary controller, service, DTO/type contract, and backend tests.
- PR C owns only Finance Home data fetching and rendering against the PR B contract.
- PR D owns Finance navigation cleanup, command palette discoverability, canonical existing links, and blank states for existing pages.
- PR E owns `AccountNavigation` deduplication and related tests.
- PR F owns `/finance/import` and the Import Center UI. It must only deep-link into existing browser flows.
- PR G owns account creation/maintenance metadata and backward-compatible account API handling.
- PR H owns `/finance/categorization` and compatibility with `/finance/tags`.
- No PR in this workstream owns Agent/API Access UI, Finance Config token surfaces, Agent API, MCP, OpenAPI, TOON, signed agent workflows, CPA-return comparison, or lock guards.

## Readiness Section Matrix

| Section | Permission gate | Status rules | Existing sources | Primary actions |
|---|---|---|---|---|
| `accounts` | `finance.accounts.basic` or `finance.accounts.detail` | `not_started` when active account count is 0. `needs_attention` when accounts exist but useful matching metadata is missing. `ready` when at least one active account exists. | Account APIs and account models behind `/api/finance/accounts/basic` and `/api/finance/accounts`. | Add account, open Accounts, import transactions. |
| `transactions` | `finance.transactions.view` | `not_started` when selected-year transaction count is 0. `in_progress` when transactions exist but duplicate/link review is nonzero. `ready` when transactions exist without known blockers. | `/api/finance/all/transaction-years`, `/api/finance/all/line_items`, duplicate/linker endpoints. | Import transactions, open all transactions. |
| `documents` | `finance.tax-documents.view` | `not_started` when no tax documents exist for the year. `needs_attention` for pending review, parsing failures, or missing account mappings. `ready` when documents are reviewed and no blockers are known. | `ReadinessSummaryService`, document APIs, `FileForTaxDocument`, `TaxDocumentAccount`. | Import tax documents, open Documents. |
| `employment` | `finance.tax-preview.view` | `not_started` when no employment entities or business setup exists. `needs_attention` when entities exist but selected-year rows are missing. `ready` when selected-year employment/business data exists. | Employment entity APIs, Tax Preview data. | Open Tax Preview, add W-2 job, add Schedule C business. |
| `payslips` | `finance.payslips.view` | `optional` when no payslip path appears relevant. `not_started` when payroll is expected but no payslips exist. `ready` when selected-year payslips exist. | Payslip APIs and Tax Preview data. | Open Payslips, add payslip. |
| `rsu` | `finance.rsu.view` | `optional` when no RSU awards or settlements exist. `needs_attention` when settlement/link review is pending. `ready` when awards and links are clean. | RSU APIs and settlement/link endpoints. | Open RSU. |
| `k1_basis` | `finance.accounts.detail` plus `finance.tax-documents.view` where document evidence is needed | `optional` when no partnership/K-1 signals exist. `needs_attention` when K-1 docs or partnership accounts exist but basis is not initialized or events are missing. `ready` when basis data exists for relevant accounts. | K-1 document counts from `ReadinessSummaryService`; partnership basis account endpoints. | Open Documents, open account Basis. |
| `lots` | `finance.lots.view` | `optional` when no brokerage tax documents or lots exist. `needs_attention` when reconciliation drift, blocked matches, or missing account mappings exist. `ready` when reconciliation health is clean. | `ReadinessSummaryService`, reconciliation summary, lot reconciliation endpoints. | Open Lots, open Tax Preview. |
| `carryovers` | `finance.tax-preview.view` | `optional` when no prior-year indicators exist. `needs_attention` when Schedule D/PAL/tax-loss carryovers appear expected but inputs are absent. `ready` when carryover inputs exist or are explicitly not needed. | Schedule D carryover, PAL carryforward, tax-loss carryforward APIs. | Open Tax Preview carryover inputs. |
| `categorization` | `finance.transactions.view` and `finance.rules.manage` for edit actions | `not_started` when no tags or rules exist and transactions exist. `needs_attention` when uncategorized or Schedule C mapping gaps exist. `ready` when tags/rules/mappings exist and no major uncategorized count is known. | Tags, Rules, Schedule C summary APIs. | Open Tags, open Categorization. |
| `tax_preview` | `finance.tax-preview.view` | `not_started` when no tax-year inputs exist. `needs_attention` when readiness cards expose blockers. `ready` when required inputs are present and no blockers are known. | Tax Preview data, `ReadinessSummaryService`. | Open Tax Preview. |

## Overall Readiness Algorithm

Use the strongest section status as the overall state:

```text
critical warnings present        -> needs_attention
any required section needs review -> needs_attention
any required section not started  -> in_progress
at least one useful section ready -> in_progress
all required sections ready       -> ready
no accessible required sections   -> not_started
```

Required sections for the first version:

```text
accounts
transactions
documents
employment
tax_preview
```

Optional sections for the first version:

```text
payslips
rsu
k1_basis
lots
carryovers
categorization
```

Optional sections can still raise the overall status to `needs_attention` when the system has direct evidence that they apply. Examples:

- A K-1 document exists but no basis data is initialized.
- A broker 1099 exists with blocked lot reconciliation.
- PAL carryforward data is expected but missing.
- RSU settlements exist but are not linked.

## Deep-Link Rules

All dashboard actions must target existing browser routes until their future pages are implemented:

```text
Finance Home              /finance
Accounts                  /finance/accounts
All Transactions          /finance/account/all/transactions
All-Account Import        /finance/account/all/import
Documents                 /finance/documents
Tax Preview               /finance/tax-preview
Payslips                  /finance/payslips
Payslip Entry             /finance/payslips/entry
RSU                       /finance/rsu
Tags                      /finance/tags
Config                    /finance/config
Account Basis             /finance/account/{account_id}/basis
Import Center             /finance/import
Categorization            /finance/categorization
Financial Planning        /financial-planning
```

Do not point new links at legacy `/finance/all-transactions`.

## Testing Plan

Backend feature tests:

```text
GET /finance
GET /api/finance/onboarding-summary
permission-filtered actions
blank-user summary
user with accounts but no transactions
user with pending tax documents
user with missing account mappings
user with no tax-preview permission
```

Backend unit tests:

```text
FinanceOnboardingSummaryService
selected-year fallback
section status computation
overall readiness computation
primary action generation
permission filtering
```

Frontend tests:

```text
FinanceHomePage renders setup checklist
FinanceHomePage renders pending work
FinanceHomePage hides unauthorized actions
FinanceHomePage handles loading and API failure
FinanceNavbar brand links to /finance
FinanceCommandPalette includes Finance Home
AccountNavigation no longer duplicates tabs
FinanceImportCenterPage renders import choices
empty transaction state links to all-account import
```

Do not add or modify these tests in this workstream:

```text
AgentDiscoveryTest
AgentSetupTokenTest
AgentTokenAuthTest
FinanceCapabilitiesTest
McpFinanceToolsTest
McpToolVisibilityTest
ToonNegotiationTest
```

## PR3 Rebase Checklist

Before implementing PR A:

1. Fetch latest `main` and the PR3 branch once PR3 is uploaded.
2. Rebase the Finance onboarding branch onto the latest merge base.
3. Inspect route/nav/config conflict areas before editing:
   - `routes/web.php`
   - `routes/api.php`
   - `resources/js/lib/financeNavigation.ts`
   - `resources/js/components/finance/FinanceNavbar.tsx`
   - shared navigation/settings entry points
   - `resources/js/components/finance/FinanceConfigPage.tsx`
4. Confirm no Agent API/MCP/OpenAPI/TOON files are touched.
5. Implement the smallest first PR: `/finance` skeleton only.

## Definition of Done

This workstream is complete when:

- `/finance` is the canonical browser Finance landing page.
- A blank user sees concrete setup steps instead of an empty table.
- Users can answer what is missing for a selected year from one screen.
- Import choices are understandable without knowing internal modules.
- Account setup captures matching metadata needed by browser imports.
- Navigation has one account-tab system.
- Categorization is findable.
- No Agent API, MCP, OpenAPI, TOON, setup-token, signed-upload/download agent workflow, CPA-return comparison, lock-guard, Career agent, or Tax agent surface was touched.
