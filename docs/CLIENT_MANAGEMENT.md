# Client Management System Documentation

## Overview
The Client Management system is an admin-only feature for managing client companies and their associated users. It enables tracking of client information, billing rates, and user assignments.

## Architecture

### Authorization
- **Admin Gate**: Located in `AppServiceProvider.php`, defines who can access admin client management features
  - Returns `true` if user ID is 1 (first user)
  - Returns `true` if user has `user_role = 'Admin'`
  - All Client Management admin routes and API endpoints check this gate

- **ClientCompanyMember Gate**: Located in `AppServiceProvider.php`, defines who can access client portal features
  - Returns `true` if user ID is 1 (first user)
  - Returns `true` if user has `user_role = 'Admin'`
  - Returns `true` if user is a member of the specified client company
  - All Client Portal routes and API endpoints check this gate with the company ID

### Database Schema

#### `users` table
- Added `user_role` column (string, default: 'User')
- Values: 'User' or 'Admin'
- Indexed for performance

#### `client_companies` table
- `id`: Primary key (auto-increment)
- `company_name`: Company name (required, indexed)
- `slug`: URL-friendly identifier (unique, indexed, auto-generated from name)
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
- Slug auto-generated from company name on creation

#### `client_projects` table
- `id`: Primary key
- `client_company_id`: Foreign key to `client_companies` (cascade on delete)
- `name`: Project name (required)
- `slug`: URL-friendly identifier (unique per company)
- `description`: Project description (text, nullable)
- `creator_user_id`: Foreign key to `users` (set null on delete)
- `created_at`, `updated_at`: Timestamps

#### `client_tasks` table
- `id`: Primary key
- `project_id`: Foreign key to `client_projects` (cascade on delete)
- `name`: Task name (required)
- `description`: Task description (text, nullable)
- `priority`: Task priority (integer, default 0)
- `completion_date`: When task was completed (nullable)
- `assignee_user_id`: Foreign key to `users` (set null on delete)
- `is_hidden`: Hidden from main view (boolean, default false)
- `creator_user_id`: Foreign key to `users` (set null on delete)
- `created_at`, `updated_at`: Timestamps

#### `client_time_entries` table
- `id`: Primary key
- `client_company_id`: Foreign key to `client_companies` (cascade on delete)
- `project_id`: Foreign key to `client_projects` (set null on delete)
- `task_id`: Foreign key to `client_tasks` (set null on delete)
- `user_id`: Foreign key to `users` (cascade on delete)
- `minutes`: Time tracked in minutes (integer, required)
- `description`: Work description (text, nullable)
- `job_type`: Type of work performed (string, nullable)
- `is_billable`: Whether time is billable (boolean, default true)
- `entry_date`: Date of work (required)
- `creator_user_id`: Foreign key to `users` (set null on delete)
- `created_at`, `updated_at`: Timestamps

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
- `projects()`: One-to-many relationship with `Project` model
- `timeEntries()`: One-to-many relationship with `TimeEntry` model

**Methods:**
- `touchLastActivity()`: Updates `last_activity` to current timestamp
- `generateSlug(string $name)`: Static method that converts name to URL-friendly slug

**Traits:**
- `SoftDeletes`: Enables soft deletion

#### `App\Models\ClientManagement\Project`
Location: `app/Models/ClientManagement/Project.php`

**Relationships:**
- `clientCompany()`: Belongs to `ClientCompany`
- `tasks()`: One-to-many relationship with `Task`
- `timeEntries()`: One-to-many relationship with `TimeEntry`
- `creator()`: Belongs to `User` (creator_user_id)

**Methods:**
- `generateSlug(string $name)`: Static method that converts name to URL-friendly slug

#### `App\Models\ClientManagement\Task`
Location: `app/Models/ClientManagement/Task.php`

**Relationships:**
- `project()`: Belongs to `Project`
- `assignee()`: Belongs to `User` (assignee_user_id)
- `creator()`: Belongs to `User` (creator_user_id)

**Methods:**
- `markCompleted()`: Sets completion_date to now
- `markIncomplete()`: Sets completion_date to null
- `isCompleted()`: Returns boolean if task is complete

#### `App\Models\ClientManagement\TimeEntry`
Location: `app/Models/ClientManagement/TimeEntry.php`

**Relationships:**
- `clientCompany()`: Belongs to `ClientCompany`
- `project()`: Belongs to `Project`
- `task()`: Belongs to `Task`
- `user()`: Belongs to `User`
- `creator()`: Belongs to `User` (creator_user_id)

**Methods:**
- `parseTimeToMinutes(string $timeString)`: Static method that parses "h:mm" or decimal hours to minutes

#### `App\Models\User` (extended)
Added relationship:
- `clientCompanies()`: Many-to-many relationship with `ClientCompany` model

### Controllers

#### `App\Http\Controllers\ClientManagement\ClientCompanyController`
Location: `app/Http/Controllers/ClientManagement/ClientCompanyController.php`

Web routes controller for Blade views:
- `index()`: List all client companies
- `create()`: Show new company form
- `store()`: Create new company (auto-generates slug from company_name)
- `show($id)`: Display company details
- `update($id)`: Update company information (automatically updates `last_activity`)
- `destroy($id)`: Soft delete company

