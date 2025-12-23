# Client Management System Documentation

## Overview
The Client Management system is an admin-only feature for managing client companies and their associated users. It enables tracking of client information, billing rates, and user assignments.

## Architecture

### Authorization
- **Admin Gate**: Located in `AppServiceProvider.php`, defines who can access client management features
  - Returns `true` if user ID is 1 (first user)
  - Returns `true` if user has `user_role = 'Admin'`
  - All Client Management routes and API endpoints check this gate

### Database Schema

#### `users` table
- Added `user_role` column (string, default: 'User')
- Values: 'User' or 'Admin'
- Indexed for performance

#### `client_companies` table
- `id`: Primary key (auto-increment)
- `company_name`: Company name (required, indexed)
- `address`: Full address (text, nullable)
- `website`: Company website URL (nullable)
- `phone_number`: Contact phone (nullable)
- `default_hourly_rate`: Default billing rate (decimal 8,2, nullable)
- `additional_notes`: Free-form notes (text, nullable)
- `is_active`: Active status (boolean, default true, indexed)
- `last_activity`: Timestamp of last update (auto-updated on save)
- `created_at`: Creation timestamp
- `updated_at`: Last modification timestamp
- `deleted_at`: Soft delete timestamp (nullable)

**Features:**
- Soft deletes enabled via Eloquent `SoftDeletes` trait
- Automatically maintains `last_activity` via `touchLastActivity()` method

#### `client_company_user` pivot table
- `id`: Primary key
- `client_company_id`: Foreign key to `client_companies` (cascade on delete)
- `user_id`: Foreign key to `users` (cascade on delete)
- `created_at`, `updated_at`: Timestamps
- Unique constraint on `[client_company_id, user_id]` pair

### Models

#### `App\Models\ClientManagement\ClientCompany`
Location: `app/Models/ClientManagement/ClientCompany.php`

**Relationships:**
- `users()`: Many-to-many relationship with `User` model via `client_company_user` pivot table

**Methods:**
- `touchLastActivity()`: Updates `last_activity` to current timestamp

**Traits:**
- `SoftDeletes`: Enables soft deletion

#### `App\Models\User` (extended)
Added relationship:
- `clientCompanies()`: Many-to-many relationship with `ClientCompany` model

### Controllers

#### `App\Http\Controllers\ClientManagement\ClientCompanyController`
Location: `app/Http/Controllers/ClientManagement/ClientCompanyController.php`

Web routes controller for Blade views:
- `index()`: List all client companies
- `create()`: Show new company form
- `store()`: Create new company (only requires `company_name`)
- `show($id)`: Display company details
- `update($id)`: Update company information (automatically updates `last_activity`)
- `destroy($id)`: Soft delete company

All methods use `Gate::authorize('Admin')` for authorization.

#### `App\Http\Controllers\ClientManagement\ClientCompanyApiController`
Location: `app/Http/Controllers/ClientManagement/ClientCompanyApiController.php`

API endpoints for React components:
- `index()`: Get all companies with eager-loaded users
- `getUsers()`: Get all users (for invite modal)

#### `App\Http\Controllers\ClientManagement\ClientCompanyUserController`
Location: `app/Http/Controllers/ClientManagement/ClientCompanyUserController.php`

User assignment API:
- `store()`: Attach user to company (checks for existing assignment)
- `destroy($companyId, $userId)`: Detach user from company

### Routes

#### Web Routes (`routes/web.php`)
All protected by `auth` middleware:
- `GET /client/mgmt` → List page
- `GET /client/mgmt/new` → New company form
- `POST /client/mgmt` → Create company
- `GET /client/mgmt/{id}` → Company details
- `PUT /client/mgmt/{id}` → Update company
- `DELETE /client/mgmt/{id}` → Delete company

#### API Routes (`routes/api.php`)
All protected by `['web', 'auth']` middleware:
- `GET /api/client/mgmt/companies` → Get all companies
- `GET /api/client/mgmt/users` → Get all users
- `POST /api/client/mgmt/assign-user` → Assign user to company
- `DELETE /api/client/mgmt/{companyId}/users/{userId}` → Remove user from company

