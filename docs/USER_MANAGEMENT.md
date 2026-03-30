# User Management

## Overview

The user management system handles authentication, authorization, and role-based access control for the application.

## User Roles

Users can have multiple roles stored as a comma-separated string in the `user_role` column. All role names are lowercase.

### Available Roles

- **admin**: Full administrative access to all features including user management and client management
- **user**: Standard user access to personal features (finance, payslips, etc.)

### Role Rules

1. Role names are always lowercase
2. Multiple roles are stored as comma-separated values (e.g., `"admin,user"`)
3. Role names cannot contain commas
4. User ID 1 always has the `admin` role (enforced at the application level)
5. Users without `user` or `admin` role cannot log in

## Authorization Gates

The following Laravel Gates are defined in `AppServiceProvider`:

- **Admin**: Checks if user has `admin` role or is user ID 1
- **ClientCompanyMember**: Checks if user is a member of a specific client company, or is an admin

## API Endpoints

### User Management (Admin Only)

All endpoints require `admin` role.

#### List Users
```
GET /api/admin/users
```
Returns all users with their roles and associated client companies.

#### Add Role to User
```
POST /api/admin/users/{id}/roles
Body: { "role": "admin" }
```
Adds a role to the specified user.

#### Remove Role from User
```
DELETE /api/admin/users/{id}/roles/{role}
```
Removes a role from the specified user.

#### Set User Password
```
POST /api/admin/users/{id}/password
Body: { "password": "new_password" }
```
Sets a new password for the specified user.

## Login Behavior

### Standard Login
Users authenticate with email and password. Upon successful authentication:
1. The system checks if the user has `user` or `admin` role
2. If no valid role, login is rejected with "Account is disabled" error
3. If valid, the `last_login_date` is updated

### Localhost Development Mode
When running on localhost, two developer-friendly features are available:
1. **Master Password**: You can log in as any user using the password `1234567890`.
2. **Dev Login Button**: A button appears that allows logging in as any user with a blank password.

This feature is **only available on localhost** for development/testing.

## Login Audit Log

All login attempts (successful and failed) are recorded in the `login_audit_log` table. The `ip_address` column is stored as **binary** (`VARBINARY(16)` in MySQL, `BLOB` in SQLite) for storage efficiency and to support both IPv4 (4 bytes) and IPv6 (16 bytes).

### IP address handling

Conversion between human-readable strings and binary is done entirely in PHP using `inet_pton()` / `inet_ntop()` via the `App\Casts\IpAddressCast` Eloquent cast applied to `LoginAuditLog::$casts`. This means:

- **Writing**: pass a normal IP string (e.g. `$request->ip()`); the cast converts it to binary automatically.
- **Reading / API responses**: the cast converts binary back to a human-readable string, so callers and the frontend always see a plain string like `"127.0.0.1"`.
- **Compatibility**: the same PHP-level conversion works on both MySQL/MariaDB and SQLite (test DB), avoiding any need to fork logic by database driver.

### Database migration (MySQL)

When applying the migration on MySQL, existing string IP addresses are converted in-place:

```sql
UPDATE login_audit_log
SET ip_address = IF(IS_IPV6(ip_address), INET6_ATON(ip_address), INET_ATON(ip_address))
WHERE ip_address IS NOT NULL;

ALTER TABLE login_audit_log MODIFY ip_address VARBINARY(16) NULL;
```

Run `php artisan migrate` on MySQL to apply this automatically.
```sql
users:
  - id: bigint (primary key)
  - name: string
  - email: string (unique)
  - password: string (hashed)
  - user_role: string (nullable, comma-separated roles)
  - last_login_date: timestamp (nullable)
  - gemini_api_key: string (nullable)
  - email_verified_at: timestamp (nullable)
  - remember_token: string (nullable)
  - created_at: timestamp
  - updated_at: timestamp
```

## UI Components

The user management interface is available at `/admin/users` and includes:

1. **User List**: Table showing all users with:
   - Name and email
   - Client companies (as tags)
   - Roles (as tags)
   - Last login date
   - Actions menu

2. **Actions Modal**: Per-user actions including:
   - Set password
   - Add role (dropdown of available roles not already assigned)
   - Remove role (X button on role tags)

## Security Considerations

1. Only admins can access user management
2. Localhost blank-password login only works when `APP_ENV=local` or `APP_URL` contains `localhost`
3. User ID 1 cannot have admin role removed
4. Passwords are always hashed using Laravel's built-in hashing