All methods use `Gate::authorize('Admin')` for authorization.

#### `App\Http\Controllers\ClientManagement\ClientCompanyApiController`
Location: `app/Http/Controllers/ClientManagement/ClientCompanyApiController.php`

API endpoints for React components:
- `index()`: Get all companies with eager-loaded users
- `getUsers()`: Get all users (for invite modal)
- `update()`: Update company (validates slug uniqueness)

#### `App\Http\Controllers\ClientManagement\ClientCompanyUserController`
Location: `app/Http/Controllers/ClientManagement/ClientCompanyUserController.php`

User assignment API:
- `store()`: Attach user to company (checks for existing assignment)
- `destroy($companyId, $userId)`: Detach user from company

#### `App\Http\Controllers\ClientManagement\ClientPortalController`
Location: `app/Http/Controllers/ClientManagement/ClientPortalController.php`

Web routes controller for Client Portal:
- `index($slug)`: Portal main page (lists projects and tasks)
- `time($slug)`: Time tracking page
- `project($slug, $projectSlug)`: Project detail page

All methods use `Gate::authorize('ClientCompanyMember', $company->id)` for authorization.

#### `App\Http\Controllers\ClientManagement\ClientPortalApiController`
Location: `app/Http/Controllers/ClientManagement/ClientPortalApiController.php`

API endpoints for Client Portal:
- `getProjects($slug)`: Get projects for company
- `createProject($slug)`: Create new project
- `getTasks($slug)`: Get tasks for company (filterable by project)
- `createTask($slug)`: Create new task
- `updateTask($slug, $taskId)`: Update task (toggle completion, update fields)
- `getTimeEntries($slug)`: Get time entries for company
- `createTimeEntry($slug)`: Create new time entry

All methods use `Gate::authorize('ClientCompanyMember', $company->id)` for authorization.

### Routes

#### Web Routes (`routes/web.php`)
All protected by `auth` middleware:

**Admin Routes:**
- `GET /client/mgmt` → List page
- `GET /client/mgmt/new` → New company form
- `POST /client/mgmt` → Create company
- `GET /client/mgmt/{id}` → Company details
- `PUT /client/mgmt/{id}` → Update company
- `DELETE /client/mgmt/{id}` → Delete company

**Portal Routes:**
- `GET /client/portal/{slug}` → Portal main page (projects/tasks)
- `GET /client/portal/{slug}/time` → Time tracking page
- `GET /client/portal/{slug}/project/{projectSlug}` → Project detail page

#### API Routes (`routes/api.php`)
All protected by `['web', 'auth']` middleware:

**Admin API:**
- `GET /api/client/mgmt/companies` → Get all companies
- `GET /api/client/mgmt/users` → Get all users
- `PUT /api/client/mgmt/companies/{id}` → Update company
- `POST /api/client/mgmt/assign-user` → Assign user to company
- `DELETE /api/client/mgmt/{companyId}/users/{userId}` → Remove user from company

**Portal API:**
- `GET /api/client/portal/{slug}/projects` → Get projects
- `POST /api/client/portal/{slug}/projects` → Create project
- `GET /api/client/portal/{slug}/tasks` → Get tasks
- `POST /api/client/portal/{slug}/tasks` → Create task
- `PUT /api/client/portal/{slug}/tasks/{taskId}` → Update task
- `GET /api/client/portal/{slug}/time-entries` → Get time entries
- `POST /api/client/portal/{slug}/time-entries` → Create time entry

### Views

#### Blade Templates
Location: `resources/views/client-management/`

**Admin Views:**
- `index.blade.php`: Mounts `ClientManagementIndexPage` React component
- `create.blade.php`: Mounts `ClientManagementCreatePage` React component
- `show.blade.php`: Mounts `ClientManagementShowPage` React component with `data-company-id`

**Portal Views:**
Location: `resources/views/client-management/portal/`
- `index.blade.php`: Mounts `ClientPortalIndexPage` with `data-company-slug` and `data-company-name`
- `time.blade.php`: Mounts `ClientPortalTimePage` with `data-company-slug` and `data-company-name`
- `project.blade.php`: Mounts `ClientPortalProjectPage` with project data attributes

Vite entry points:
- Admin: `resources/js/client-management.tsx`
- Portal: `resources/js/client-portal.tsx`

### TypeScript Typings
Shared TypeScript interfaces are generated within the `@/types/client-management/` directory to ensure type consistency across components. When adding new interfaces, create or update files in this directory and import them using type-only imports (`import type { InterfaceName } from '@/types/client-management/file'`).

#### React Components
Location: `resources/js/components/client-management/`

**Admin Components:**

**ClientManagementIndexPage.tsx**
- Lists all active companies with their users
- Shows inactive companies in collapsible section
- "Invite People" button opens modal
- "New Company" button navigates to create page
- Uses shadcn/ui Card, Badge, Button components

**ClientManagementCreatePage.tsx**
- Simple form with only company name (required)
- Creates company and redirects to details page
- Handles slug conflict errors with Alert
- Uses shadcn/ui Card, Input, Button, Alert components

**ClientManagementShowPage.tsx**
- Full company information form
- Slug field with link to portal
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

