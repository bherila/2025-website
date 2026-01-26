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
- **TypeScript Typings**: Generate shared TypeScript interfaces within the `@/types/` root directory, organized by domain (e.g., `@/types/client-management/`). Use type-only imports (`import type { InterfaceName } from '@/types/domain/file'`) to ensure type consistency across components
- **Date Handling**: When populating HTML `<input type="date">` fields from API data, always truncate the date string to `YYYY-MM-DD` using `.split(/[ T]/)[0]`. This ensures compatibility with both ISO and space-separated date formats (the latter is used by Laravel's `SerializesDatesAsLocal` trait).
- **Imports**: CSV parsing for financial data (IB, Fidelity schemas in `docs/`)
- **State**: Client-side state managed in React; server state via API calls
- **Auth**: Session-based with `auth` middleware on protected routes
- **Gates**: Use Laravel Gates for authorization (e.g., `Gate::authorize('admin')` for admin-only actions)
- **User Roles**: Multiple roles per user stored as comma-separated string. Check with `$user->hasRole('admin')` helper method

## Common Patterns
- **Transaction CRUD**: API endpoints like `/api/finance/{account_id}/line_items` for GET/POST/DELETE
- **Tagging System**: Many-to-many via `fin_account_line_item_tag_map` table
- **Linking**: Transactions can link to related entries (e.g., buys/sells)
- **Statements**: Balance snapshots with detailed line items in `fin_statement_details`
- **File Uploads**: Handle CSV imports with validation and parsing logic
- **Time Entry Splitting**: When generating invoices, if a time entry exceeds the remaining available retainer/rollover hours, the entry MUST be split into two: one row for the billed portion (linked to the invoice) and a replicated row for the unbilled portion (unlinked, to be carried over).
- **Delayed Billing vs Negative Balance**: Two mechanisms for tracking work beyond available hours - delayed billing (actual unbilled time entry records from previous periods) and negative balance (numeric field). These are MUTUALLY EXCLUSIVE to avoid double-counting. If delayed billing entries exist, do NOT also use the negative balance for that period. Delayed billing is processed FIRST and must be covered or billed immediately; it will NOT be carried forward again.
- **Invoice Line Items**: Additional hours (beyond retainer + rollover) are labeled "Additional time" in the line item description (e.g., "Additional time @ $150/hr"). The invoice API includes `time_entries` array for each line item with description and minutes_worked fields.
- **Invoice Detail Display**: The invoice page includes a "Show Detail" toggle switch (Switch component) in the top-right corner above the table. When enabled, time entry descriptions appear as indented bullet lists below each line item, showing description and hours (e.g., "Meeting with client (2.50h)").
- **Carry-Forward UI Indicator**: On the Time Tracking page, unbilled billable time entries from past months display a "CARRY-FORWARD" badge (destructive variant) with a tooltip explaining they will be invoiced in the next billing period.
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