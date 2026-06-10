# Finance Onboarding Dashboard Plan

## Goal

Create a browser-first Finance onboarding and readiness experience for users who are starting from a blank slate or trying to understand what is missing for a tax year.

The workstream is strictly web/session Finance UX. It must not add or modify Agent API, MCP, OpenAPI, TOON, setup-token, signed upload/download agent workflow, CPA-return comparison, Career Comparison agent workflow, Tax agent workflow, or lock-guard functionality.

The desired user outcome:

- Create accounts.
- Import transactions.
- Import tax documents.
- Review mappings.
- Set up jobs and businesses.
- Set up K-1 and partnership basis data.
- Enter carryovers.
- Review tax readiness.
- Deep-link into the correct existing Finance tool.

## Non-976 Exclusion Boundary

Treat issue 976 and its PR3 split as frozen until PR3 is uploaded and reviewable. Do not touch these files in this workstream:

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

Also avoid these subjects:

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

## Current State

Finance already has substantial browser modules:

- Tax Preview.
- Tax Documents.
- RSU.
- Payslips.
- Tags.
- Financial Planning calculators.
- Accounts.
- Config.
- Transactions, lots, statements, fees, duplicates, linker, import, and maintenance under account routes.

The missing piece is orchestration. A new or returning user needs one place that answers:

- What is already set up?
- What is missing?
- What needs review?
- Where should I go next?

## Proposed Browser UX

### Finance Home

Add a canonical Finance landing page after PR3 is visible:

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

Use the existing Finance shell and layout. Do not place Agent/API token creation on this page.

At most, after PR3 has landed, a passive link can say:

```text
Agent/API Access is managed in Config.
```

### Dashboard Structure

Top controls:

- Year selector.
- Overall readiness status.

Setup checklist sections:

- Accounts.
- Transactions.
- Documents.
- Jobs and Businesses.
- Payslips / RSU.
- K-1 / Partnership Basis.
- Lots / 1099-B reconciliation.
- Carryovers / prior-year tax data.
- Categorization.
- Tax Preview.

Recent or pending work:

- Pending document reviews.
- Failed imports.
- Missing account mappings.
- Duplicate transactions.
- Unlinked transfers.
- Lot reconciliation drift.

Primary deep links:

- Import transactions.
- Import tax documents.
- Add account.
- Add W-2 job.
- Add Schedule C business.
- Open Tax Preview.

## Readiness Data Contract

Add a browser-only summary endpoint after PR3 is visible:

```text
GET /api/finance/onboarding-summary?year=YYYY
```

Middleware:

```text
web
auth
feature:finance.access
```

Suggested service:

```text
app/Services/Finance/Onboarding/FinanceOnboardingSummaryService.php
```

Suggested TypeScript type:

```text
resources/js/types/finance/onboarding-summary.ts
```

This endpoint must not be exposed through Agent API, MCP, TOON, OpenAPI, or a capability registry.

Target payload:

```ts
type FinanceOnboardingSummary = {
  year: number
  availableYears: number[]
  sections: FinanceReadinessSection[]
  primaryActions: FinanceAction[]
  warnings: FinanceWarning[]
}

type FinanceReadinessSection = {
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

type FinanceAction = {
  id: string
  label: string
  href: string
  kind: 'primary' | 'secondary'
  permission?: string
}

type FinanceWarning = {
  id: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  href?: string
}
```

## Card Inventory

| Section | Status inputs | Primary actions | Notes |
|---|---|---|---|
| Accounts | Account count, active/closed state, account suffix coverage | Add account, open Accounts | Use existing account models and account maintenance flows. |
| Transactions | Transaction years, current-year count, duplicate/unlinked indicators | Import transactions, open all transactions | Use canonical all-account route `/finance/account/all/transactions`. |
| Documents | Tax document count, pending review count, parser failures | Import tax documents, open Documents | Reuse document review and readiness data where available. |
| Employment | Employment entities, W-2/payslip presence, Schedule C businesses | Add W-2 job, add Schedule C business | Deep-link to existing browser forms. |
| Payslips | Payslip count by year, RSU/bonus indicators | Open Payslips | Permission-aware; mark optional when user has no payroll data path. |
| RSU | Award count, settlement/link gaps, unresolved reconciliation | Open RSU | Use existing RSU summaries; no Agent workflow exposure. |
| K-1 / Basis | K-1 docs, basis initialization state, missing basis events | Open Documents, open relevant account basis | Surface as readiness, do not add new tax engine behavior. |
| Lots | Open lots, 1099-B reconciliation drift, missing account mappings | Open Lots, open Tax Preview | Reuse lot reconciliation services. |
| Carryovers | Schedule D/PAL carryover input presence | Open Tax Preview | Browser-only readiness cards. |
| Categorization | Tags, rules, Schedule C mappings, uncategorized counts | Open Tags, future Categorization page | Do not move Agent Access out of Config. |
| Tax Preview | Available years, missing inputs, pending review blockers | Open Tax Preview | Link to existing preview and forms. |