**Portal Components:**
Location: `resources/js/components/client-management/portal/`

**ClientPortalIndexPage.tsx**
- Main portal page showing projects and tasks
- Task list with completion toggle
- New Project and New Task buttons
- Uses shadcn/ui Card, Button, Checkbox components

**ClientPortalProjectPage.tsx**
- Project detail page
- Tasks filtered to specific project
- New Task button for project
- Uses shadcn/ui Card, Button, Checkbox components

**ClientPortalTimePage.tsx**
- Time tracking interface with monthly groupings
- Shows time entries grouped by month (most recent first)
- Each month displays:
  - **Opening Balance**: Retainer hours + rollover from previous months - expired hours
  - **Time entries** with project, task, description, job type, hours
  - **Closing Balance**: Unused hours available to roll over, excess hours to be invoiced
- Color-coded balance indicators (green for positive, red for negative)
- Collapsible month sections for better navigation
- Uses shadcn/ui Card, Button, Table, Collapsible, Skeleton components

**NewProjectModal.tsx**
- Modal for creating new projects
- Name and description fields
- Uses shadcn/ui Dialog, Input, Textarea components

**NewTaskModal.tsx**
- Modal for creating new tasks
- Name, description, priority, assignee fields
- Uses shadcn/ui Dialog, Input, Textarea, Select components

**NewTimeEntryModal.tsx**
- Modal for logging time
- Project, task, time, description, job type fields
- Time input accepts "h:mm" or decimal hours
- Uses shadcn/ui Dialog, Input, Textarea, Select components

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

### Implemented Features
- ✅ **Projects**: Track projects per client company with slug-based URLs
- ✅ **Task Management**: Associate tasks with projects, track priority and completion
- ✅ **Time Tracking**: Log hours worked per project/task with billable flag
- ✅ **File Attachments**: Upload files to client companies, projects, agreements, and tasks

### Planned Additions
- **Expense Tracking**: Track project-related expenses
- **Reporting**: Revenue per client, project profitability, time utilization, etc.
- **Comments**: Add comments to tasks and time entries

## File Storage System

### Overview
The file storage system enables uploading, downloading, and managing files associated with client management entities (companies, projects, agreements, tasks) and financial accounts. Files are stored in S3-compatible storage with signed URLs for secure access.

### Database Schema

#### `uploaded_files` table
- `id`: Primary key (auto-increment)
- `fileable_type`: Polymorphic type (e.g., 'client_companies', 'client_projects')
- `fileable_id`: ID of the associated entity
- `original_filename`: Original filename as uploaded
- `stored_filename`: UUID-based filename with date prefix (e.g., "2025.01.15 report.pdf")
- `mime_type`: File MIME type
- `file_size`: Size in bytes
- `storage_path`: Full S3 path to file
- `uploaded_by_user_id`: Foreign key to users (set null on delete)
- `created_at`, `updated_at`: Timestamps
- `deleted_at`: Soft delete timestamp

#### `file_download_history` table
- `id`: Primary key
- `uploaded_file_id`: Foreign key to uploaded_files (cascade on delete)
- `downloaded_by_user_id`: Foreign key to users (set null on delete)
- `downloaded_at`: Timestamp of download
- `ip_address`: IP of requester (nullable)

### Supported Entity Types
Files can be attached to:
- **Client Companies**: General company documents (`/api/client/portal/{slug}/files`)
- **Projects**: Project-specific documents (`/api/client/portal/{slug}/projects/{projectSlug}/files`)
- **Agreements**: Agreement documents (`/api/files/agreements/{id}`)
- **Tasks**: Task attachments (`/api/files/tasks/{id}`)
- **Financial Accounts**: Statement files (`/api/files/fin_accounts/{id}`)

### Frontend Components

#### Location: `resources/js/components/shared/FileManager.tsx`

**Components:**
- `FileList`: Displays list of files with download, history, and delete actions
- `FileUploadButton`: Upload button with progress indicator
- `FileHistoryModal`: Shows download history for a file
- `DeleteFileModal`: Confirmation dialog for file deletion

**Hooks:**
- `useFileOperations(options)`: Low-level hook for file CRUD operations
- `useFileManagement(options)`: Higher-level hook that includes modal state management

**Usage Example:**
```tsx
const fileManager = useFileManagement({
  listUrl: `/api/client/portal/${slug}/files`,
  uploadUrl: `/api/client/portal/${slug}/files`,
  uploadUrlEndpoint: `/api/client/portal/${slug}/files/upload-url`,
  downloadUrlPattern: (fileId) => `/api/client/portal/${slug}/files/${fileId}/download`,
  deleteUrlPattern: (fileId) => `/api/client/portal/${slug}/files/${fileId}`,
  historyUrlPattern: (fileId) => `/api/client/portal/${slug}/files/${fileId}/history`,
})

// Use in JSX:
<FileUploadButton onUpload={fileManager.uploadFile} />
<FileList
  files={fileManager.files}
  loading={fileManager.loading}
  isAdmin={isAdmin}
  onDownload={fileManager.downloadFile}
  onDelete={fileManager.handleDeleteRequest}
  title="Files"
/>
<DeleteFileModal
  file={fileManager.deleteFile}
  isOpen={fileManager.deleteModalOpen}
  isDeleting={fileManager.isDeleting}
  onClose={fileManager.closeDeleteModal}
  onConfirm={fileManager.handleDeleteConfirm}
/>
```

