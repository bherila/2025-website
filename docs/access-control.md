# Access Control

This application uses two separate authorization layers:

1. **Roles** stay limited to login and administrator status. The only supported role values remain `user` and `admin` in `users.user_role`.
2. **Feature permissions** control access to private modules and submodules such as Finance, RSU, Tax Preview, Transactions, Payslips, Tax Documents, and Utility Bills.

## Roles

Roles are comma-separated values in `users.user_role`.

- `user` allows the account to log in.
- `admin` grants administrator status.
- User ID `1` is treated as an administrator by the existing role logic.

Do not add feature names to `user_role`.

## Feature permissions

Direct grants are stored in `user_feature_permissions`. The valid permission keys and dependency graph live in `App\Support\Access\FeatureRegistry`; dependency resolution lives in `App\Support\Access\FeatureAccess`.

Effective permissions are calculated as:

```text
direct user permissions + transitive dependencies
```

Admin users bypass feature checks and do not need rows in `user_feature_permissions`.

## Dependency rule

Child permissions imply only their declared dependencies. Parent/module permissions do not imply all children.

For example, a direct grant of:

```text
finance.tax-preview.view
```

also includes:

```text
finance.accounts.basic
finance.access
```

but does not include:

```text
finance.accounts.detail
finance.transactions.view
finance.transactions.import
finance.rsu.view
finance.payslips.view
```

This allows Tax Preview users to receive basic account metadata for selectors without exposing account detail pages, transaction history, or import workflows.

## Web route → permission map (Finance)

| Route | Permission |
|---|---|
| `GET /finance` | `finance.access` |
| `GET /finance/import` | `finance.access` (per-card data gated behind each card's view/manage permission; cards without it are hidden in the UI) |
| `GET /finance/accounts` | `finance.accounts.detail` |
| `GET /finance/documents` | `finance.tax-documents.view` |
| `GET /finance/tax-preview` | `finance.tax-preview.view` |
| `GET /finance/account/all/import` | `finance.transactions.import` |
| `GET /finance/categorization` | `finance.access` (tabs for Tags, Rules, Tax Characteristics filtered to `finance.rules.manage` client- and server-side; Schedule C Mapping is a deep link, always visible) |
| `GET /finance/tags` | 301 redirect → `GET /finance/categorization` |
| `GET /api/finance/onboarding-summary` | `finance.access` (per-section data gated behind each section's view permission; sections without it return `no_access`) |

## Enforcement points

Feature checks are server enforced in these places:

- Web routes use `feature:{permission}` middleware for private Finance pages.
- API routes use `feature:{permission}` middleware for private Finance and Utility Bill endpoints.
- GenAI import endpoints map import job types to required feature permissions before issuing upload URLs or exposing jobs.
- Finance MCP tools and resources call `FeatureAccess` at execution time and return tool-level authorization errors when denied.

Frontend filtering exists only for UX. Hidden links and buttons are not the security boundary.

## Public financial planning invariant

Public financial-planning pages and compute/share endpoints stay public for guests and authenticated users, including authenticated users with no private feature permissions. Logging out must never provide more access than logging in.

Do not apply feature middleware to:

```text
GET /financial-planning/career-comparison
GET /financial-planning/career-comparison/s/{code}
POST /api/financial-planning/career-comparison/compute
PUT /api/financial-planning/career-comparison/s/{code}
```

The authenticated Career Comparison RSU import endpoint requires `finance.rsu.view`.

## Admin management

Admins can manage direct grants in User Management. The API exposes:

```text
GET /api/admin/feature-permissions
PUT /api/admin/users/{id}/feature-permissions
```

`GET /api/admin/users` includes both direct and effective permissions so the UI can show explicitly granted permissions separately from inherited dependencies.