## Data Source Plan

Prefer existing services and queries. Avoid copying business rules into the dashboard.

Likely sources:

- Account counts and account metadata from existing Finance account models/controllers.
- Transaction years and counts from transaction APIs/services.
- Tax document counts, pending review, missing account links, parser failures, and matcher status from existing document readiness logic.
- Tax Preview year availability and missing-input signals from existing Tax Preview data services.
- Employment entities from existing Finance employment entity endpoints/services.
- Payslips from existing payslip models/services.
- RSU settlement and link readiness from existing RSU UI/API data.
- Lots and 1099-B reconciliation from existing lot reconciliation services.
- Schedule D and PAL carryover inputs from existing tax preview inputs.
- Tags, rules, and tax characteristics from existing tag/rules services.

## Route Plan

Implement only after PR3 is visible and conflicts are inspected.

Browser pages:

```text
GET /finance
GET /finance/import
GET /finance/categorization
```

Browser API:

```text
GET /api/finance/onboarding-summary?year=YYYY
```

Do not add:

```text
/api/agent/v1/finance/readiness
MCP readiness tool
Agent capability entry
TOON schema
Agent OpenAPI schema
```

## Navigation Plan

Implement only after PR3 is visible and conflicts are inspected.

- Make the Finance brand link to `/finance`.
- Add Finance Home to top tools and the command palette.
- Use `/finance` as the canonical Finance entry.
- Update universal nav to prioritize:
  - Finance Home.
  - Transactions.
  - Import.
  - Accounts.
  - Documents.
  - Tax Preview.
  - RSU.
  - Payslips.
  - Categorization.
  - Config.
  - Financial Planning.
- Use `/finance/account/all/transactions` instead of legacy `/finance/all-transactions`.
- Do not add Agent/API Access to primary nav.

## Import Center Plan

Add after PR3:

```text
GET /finance/import
```

Suggested files:

```text
resources/views/finance/import.blade.php
resources/js/finance/pages/import.tsx
resources/js/components/finance/FinanceImportCenterPage.tsx
```

The Import Center should deep-link to existing browser flows only. It should not change GenAI import controllers, signed URL behavior, document storage internals, Agent upload/download workflows, MCP tools, or `/api/agent/v1/*`.

Import choices:

- Bank / brokerage transactions.
- Tax documents.
- Payslips.
- RSU / equity awards.
- K-1 / partnership basis history.
- Prior filed return / carryovers as a future placeholder unless already supported.

## Account Setup Improvements

Add after PR3 and after route/nav conflicts are understood.

Improve browser account creation and maintenance to capture matching metadata:

- Institution.
- Account number suffix / last 4.
- Account kind.
- Tax relevance.
- Default import hint.

Prefer existing columns first:

```text
acct_number
acct_is_debt
acct_is_retirement
```

Avoid schema changes unless necessary.

Suggested UI copy:

```text
Account suffix helps match broker/bank PDFs to the correct account. Store only the last 4 digits when possible.
```

## Blank State Improvements

Update blank states after PR3:

- Transactions: enable all-account import if the multi-account importer is supported, labeled `Import multi-account statement`.
- Documents: point users to import W-2, 1099, K-1, or broker tax packages.
- Tax Preview: link back to the Finance Home checklist when required inputs are missing.
- Schedule C: extend the existing helpful pattern to employment entities and transaction imports.

## Categorization Page

Add after PR3:

```text
GET /finance/categorization
```

Tabs:

- Tags.
- Rules.
- Tax Characteristics.
- Schedule C Mapping.

Keep `/finance/tags` working. Do not move or duplicate Agent Access UI.