### Upload Flow
1. **Small files (≤50MB)**: Direct upload via POST to the upload URL
2. **Large files (>50MB)**: 
   - Request signed S3 URL via POST to upload-url endpoint
   - Upload directly to S3 using PUT with the signed URL
   - Backend creates the file record after S3 upload

### API Endpoints (per entity type)
- `GET /api/.../files` - List files for entity
- `POST /api/.../files` - Upload file directly
- `POST /api/.../files/upload-url` - Get signed URL for large file upload
- `GET /api/.../files/{id}/download` - Get signed download URL
- `GET /api/.../files/{id}/history` - Get download history
- `DELETE /api/.../files/{id}` - Soft delete file

## Billing & Invoicing System

### Database Schema

#### `client_agreements` table
Stores service agreement terms between the admin and client companies.
- `client_agreement_id`: Primary key
- `client_company_id`: Foreign key to `client_companies`
- `active_date`: When the agreement becomes active (required)
- `termination_date`: When the agreement ends (nullable)
- `agreement_text`: Full agreement content (text, nullable)
- `agreement_link`: URL to external agreement document (nullable)
- `client_company_signed_date`: When client signed (nullable)
- `client_company_signed_name`: Name of client signatory (nullable)
- `client_company_signed_title`: Title of client signatory (nullable)
- `client_company_signed_user_id`: User who signed for client (nullable)
- `monthly_retainer_hours`: Hours included per month (decimal 8,2)
- `rollover_months`: Number of months unused hours can roll over (default 0)
- `hourly_rate`: Rate for hours beyond retainer (decimal 8,2)
- `monthly_retainer_fee`: Fixed monthly fee (decimal 10,2)
- `created_at`, `updated_at`: Timestamps

#### `client_invoices` table
Stores invoices generated for clients.
- `client_invoice_id`: Primary key
- `client_company_id`: Foreign key to `client_companies`
- `client_agreement_id`: Foreign key to `client_agreements`
- `invoice_number`: Unique invoice number (string, nullable)
- `period_start`: Billing period start date
- `period_end`: Billing period end date
- `retainer_hours_included`: Hours included in retainer for this period (decimal 8,2)
- `hours_worked`: Total hours worked in period (decimal 8,2)
- `rollover_hours_used`: Hours from rollover applied (decimal 8,2)
- `unused_hours_balance`: Hours remaining after period (decimal 8,2)
- `negative_hours_balance`: Hours over retainer not covered by rollover (decimal 8,2)
- `hours_billed_at_rate`: Hours charged at hourly rate (decimal 8,2)
- `invoice_total`: Total invoice amount (decimal 10,2)
- `status`: draft, issued, paid, void (enum, default draft)
- `issue_date`: When invoice was issued (nullable)
- `due_date`: Payment due date (nullable)
- `paid_date`: When payment received (nullable)
- `notes`: Internal or customer-facing notes (text, nullable)
- `created_at`, `updated_at`: Timestamps
- `deleted_at`: Soft delete timestamp (nullable)

#### `client_invoice_payments` table
Stores payments made against invoices.
- `client_invoice_payment_id`: Primary key
- `client_invoice_id`: Foreign key to `client_invoices`
- `amount`: Payment amount (decimal 10,2)
- `payment_date`: Date payment was received
- `payment_method`: Credit Card, ACH, Wire, Check, Other (string)
- `notes`: Payment notes (text, nullable)
- `created_at`, `updated_at`: Timestamps

#### `client_invoice_lines` table
Individual line items on invoices.
- `client_invoice_line_id`: Primary key
- `client_invoice_id`: Foreign key to `client_invoices`
- `description`: Line item description (required)
- `quantity`: Quantity (decimal 10,4)
- `unit_price`: Price per unit (decimal 10,2)
- `line_total`: Calculated total (decimal 10,2)
- `line_type`: retainer, hourly, expense, adjustment (string)
- `hours`: Hours if applicable (decimal 8,2, nullable)
- `created_at`, `updated_at`: Timestamps

### Models

#### `App\Models\ClientManagement\ClientAgreement`
Location: `app/Models/ClientManagement/ClientAgreement.php`

**Relationships:**
- `clientCompany()`: Belongs to `ClientCompany`
- `invoices()`: One-to-many relationship with `ClientInvoice`
- `signedByUser()`: Belongs to `User` (client_company_signed_user_id)

#### `App\Models\ClientManagement\ClientInvoice`
Location: `app/Models/ClientManagement/ClientInvoice.php`

**Relationships:**
- `clientCompany()`: Belongs to `ClientCompany`
- `agreement()`: Belongs to `ClientAgreement`
- `lineItems()`: One-to-many relationship with `ClientInvoiceLine`
- `payments()`: One-to-many relationship with `ClientInvoicePayment`

**Computed Properties (Accessors):**
- `payments_total`: Sum of all payment amounts
- `remaining_balance`: `invoice_total - payments_total`

