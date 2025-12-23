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
- Time tracking interface
- List of time entries
- New Time Entry button
- Uses shadcn/ui Card, Button, Table components

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

### Planned Additions
- **Billing**: Generate invoices based on time logs and hourly rates
- **Expense Tracking**: Track project-related expenses
- **Reporting**: Revenue per client, project profitability, time utilization, etc.
- **File Attachments**: Upload files to projects and tasks
- **Comments**: Add comments to tasks and time entries

### Extensibility Considerations
- Models and controllers organized in `ClientManagement` subdirectories
- Pivot table ready for additional metadata (e.g., role, permissions)
- `default_hourly_rate` field prepared for billing system
- `last_activity` tracks engagement for retention analysis
- Soft deletes preserve historical data for reporting

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