## File-Touch Matrix

| Phase | Allowed files | Avoid until PR3 | Forbidden for this workstream |
|---|---|---|---|
| Phase 0 planning | `docs/finance/onboarding-dashboard.md` | none | all 976-owned files |
| Finance Home skeleton | Finance controller/view/page/component files | `routes/web.php`, nav entry points until PR3 visible | Agent/API/MCP/OpenAPI/TOON files |
| Summary API | Browser Finance service/API/type files | `routes/api.php` until PR3 visible | `/api/agent/v1/*`, capability registry, MCP tools |
| Nav cleanup | Finance nav and universal nav files | shared nav chokepoints until PR3 visible | Agent Access card and Config token UI |
| Import Center | Browser import page/view/component files | route files until PR3 visible | signed upload/download agent workflows |
| Account setup | Browser account forms/services | generated TS files unless necessary | Agent API field exposure changes |
| Categorization | Browser categorization page/components | Config-adjacent files until PR3 visible | Agent setup surfaces |

## Post-PR3 Rebase Checklist

Before implementing code:

1. Fetch PR3 and inspect its changed files.
2. Rebase the planning branch or implementation branch onto the PR3 base.
3. Check for changes in:
   - Finance config.
   - Finance navigation.
   - Shared route files.
   - Generated TypeScript types.
   - Browser import workflows.
4. Confirm PR3 did not add a competing Finance Home, Import Center, or categorization hub.
5. Reconfirm exclusion boundary with the current diff.
6. Split implementation PRs so no PR mixes browser onboarding with Agent/API/MCP work.

## Recommended PR Sequence

### PR A: Finance Home Skeleton

Scope:

- `/finance` browser route.
- FinanceHomePage static/skeleton UI.
- Finance brand link.
- Universal nav canonical `/finance` link.
- Command palette Finance Home row.

No summary complexity.

### PR B: Browser Readiness Summary

Scope:

- `FinanceOnboardingSummaryService`.
- `/api/finance/onboarding-summary`.
- Permission-filtered cards.
- FinanceHomePage data integration.
- Tests.

No Agent API exposure.

### PR C: Navigation and Blank-State Cleanup

Scope:

- Remove duplicate account tabs from AccountNavigation.
- Enable or remove all-account import.
- Improve empty states.
- Canonical transaction links.

### PR D: Import Center

Scope:

- `/finance/import`.
- Browser-only import choices.
- Deep links into existing import flows.

No backend import semantics.

### PR E: Account Setup Improvements

Scope:

- Account suffix in new-account and maintenance flows.
- Matching-readiness status on Finance Home.
- Backward-compatible account APIs.

### PR F: Categorization Page

Scope:

- `/finance/categorization`.
- Tags, Rules, Tax Characteristics, Schedule C Mapping.
- Keep `/finance/tags` compatibility.

## Test Plan

Backend feature tests:

- `GET /finance`.
- `GET /api/finance/onboarding-summary`.
- Permission-filtered cards.
- Blank-user summary.
- User with accounts but no transactions.
- User with documents pending review.
- User with no Tax Preview permission.

Backend unit tests:

- `FinanceOnboardingSummaryService`.
- Section status computation.
- Action generation.
- Permission filtering.

Frontend tests:

- FinanceHomePage renders setup checklist.
- FinanceHomePage hides unauthorized cards.
- FinanceNavbar brand links to `/finance`.
- Command palette includes Finance Home.
- AccountNavigation no longer duplicates tabs.
- Import Center renders choices.
- Empty transaction state links to Import Center.

Do not add or modify these tests for this workstream:

```text
AgentDiscoveryTest
AgentSetupTokenTest
AgentTokenAuthTest
FinanceCapabilitiesTest
McpFinanceToolsTest
McpToolVisibilityTest
ToonNegotiationTest
```

## Definition of Done

This workstream is complete when:

- `/finance` is the canonical browser landing page.
- A blank user sees a setup path instead of empty tables.
- Users can answer what is missing for a selected tax year from one screen.
- Import choices are understandable without knowing module internals.
- Account setup captures matching metadata.
- Navigation has one account-tab system.
- Categorization is findable.
- No Agent API, MCP, OpenAPI, TOON, setup-token, signed-upload/download agent workflow, CPA-return comparison, or lock-guard code was touched.