**Methods:**
- `isEditable()`: Returns true if status is 'draft'
- `isIssued()`: Returns true if `issue_date` is set
- `issue()`: Sets status to 'issued' and `issue_date` to now
- `markPaid($paidDate = null)`: Sets status to 'paid' and `paid_date` (defaults to now)
- `void()`: Sets status to 'void'
- `unVoid(string $targetStatus)`: Reverts a voided invoice to 'issued' or 'draft' status
- `recalculateTotal()`: Updates `invoice_total` from sum of line items

#### `App\Models\ClientManagement\ClientInvoicePayment`
Location: `app/Models/ClientManagement/ClientInvoicePayment.php`

**Relationships:**
- `invoice()`: Belongs to `ClientInvoice`

#### `App\Models\ClientManagement\ClientInvoiceLine`
Location: `app/Models/ClientManagement/ClientInvoiceLine.php`

**Relationships:**
- `invoice()`: Belongs to `ClientInvoice`

### Services

#### `App\Services\ClientManagement\RolloverCalculator`
Location: `app/Services/ClientManagement/RolloverCalculator.php`

Pure PHP class encapsulating all rollover hour calculation logic. Designed for testability and reuse.

**Key Concepts:**
- **Retainer Hours**: Monthly hours included in the service agreement
- **Rollover Hours**: Unused hours from previous months that carry forward
- **Rollover Months**: Number of months hours can roll over (0 = no rollover)
- **Expired Hours**: Rollover hours that exceeded the rollover_months limit

**Public Methods:**

```php
public function calculateOpeningBalance(array $monthlyData, string $yearMonth): array
```
Returns the opening balance for a given month:
- `retainer_hours`: Hours included in current month
- `rollover_hours`: Hours carried from previous months
- `expired_hours`: Hours that expired (exceeded rollover_months limit)
- `total_available`: retainer + rollover

```php
public function calculateClosingBalance(array $openingBalance, float $hoursWorked): array
```
Returns the closing balance after work:
- `unused_hours`: Hours that can roll to next month
- `excess_hours`: Hours beyond available (will be billed at hourly rate)
- `status`: 'under' or 'over'

```php
public function calculateMonthSummary(array $monthlyData, string $yearMonth, float $hoursWorked): array
```
Combines opening and closing calculations for a complete month summary.

```php
public function calculateMultipleMonths(array $monthlyData): array
```
Processes all months chronologically, calculating opening and closing balances for each.

**Rollover Logic:**

The rollover calculation uses FIFO (First In, First Out) for tracking which hours expire:

1. **rollover_months = 0**: No rollover; unused hours expire immediately
2. **rollover_months = 1**: Hours can only be used in the month they're earned
3. **rollover_months = 2**: Hours can roll over to the next month, then expire
4. **rollover_months = 3+**: Hours can roll over for N-1 additional months

**Example Scenarios:**

| Scenario | Retainer | Worked | Rollover In | Result |
|----------|----------|--------|-------------|--------|
| Under retainer, no rollover | 10h | 8h | 0h | 2h unused, rolls over |
| Over retainer, has rollover | 10h | 14h | 5h | Uses 4h rollover, 1h rollover remains |
| Over retainer, insufficient rollover | 10h | 18h | 5h | Uses all 5h rollover, 3h billed extra |
| Hours expire | 10h | 6h | 8h (3mo old) | 4h expire, 4h new unused |

### Delayed Billing

Delayed billing allows billable time entries to be tracked and eventually invoiced, even when they are created during periods without an active agreement.

**How It Works:**

1. **Time Entry Creation Without Agreement**: When billable time entries are created for a client company that has no active agreement, those entries are marked as billable but remain uninvoiced.

2. **UI Warning**: The Time Records page displays an amber warning for months where there is no active agreement, showing the number of unbilled hours that are pending.

3. **Invoice Generation**: When an invoice is generated for a period with an active agreement, the invoicing system automatically includes all prior unbilled time entries as a "Prior Period Hours (delayed billing)" line item.

4. **Billing Rate**: Delayed billing hours are charged at the current agreement's hourly rate.

**Example Scenario:**

| Month | Agreement Status | Hours Worked | Result |
|-------|-----------------|--------------|--------|
| January | None | 5h | 5h marked as unbilled, warning shown |
| February | Active ($150/hr, 10h retainer) | 8h | Invoice includes: Retainer $1000 + Prior Period Hours 5h × $150 = $750 |

**API Response:**

The time entries API includes delayed billing information:

```json
{
  "months": [
    {
      "year_month": "2024-01",
      "total_hours": 5.0,
      "has_active_agreement": false,
      "unbilled_hours": 5.0
    },
    {
      "year_month": "2024-02",
      "total_hours": 8.0,
      "has_active_agreement": true,
      "unbilled_hours": 0
    }
  ],
  "total_unbilled_hours": 5.0
}
```

**Invoice Line Types:**

| Line Type | Description |
|-----------|-------------|
| `retainer` | Monthly retainer fee |
| `additional_hours` | Hours exceeding retainer in current period |
| `delayed_billing` | Prior period hours billed to current invoice |
| `credit` | Rollover hours applied (informational, $0) |

### Controllers

#### `App\Http\Controllers\ClientManagement\ClientAgreementController`
Web routes for managing agreements:
- `index($companyId)`: List company agreements
- `create($companyId)`: New agreement form
- `store($companyId)`: Create agreement
- `show($companyId, $agreementId)`: View/edit agreement

