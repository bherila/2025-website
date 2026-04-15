# Account Matching Algorithm Specification

## Overview

The account matching algorithm finds the best matching user account for a parsed account entry from an AI-extracted financial document. It is implemented in two places:

| Implementation | File | Usage |
|---|---|---|
| PHP (backend) | `app/GenAiProcessor/Jobs/ParseImportJob.php` → `matchAccount()` | Multi-account tax import (GenAI job processing) |
| TypeScript (frontend) | `resources/js/lib/finance/accountMatcher.ts` → `matchAccount()` | Broker 1099 account confirmation UI |

Both implementations **must** produce identical results for the same inputs.

---

## Algorithm

The algorithm runs three sequential steps. It returns the account ID from the **first step that yields a unique match**, or `null` if no match is found.

### Step 1 — Exact account number match

Compare the AI-provided `account_identifier` against the stored `acct_number` field of every user account. If exactly one account matches, return it.

```
if entry.account_identifier === acct.acct_number → return acct_id
```

### Step 2 — Last-4 suffix match

Strip all non-digit characters from `account_identifier` and take the last 4 digits. Compare against the last 4 digits of each stored account number (after stripping non-digits). If exactly **one** account matches, return it.

```
last4 = digits(account_identifier)[-4:]
candidates = accounts where digits(acct.acct_number)[-4:] == last4
if len(candidates) == 1 → return candidates[0].acct_id
```

If `account_identifier` contains no digits, this step is skipped.

### Step 3 — Name word-overlap disambiguation

Use the AI-provided `account_name` (lowercased) to disambiguate among the Step 2 candidates (or all user accounts if Step 2 produced no candidates or yielded zero candidates).

Split both the AI name and the stored account name on **non-word characters** (`/\W+/` in PHP; `/\W+/` regex in TypeScript) and count word intersection. The account with the highest overlap score wins. If the best score is zero, return `null`.

```
aiWords  = lowercase(account_name).split(/\W+/).filter(Boolean)
acctWords = lowercase(acct.acct_name).split(/\W+/).filter(Boolean)
overlap  = |aiWords ∩ acctWords|
→ return acct with max overlap (minimum score: 1)
```

---

## Word-splitting rule

Both implementations split on **`/\W+/`** — i.e., one or more **non-word characters** (anything that is not `[a-zA-Z0-9_]`). This means hyphens, parentheses, slashes, and other punctuation all act as word boundaries.

> **Historical note:** Before this alignment, the PHP backend used `\s+` (whitespace only) while the TypeScript frontend used `\W+`. This could produce different matches for names containing hyphens (e.g., `"Fidelity-Brokerage"` would be one token in PHP but two in TypeScript). Both are now aligned to `\W+`.

### Example

| Input | `\s+` tokens | `\W+` tokens |
|---|---|---|
| `"fidelity brokerage"` | `["fidelity", "brokerage"]` | `["fidelity", "brokerage"]` |
| `"fidelity-brokerage"` | `["fidelity-brokerage"]` | `["fidelity", "brokerage"]` |
| `"schwab (joint)"` | `["schwab", "(joint)"]` | `["schwab", "joint"]` |

---

## Test parity

Both the PHP and TypeScript test suites include identical cases. See:

- PHP: `tests/Feature/ParseImportJobTest.php` (or `tests/Unit/AccountMatcherTest.php` if applicable)
- TypeScript: `resources/js/lib/finance/__tests__/accountMatcher.test.ts`

### Reference test cases

| `account_identifier` | `account_name` | Accounts | Expected result |
|---|---|---|---|
| `"12345678"` | any | `[{acct_number: "12345678"}]` | `acct_id` of that account (exact match) |
| `"...5678"` | any | `[{acct_number: "12345678"}, {acct_number: "99995678"}]` | `null` (ambiguous last-4) |
| `"...5678"` | `"fidelity"` | `[{acct_number: "12345678", acct_name: "Fidelity"}, {acct_number: "99995678", acct_name: "Schwab"}]` | first account (name overlap) |
| `"XYZ"` | `"fidelity-brokerage"` | `[{acct_name: "Fidelity Brokerage"}, {acct_name: "Schwab"}]` | first account (`\W+` splits hyphenated name) |
| `""` | any | any | `null` (empty identifier) |
| any | `""` | (no last-4 candidates) | `null` (empty name, no last-4) |

---

## Future consideration

Moving all matching logic to the backend (a dedicated API endpoint) would eliminate the dual-implementation requirement. The frontend confirmation UI could then simply call the API to resolve ambiguous accounts rather than re-implementing the algorithm.