### Views

#### Blade Templates
Location: `resources/views/client-management/`

- `index.blade.php`: Mounts `ClientManagementIndexPage` React component
- `create.blade.php`: Mounts `ClientManagementCreatePage` React component
- `show.blade.php`: Mounts `ClientManagementShowPage` React component with `data-company-id`

All use Vite entry point: `resources/js/client-management.tsx`

#### React Components
Location: `resources/js/components/client-management/`

**ClientManagementIndexPage.tsx**
- Lists all active companies with their users
- Shows inactive companies in collapsible section
- "Invite People" button opens modal
- "New Company" button navigates to create page
- Uses shadcn/ui Card, Badge, Button components

**ClientManagementCreatePage.tsx**
- Simple form with only company name (required)
- Creates company and redirects to details page
- Uses shadcn/ui Card, Input, Button components

**ClientManagementShowPage.tsx**
- Full company information form
- All fields editable except ID and last_activity
- Displays associated users with remove buttons
- Updates `last_activity` on save
- Shows metadata (ID, creation date)
- Uses shadcn/ui Card, Input, Textarea, Checkbox, Badge components

**InvitePeopleModal.tsx**
- Modal for assigning users to companies
- Dropdowns for user and company selection
- Prevents duplicate assignments
- Uses shadcn/ui Dialog, Button, Label components

### Styling
- Uses shadcn/ui components with Tailwind CSS
- Follows existing finance module patterns
- Responsive design with container max-width
- Consistent with mockup layout:
  - Company cards with name and user badges
  - Details button on each card
  - Collapsible inactive section at bottom

## User Workflow

### Creating a New Company
1. Admin navigates to `/client/mgmt`
2. Clicks "New Company" button
3. Enters company name
4. Clicks "Create Company"
5. Redirected to company details page with all fields available

### Editing Company Details
1. Admin navigates to company list or directly to `/client/mgmt/{id}`
2. Edits any field (address, website, phone, rate, notes, status)
3. Clicks "Save Changes"
4. `last_activity` automatically updated to current timestamp

### Assigning Users to Companies
1. Admin clicks "Invite People" button on list page
2. Modal opens with user and company dropdowns
3. Selects user and target company
4. Clicks "Add User"
5. List refreshes showing updated associations

### Removing Users from Companies
1. Admin views company details page
2. Clicks X button on user badge
3. Confirms removal
4. User removed from company (pivot record deleted)

### Deactivating Companies
1. Admin edits company details
2. Unchecks "Is Active" checkbox
3. Saves changes
4. Company moves to "Inactive Companies" section on list page

## Future Enhancements
The Client Management system is designed to support future features:

### Planned Additions
- **Projects**: Track projects per client company
- **Task Management**: Associate tasks with projects and clients
- **Time Tracking**: Log hours worked per project/client
- **Billing**: Generate invoices based on time logs and hourly rates
- **Expense Tracking**: Track project-related expenses
- **Reporting**: Revenue per client, project profitability, etc.

### Extensibility Considerations
- Models and controllers organized in `ClientManagement` subdirectories
- Pivot table ready for additional metadata (e.g., role, permissions)
- `default_hourly_rate` field prepared for billing system
- `last_activity` tracks engagement for retention analysis
- Soft deletes preserve historical data for reporting

## Security
- All routes protected by authentication middleware
- Admin gate enforced on all endpoints
- CSRF protection on all state-changing operations
- Cascade deletes maintain referential integrity
- Soft deletes prevent accidental data loss

## Testing Checklist
- [ ] User with `user_role='Admin'` can access all pages
- [ ] User ID 1 can access all pages regardless of role
- [ ] Non-admin users receive 403 errors
- [ ] Company creation redirects to details page
- [ ] Company updates modify `last_activity`
- [ ] User assignment prevents duplicates
- [ ] User removal works correctly
- [ ] Inactive companies appear in collapsible section
- [ ] Soft-deleted companies don't appear in lists
- [ ] Foreign key constraints prevent orphaned records