#### `App\Http\Controllers\ClientManagement\ClientInvoiceController`
Web routes for managing invoices:
- `index($companyId)`: List company invoices
- `show($companyId, $invoiceId)`: View/edit invoice
- `create($companyId)`: Generate new invoice

#### `App\Http\Controllers\ClientManagement\ClientInvoiceApiController`
API endpoints for invoice operations:
- `index($company)`: List all invoices for a company
- `show($company, $invoice)`: Get invoice details with line items and payments
- `preview($company)`: Preview invoice before generating
- `store($company)`: Generate new invoice for billing period
- `update($company, $invoice)`: Update invoice notes/due date (draft only)
- `issue($company, $invoice)`: Issue a draft invoice
- `markPaid($company, $invoice)`: Mark invoice as paid
- `void($company, $invoice)`: Void an invoice (only if no payments exist)
- `unVoid($company, $invoice)`: Revert a voided invoice to issued/draft
- `destroy($company, $invoice)`: Delete a draft invoice
- `addLineItem($company, $invoice, ...)`: Add custom line item
- `updateLineItem($company, $invoice, $lineId, ...)`: Update a line item
- `removeLineItem($company, $invoice, $lineId)`: Remove a line item
- `getPayments($company, $invoice)`: List payments on invoice
- `addPayment($company, $invoice, ...)`: Add payment (auto-marks paid if balance is zero)
- `updatePayment($company, $invoice, $payment, ...)`: Update payment
- `deletePayment($company, $invoice, $payment)`: Delete payment

**Invoice Status Transitions:**
```
draft → issued → paid
         ↓
        void → issued (via unVoid)
               ↓
              draft (via unVoid)
```

**Validation Rules:**
- Cannot void an invoice with payments (must delete payments first)
- Cannot create overlapping invoice periods for the same company
- Cannot issue an invoice that's already issued
- Only draft invoices can be deleted

### API Routes for Invoices

All routes require `['web', 'auth']` middleware and Admin gate authorization:

```
GET    /api/client/mgmt/companies/{company}/invoices
GET    /api/client/mgmt/companies/{company}/invoices/{invoice}
POST   /api/client/mgmt/companies/{company}/invoices/generate-all
POST   /api/client/mgmt/companies/{company}/invoices
PUT    /api/client/mgmt/companies/{company}/invoices/{invoice}
POST   /api/client/mgmt/companies/{company}/invoices/{invoice}/issue
POST   /api/client/mgmt/companies/{company}/invoices/{invoice}/mark-paid
POST   /api/client/mgmt/companies/{company}/invoices/{invoice}/void
POST   /api/client/mgmt/companies/{company}/invoices/{invoice}/unvoid
DELETE /api/client/mgmt/companies/{company}/invoices/{invoice}
POST   /api/client/mgmt/companies/{company}/invoices/{invoice}/line-items
PUT    /api/client/mgmt/companies/{company}/invoices/{invoice}/line-items/{lineId}
DELETE /api/client/mgmt/companies/{company}/invoices/{invoice}/line-items/{lineId}
GET    /api/client/mgmt/companies/{company}/invoices/{invoice}/payments
POST   /api/client/mgmt/companies/{company}/invoices/{invoice}/payments
PUT    /api/client/mgmt/companies/{company}/invoices/{invoice}/payments/{payment}
DELETE /api/client/mgmt/companies/{company}/invoices/{invoice}/payments/{payment}
```

### Unit Tests

#### `tests/Unit/Services/ClientManagement/RolloverCalculatorTest.php`

Comprehensive test suite with 25 tests covering all rollover scenarios:

**Opening Balance Tests:**
- `test_opening_balance_first_month_no_rollover`
- `test_opening_balance_with_prior_months`
- `test_opening_balance_with_expired_hours`

**Closing Balance Tests:**
- `test_closing_balance_under_retainer`
- `test_closing_balance_exact_match`
- `test_closing_balance_over_retainer`

**Multiple Months Integration Tests:**
- `test_multiple_months_case_a_uses_rollover`: Hours exceed retainer, rollover available
- `test_multiple_months_case_b_exceeds_rollover`: Hours exceed both retainer + rollover
- `test_multiple_months_case_c_unused_rolls_over`: Under retainer, accumulates balance
- `test_multiple_months_case_d_no_rollover_allowed`: rollover_months=1 means no rollover

**Edge Cases:**
- Months with zero retainer hours
- Very large rollover balances
- Partial month usage
- Mixed over/under months

Run tests with:
```bash
vendor/bin/phpunit tests/Unit/Services/ClientManagement/RolloverCalculatorTest.php
```

### Portal API Enhancements

The `getTimeEntries()` API now returns enhanced data for the monthly grouping UI:

```json
{
  "time_entries": [...],
  "monthly_data": {
    "2025-01": {
      "retainer_hours": 20,
      "rollover_months": 3,
      "hours_worked": 18.5,
      "opening_balance": {
        "retainer_hours": 20,
        "rollover_hours": 5,
        "expired_hours": 0,
        "total_available": 25
      },
      "closing_balance": {
        "unused_hours": 6.5,
        "excess_hours": 0,
        "status": "under"
      }
    },
    ...
  }
}
```

