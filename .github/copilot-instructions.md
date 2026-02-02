# BWH PHP Copilot Instructions

## Architecture Overview
This is a hybrid Laravel 12 + React TypeScript application for personal finance management. It combines server-side Blade templates with client-side React components for interactive features.

### Key Components
- **Backend**: Laravel controllers return Blade views with data attributes
- **Frontend**: React components mount into DOM elements using `createRoot`
- **Data Flow**: Blade passes initial data via `data-*` attributes; React handles UI updates via API calls
- **API**: RESTful endpoints under `/api` for CRUD operations
- **Domain**: Financial accounts, transactions, statements, payslips, RSUs, CSV imports, and client management
- **Modules**: Finance (accounts, transactions, statements, payslips, RSUs), Tools (license manager, bingo, IRS F461, maxmin, user management), Recipes, Projects, Client Management
- **Authentication**: Session-based; protected routes use `auth` middleware (web routes) or `['web', 'auth']` (API routes)
- **Authorization**: Gate-based authorization for admin-only features (e.g., Client Management uses 'admin' gate)
- **User Roles**: Comma-separated roles in `user_role` column (e.g., `"admin,user"`). All roles lowercase. Available roles: `admin`, `user`

### Example Pattern
```php
// Controller passes data to view
return view('finance.transactions', ['account_id' => $account_id, 'accountName' => $account->acct_name]);
```
```blade
<!-- Blade view with data attributes -->
<div id="FinanceAccountTransactionsPage" data-account-id="{{ $account_id }}"></div>
```
```tsx
// React component reads data and mounts
const div = document.getElementById('FinanceAccountTransactionsPage')
if (div) {
  const root = createRoot(div)
  root.render(<FinanceAccountTransactionsPage id={parseInt(div.dataset.accountId!)} />)
}
```

## Development Workflow
- **Setup**: Run `composer run setup` (installs deps, generates key, migrates DB, builds assets)
- **Dev Server**: Use `composer run dev` for concurrent Laravel server, queue worker, logs, and Vite dev server
- **Testing**: `composer test` for PHPUnit; `npm test` for Jest (React components)
- **Build**: `npm run build` for production assets

## Testing Guidelines

**IMPORTANT**: All tests use SQLite in-memory database, never MySQL. This is a safety feature.

### Test Structure
- **Feature tests**: Extend `Tests\TestCase`, use `RefreshDatabase` trait for database tests
- **Unit tests**: Extend `PHPUnit\Framework\TestCase` directly (no database needed)

### Writing Feature Tests
```php
<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MyTest extends TestCase
{
    use RefreshDatabase;

    public function test_something(): void
    {
        $admin = $this->createAdminUser();  // Helper method
        $user = $this->createUser();        // Helper method
        
        $response = $this->actingAs($admin)->get('/some-route');
        $response->assertStatus(200);
    }
}
```

### TestCase Helpers
- `$this->createAdminUser($attributes)` - Creates user with admin role
- `$this->createUser($attributes)` - Creates user with regular user role

### Schema Files
- `database/schema/mysql-schema.sql` - Production MySQL schema
- `database/schema/sqlite-schema.sql` - SQLite schema for tests (RefreshDatabase uses this)

When adding new tables/columns to production, update both schema files.

See [docs/TESTING.md](docs/TESTING.md) for comprehensive testing documentation.

