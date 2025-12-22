# BWH PHP Copilot Instructions

## Architecture Overview
This is a hybrid Laravel 12 + React TypeScript application for personal finance management. It combines server-side Blade templates with client-side React components for interactive features.

### Key Components
- **Backend**: Laravel controllers return Blade views with data attributes
- **Frontend**: React components mount into DOM elements using `createRoot`
- **Data Flow**: Blade passes initial data via `data-*` attributes; React handles UI updates via API calls
- **API**: RESTful endpoints under `/api` for CRUD operations
- **Domain**: Financial accounts, transactions, statements, payslips, RSUs, and CSV imports
- **Modules**: Finance (accounts, transactions, statements, payslips, RSUs), Tools (license manager, bingo, IRS F461, maxmin), Recipes, Projects
- **Authentication**: Session-based; protected routes use `auth` middleware (web routes) or `['web', 'auth']` (API routes)

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

## Key Conventions
- **Models**: Use Eloquent relationships (e.g., `FinAccountLineItems` belongs to `FinAccounts`)
- **Routes**: Web routes (`routes/web.php`) return Blade views for pages; API routes (`routes/api.php`) handle data operations with `['web', 'auth']` middleware
- **Components**: Use shadcn/ui + Radix UI primitives with Tailwind CSS
- **Imports**: CSV parsing for financial data (IB, Fidelity schemas in `docs/`)
- **State**: Client-side state managed in React; server state via API calls
- **Auth**: Session-based with `auth` middleware on protected routes

## Common Patterns
- **Transaction CRUD**: API endpoints like `/api/finance/{account_id}/line_items` for GET/POST/DELETE
- **Tagging System**: Many-to-many via `fin_account_line_item_tag_map` table
- **Linking**: Transactions can link to related entries (e.g., buys/sells)
- **Statements**: Balance snapshots with detailed line items in `fin_statement_details`
- **File Uploads**: Handle CSV imports with validation and parsing logic

## File Structure Highlights
- `app/Models/`: Eloquent models with relationships
- `resources/views/finance/`: Blade templates with React mount points
- `resources/js/components/finance/`: React components for finance features
- `resources/js/navbar.tsx`: Main navigation component with module links
- `routes/api.php`: Finance API endpoints
- `routes/web.php`: Web routes for pages
- `docs/`: Import schemas and data formats
- `training_data/`: Sample CSV files for testing imports

Focus on financial data integrity, proper error handling for imports, and maintaining relationships between accounts, transactions, and statements.</content>
<parameter name="filePath">/Users/bwh/proj/bwh/bwh-php/.github/copilot-instructions.md