### Extensibility Considerations
- Models and controllers organized in `ClientManagement` subdirectories
- Pivot table ready for additional metadata (e.g., role, permissions)
- `default_hourly_rate` field prepared for billing system
- `last_activity` tracks engagement for retention analysis
- Soft deletes preserve historical data for reporting

## Invoice Generation and Management

### Automated Invoice Generation

The system provides automated invoice generation for all calendar months via the "Run Invoicing" feature.

**Admin Page Enhancements:**

The Client Management admin page (`/client/mgmt`) now displays key metrics for each company:

- **Invoice Balance Due**: Total outstanding balance across all unpaid/issued invoices (orange badge with $ icon)
- **Uninvoiced Hours**: Total billable hours not yet linked to any invoice (blue badge with clock icon)
- **Run Invoicing Button**: Per-company button to auto-generate invoices for all months

**Workflow:**

1. Admin clicks "Run Invoicing" for a company
2. System automatically generates invoices for ALL calendar months from agreement start date to present
3. Results summary shows:
   - **Generated**: New invoices created (draft status)
   - **Updated**: Existing draft invoices regenerated with latest data
   - **Skipped**: Issued/paid/void invoices left untouched

**Key Features:**

- **No manual date selection**: Automatically uses calendar month boundaries
- **Smart detection**: Skips months without time entries or where invoice already finalized
- **Draft regeneration**: Updates existing draft invoices with latest time entry data
- **Protected invoices**: Never modifies issued, paid, or voided invoices

**API Endpoint:**
```
POST /api/client/mgmt/companies/{company}/invoices/generate-all
```

**Response Format:**
```json
{
  "message": "Invoice generation completed",
  "results": {
    "generated": [
      {"period": "2024-01", "invoice_id": 1, "invoice_number": "INV-001"},
      {"period": "2024-02", "invoice_id": 2, "invoice_number": "INV-002"}
    ],
    "updated": [
      {"period": "2024-03", "invoice_id": 3, "invoice_number": "INV-003"}
    ],
    "skipped": [
      {"period": "2024-04", "invoice_id": 4, "status": "paid", "reason": "Invoice already exists with status: paid"}
    ],
    "summary": {
      "generated_count": 2,
      "updated_count": 1,
      "skipped_count": 1
    }
  }
}
```

### Manual Line Item Preservation

When regenerating invoices (e.g., via "Run Invoicing" or manual re-generation), the system intelligently preserves manual adjustments:

**System-Generated Line Items** (auto-deleted and regenerated):
- `retainer`: Monthly retainer fee
- `additional_hours`: Hours exceeding retainer + rollover
- `credit`: Informational rollover hours applied (zero amount)

**Manual Line Items** (preserved during regeneration):
- `expense`: Manual expenses or fees added by admin
- `adjustment`: Price adjustments or credits

**Example Scenario:**

1. Draft invoice created automatically with retainer line
2. Admin manually adds $500 "Consulting fee" (expense type)
3. Admin clicks "Run Invoicing" to refresh with latest time entries
4. Result: System line items regenerated, $500 consulting fee preserved

**Line Type Enum Values:**
```php
enum('retainer', 'additional_hours', 'expense', 'adjustment', 'credit')
```

**Note on Delayed Billing:**
Prior period hours (delayed billing) are created as `additional_hours` type with description containing "Prior Period" to distinguish them from current period additional hours.

### Invoice Line Item Management

**Adding Manual Line Items:**

Via API:
```
POST /api/client/mgmt/companies/{company}/invoices/{invoice}/line-items
```

Body:
```json
{
  "description": "Manual consulting fee",
  "quantity": 1,
  "unit_price": 500.00,
  "line_type": "expense"
}
```

**Editing Line Items:**

- System-generated line items (retainer, additional_hours, credit) cannot be edited directly
- Manual line items (expense, adjustment) can be updated via API
- All line items recalculate invoice total automatically

**Deleting Line Items:**

- System-generated line items are automatically regenerated if invoice is refreshed
- Manual line items persist across regeneration unless explicitly deleted
- Deleting a line item unlinks any associated time entries

**Time Entry Linking:**

System automatically links time entries to invoice lines:
1. Up to retainer hours → linked to retainer line
2. Additional hours → linked to additional_hours line
3. Prior period hours → linked to delayed billing line (additional_hours with "Prior Period" description)

Unlinking occurs when:
- Invoice is voided
- Invoice is deleted
- Draft invoice is regenerated (system lines only)

### Invoice Payment Tracking

**Adding Payments:**

When adding a payment to an invoice:
- `amount`: Payment amount (supports partial payments)
- `payment_date`: Date payment received
- `payment_method`: Credit Card, ACH, Wire Transfer, Check, Other
- `notes`: Optional payment notes

**Auto-Paid Status:**

When `payments_total >= invoice_total`:
- Invoice status automatically changes to 'paid'
- `paid_date` set to the date of the latest payment (not current date)

**Payment Deletion:**

- Deleting a payment recalculates remaining balance
- If invoice was marked paid, status reverts to 'issued' or 'draft'
- Cannot void an invoice with payments (must delete payments first)