## Key Conventions
- **Models**: Use Eloquent relationships (e.g., `FinAccountLineItems` belongs to `FinAccounts`); organize domain-specific models in subdirectories (e.g., `app/Models/ClientManagement/`)
- **Controllers**: Organize in subdirectories for complex features (e.g., `app/Http/Controllers/ClientManagement/`)
- **Routes**: Web routes (`routes/web.php`) return Blade views for pages; API routes (`routes/api.php`) handle data operations with `['web', 'auth']` middleware
- **Components**: Use shadcn/ui + Radix UI primitives with Tailwind CSS
- **Time Formatting**: Use `@/lib/formatHours` utility to display durations. Convert decimal hours to "h:mm" format for UI display (e.g. 1.25 -> "1:15").
- **TypeScript Typings**: Generate shared TypeScript interfaces within the `@/types/` root directory, organized by domain (e.g., `@/types/client-management/`). Use type-only imports (`import type { InterfaceName } from '@/types/domain/file'`) to ensure type consistency across components
- **Date Handling**: When populating HTML `<input type="date">` fields from API data, always truncate the date string to `YYYY-MM-DD` using `.split(/[ T]/)[0]`. This ensures compatibility with both ISO and space-separated date formats (the latter is used by Laravel's `SerializesDatesAsLocal` trait).
- **Imports**: CSV parsing for financial data (IB, Fidelity schemas in `docs/`)
- **State**: Client-side state managed in React; server state via API calls
- **Auth**: Session-based with `auth` middleware on protected routes. On localhost, password `1234567890` works for any user (Master Password).
- **Gates**: Use Laravel Gates for authorization (e.g., `Gate::authorize('admin')` for admin-only actions)
- **User Roles**: Multiple roles per user stored as comma-separated string. Check with `$user->hasRole('admin')` helper method

## Common Patterns
- **Transaction CRUD**: API endpoints like `/api/finance/{account_id}/line_items` for GET/POST/DELETE
- **Tagging System**: Many-to-many via `fin_account_line_item_tag_map` table
- **Linking**: Transactions can link to related entries (e.g., buys/sells)
- **Statements**: Balance snapshots with detailed line items in `fin_statement_details`
- **File Uploads**: Handle CSV imports with validation and parsing logic
- **Prior-Month Billing**: Invoices for month M cover work from M-1 (dated last day of M-1) plus retainer for M (dated first day of M). The system uses a "give and take" model where overages in M-1 are carried forward as a negative balance rather than billed immediately. Retainer hours in future months first offset any carried-forward negative balance. Pre-agreement months are treated as having 0 retainer hours, with their hours naturally carrying forward into the first active agreement month's pool.
- **Minimum Availability Rule**: If the carried-forward negative balance reduces the new month's availability (Retainer - Debt) below 1 hour, the system automatically bills "catch-up hours" (appearing as `additional_hours`) to pay down the debt enough to restore 1 hour of availability.
- **Invoice Line Types**: `prior_month_retainer` ($0, work covered by retainer/rollover/negative balance pool), `additional_hours` (catch-up billing or manual overage), `prior_month_billable` (not typically used in current model), `retainer` (monthly fee), `expense` (reimbursable costs), `credit` (informational balance updates), `adjustment` (manual adjustments).
- **Invoice Line Dates**: Each line has a `line_date` field. Prior-month work lines use last day of M-1; retainer uses first day of M; expenses use their original expense date.
- **Invoice Period**: `period_start` and `period_end` are expanded to include all line item dates. The chronological balance pool starts from the earliest relevant time entry or agreement date.
- **Invoice Time Entry Dates**: API response includes `time_entries` array with `date_worked` for each entry, enabling display of original work dates in detail view.
- **Invoice Detail Display**: The invoice page includes a "Show Detail" toggle switch (Switch component) in the top-right corner above the table (default: ON). When enabled, time entry descriptions appear as indented bullet lists below each line item, showing description, hours, and original date.
- **Invoice Quantity Formatting**: Retainer quantity="1", all time-based lines (including manual ones) ALWAYS use "h:mm" format (e.g., "2:30"), expenses quantity="1". The backend `calculateTotal` method handles "h:mm" quantities by parsing them to total minutes.
- **Invoice Retainer Description**: Monthly Retainer line includes the date in description (e.g., "Monthly Retainer (10 hours) - Feb 1, 2024").
- **Invoice Page Title**: Browser title includes invoice number (e.g., "Invoice ABC-202402-001 - Company Name").
- **Draft Invoice Regeneration**: When regenerating draft invoices, all time/expense links are cleared and system lines deleted before rebuilding. Manual adjustments are preserved.
- **Rollover Hours**: Unused retainer hours roll over based on `rollover_months` in agreement. FIFO ordering - oldest hours used first, oldest hours expire first.
- **Reimbursable Expenses**: Expenses with `is_reimbursable=true` and `expense_date <= invoice_end_date` are auto-included. Each creates a separate invoice line with its original expense date.
- **Agreement Page Help Icons**: Agreement Summary items display help icons (HelpCircle from lucide-react) with Tooltip components explaining each term. Rollover Period is hidden completely if value is 0 or null. Signed badge uses green color (`bg-green-600`).
- **Agreement Invoices Section**: Below Agreement Files, display a section listing all invoices related to the agreement with invoice number, period dates, total amount, and status badge (green for paid).

## File Structure Highlights
- `app/Models/`: Eloquent models with relationships (organized in subdirectories for complex domains)
- `app/Http/Controllers/`: Controllers (organized in subdirectories for complex features)
- `resources/views/finance/`: Blade templates with React mount points
- `resources/views/client-management/`: Client management Blade templates
- `resources/js/components/finance/`: React components for finance features
- `resources/js/components/client-management/`: React components for client management
- `resources/js/navbar.tsx`: Main navigation component with module links
- `routes/api.php`: Finance API endpoints
- `routes/web.php`: Web routes for pages
- `docs/`: Import schemas, data formats, and feature documentation
- `training_data/`: Sample CSV files for testing imports

Focus on financial data integrity, proper error handling for imports, and maintaining relationships between accounts, transactions, and statements.</content>
<parameter name="filePath">/Users/bwh/proj/bwh/bwh-php/.github/copilot-instructions.md