**Payment Default Amount:**

When adding a payment via UI, the amount field defaults to the remaining balance, simplifying full-payment entry.

## Security
- All routes protected by authentication middleware
- Admin gate enforced on admin endpoints
- ClientCompanyMember gate enforced on portal endpoints
- CSRF protection on all state-changing operations
- Cascade deletes maintain referential integrity
- Soft deletes prevent accidental data loss
- Slug uniqueness validated on create and update

## Testing Checklist

### Admin Features
- [ ] User with `user_role='Admin'` can access all admin pages
- [ ] User ID 1 can access all admin pages regardless of role
- [ ] Non-admin users receive 403 errors on admin routes
- [ ] Company creation generates unique slug from name
- [ ] Company creation with duplicate slug shows error
- [ ] Company updates modify `last_activity`
- [ ] Slug updates validate uniqueness
- [ ] User assignment prevents duplicates
- [ ] User removal works correctly
- [ ] Inactive companies appear in collapsible section
- [ ] Soft-deleted companies don't appear in lists
- [ ] Foreign key constraints prevent orphaned records

### Portal Features
- [ ] Company members can access their portal via slug
- [ ] Non-members receive 403 errors on portal routes
- [ ] User ID 1 can access all portals regardless of membership
- [ ] Admin users can access all portals regardless of membership
- [ ] Projects can be created with name and description
- [ ] Tasks can be created and assigned to projects
- [ ] Tasks can be marked complete/incomplete
- [ ] Time entries accept "h:mm" format (e.g., "2:30")
- [ ] Time entries accept decimal hours (e.g., "2.5")
- [ ] Time entries associated with projects and tasks
- [ ] Deleting a company cascades to projects, tasks, time entries
- [ ] Deleting a project cascades to tasks, nullifies time entries

### File Management Features
- [ ] Files can be uploaded to client companies
- [ ] Files can be uploaded to projects
- [ ] Files can be uploaded to agreements
- [ ] Files can be uploaded to tasks
- [ ] Files can be downloaded with signed URL
- [ ] Download history is tracked
- [ ] Files can be soft-deleted (admin only)
- [ ] Large files upload directly to S3 via signed URL
- [ ] Upload progress indicator shows percentage

### Billing Features
- [ ] Agreements can be created with all required fields
- [ ] Client can sign agreement through portal
- [ ] Invoices calculate retainer hours correctly
- [ ] Rollover hours calculated correctly across months
- [ ] Expired hours calculated correctly based on rollover_months
- [ ] Invoice line items generated with correct amounts
- [ ] Invoice status transitions work (draft → issued → paid)
- [ ] Portal shows invoices to client users
- [ ] Cannot create overlapping invoice periods for same company
- [ ] Voided invoice periods can be reused
- [ ] Cannot void invoice with payments (must delete payments first)
- [ ] Can un-void invoice back to issued or draft status
- [ ] Payment adds correctly with amount, date, method
- [ ] Invoice marks as paid when balance reaches zero
- [ ] Paid date set to latest payment date (not current date)
- [ ] Remaining balance calculated correctly from payments
- [ ] Payment date populates correctly in edit modal

### Invoice Unit Tests (ClientInvoiceTest)
Run with:
```bash
vendor/bin/phpunit tests/Feature/ClientManagement/ClientInvoiceTest.php
```

Tests include:
- [x] Can generate invoice for period
- [x] Cannot generate overlapping invoice
- [x] Can generate adjacent invoices
- [x] Voided invoice periods can be reused
- [x] Invoice can be voided
- [x] Invoice can be un-voided
- [x] Un-void validates target status
- [x] Mark paid uses provided date
- [x] Mark paid uses now when no date provided
- [x] Payment adds correctly
- [x] Remaining balance calculated correctly
- [x] Payments total accessor works
- [x] Invoice API requires admin
- [x] Invoice API void rejects invoice with payments
- [x] Invoice API un-void works
- [x] Regenerating invoice preserves manual line items
- [x] Regenerating invoice does not duplicate system line items

### Time Page Monthly Grouping
- [ ] Time entries grouped by month (most recent first)
- [ ] Opening balance shows retainer + rollover - expired
- [ ] Closing balance shows unused or excess hours
- [ ] Color coding correct (green positive, red negative)
- [ ] Month sections collapsible
- [ ] Skeleton loading state displays correctly

### Unit Tests (RolloverCalculator)
- [x] 25 tests passing (run `vendor/bin/phpunit tests/Unit/Services/ClientManagement/`)
- [x] Case A: Hours exceed retainer, rollover available
- [x] Case B: Hours exceed retainer + rollover
- [x] Case C: Hours under retainer, rollover accumulates
- [x] Case D: rollover_months=1 means no rollover

### Feature Tests (Delayed Billing)
- [x] Test invoice includes delayed billing entries from periods without agreement
- [x] Test preview shows delayed billing information
- [x] Test non-billable entries are not included in delayed billing
- [x] Test already-invoiced entries are not included in delayed billing
- [x] Test API endpoint shows unbilled hours for periods without agreement

Run delayed billing tests with:
```bash
vendor/bin/phpunit tests/Feature/ClientManagement/DelayedBillingTest.php
```
