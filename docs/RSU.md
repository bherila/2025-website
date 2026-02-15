# RSU Management System

## Overview
The RSU (Restricted Stock Unit) management system allows users to track equity awards, vesting schedules, and stock valuations across multiple grants.

## Features

### View Awards
- **Route**: `/finance/rsu`
- **Description**: View all RSU awards with detailed vesting information
- **Capabilities**:
  - Chart visualization (shares or value over time)
  - Three view modes:
    - **All vests**: Comprehensive list of all vesting events
    - **Per vest date**: Aggregated by vest dates
    - **Per award**: Aggregated by award ID
  - Track grant prices, vest prices, and total values
  - Distinguish between vested and unvested shares

### Manage Awards
- **Route**: `/finance/rsu/manage`
- **Description**: Full CRUD interface for RSU awards
- **Capabilities**:
  - View awards in a sortable table
  - Add new awards with detailed information
  - Edit existing awards
  - Delete awards
  - Modal-based editing interface

### Add Award (Bulk Import)
- **Route**: `/finance/rsu/add-grant`
- **Description**: Bulk import awards from clipboard
- **Capabilities**:
  - Paste vest schedules in "date shares" format
  - Preview imports before saving
  - Automatic date format conversion (m/d/y → yyyy-mm-dd)
  - Duplicate detection (based on grant_date + award_id + vest_date + symbol)

## Data Model

### Database Schema
Table: `fin_equity_awards`

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint(20) AUTO_INCREMENT | Primary key |
| `award_id` | char(20) | Award identifier (e.g., grant number) |
| `grant_date` | char(10) | Date award was granted (YYYY-MM-DD) |
| `vest_date` | char(10) | Date shares vest (YYYY-MM-DD) |
| `share_count` | int(11) | Number of shares vesting |
| `symbol` | char(4) | Stock ticker symbol |
| `uid` | varchar(50) | User ID (owner) |
| `vest_price` | decimal(10,2) | Price per share at vest date (optional) |
| `grant_price` | decimal(10,2) | Price per share at grant date (optional) |

**Unique Constraint**: (`grant_date`, `award_id`, `vest_date`, `symbol`)

### TypeScript Interface
```typescript
export interface IAward {
  id?: number
  award_id?: string
  grant_date?: string
  vest_date?: string
  share_count?: currency | number
  symbol?: string
  vest_price?: number // price per share at vest date
  grant_price?: number // price per share at grant date
}
```

## API Endpoints

### GET /api/rsu
Retrieve all RSU awards for the authenticated user.

**Response**: Array of `IAward` objects

**Example**:
```json
[
  {
    "id": 1,
    "award_id": "12345",
    "grant_date": "2024-01-01",
    "vest_date": "2025-01-01",
    "share_count": 100,
    "symbol": "META",
    "vest_price": 450.00,
    "grant_price": 350.00,
    "uid": "user123"
  }
]
```

### POST /api/rsu
Create or update RSU awards (upsert operation).

**Request Body**: Array of `IAward` objects

**Behavior**:
- If `id` is provided: Updates the existing record (user ownership verified)
- If `id` is not provided: Uses `updateOrInsert` with unique key (grant_date, award_id, vest_date, symbol)

**Example**:
```json
[
  {
    "id": 1,
    "award_id": "12345",
    "grant_date": "2024-01-01",
    "vest_date": "2025-01-01",
    "share_count": 150,
    "symbol": "META"
  },
  {
    "award_id": "67890",
    "grant_date": "2024-06-01",
    "vest_date": "2025-06-01",
    "share_count": 100,
    "symbol": "GOOG"
  }
]
```

### DELETE /api/rsu/{id}
Delete a specific RSU award.

**Parameters**:
- `id` (path): Award ID to delete

**Authorization**: User can only delete their own awards

**Response**:
```json
{
  "status": "success"
}
```

## Component Architecture

### Main Components

#### RsuPage
- **Path**: `resources/js/components/rsu/RsuPage.tsx`
- **Purpose**: Main dashboard view for RSU data
- **Features**: Charts, multiple view modes, data tables

#### ManageAwardsPage
- **Path**: `resources/js/components/rsu/ManageAwardsPage.tsx`
- **Purpose**: CRUD interface for managing awards
- **Features**: Table view, add/edit/delete modals

#### AddGrantPage
- **Path**: `resources/js/components/rsu/AddGrantPage.tsx`
- **Purpose**: Bulk import interface
- **Features**: Clipboard parsing, preview, batch insert

#### RsuSubNav
- **Path**: `resources/js/components/rsu/RsuSubNav.tsx`
- **Purpose**: Navigation header for RSU section
- **Features**: Styled buttons with icons, active state highlighting

### Supporting Components
- `RsuChart`: Visualization component
- `RsuByAward`: Award-grouped view
- `RsuByVestDate`: Vest date-grouped view

## Usage Examples

### Adding a New Grant
1. Navigate to "Add an award" (/finance/rsu/add-grant)
2. Fill in award details (Award ID, Symbol, Grant Date)
3. Paste vest schedule in format: `YYYY-MM-DD [shares]` (one per line)
4. Preview the import table
5. Click "Import grants & vests"

### Editing an Award
1. Navigate to "Manage awards" (/finance/rsu/manage)
2. Click the pencil icon next to the award
3. Update fields in the modal
4. Click "Save"

### View Award Analytics
1. Navigate to "View awards" (/finance/rsu)
2. Switch between chart modes (Share count vs Value)
3. Switch between table views (All vests, Per vest date, Per award)

## Security

- All routes protected with `auth` middleware
- User isolation: Users can only view/edit/delete their own awards
- Database constraints ensure data integrity
- CSRF protection on all mutations

## Testing

### PHP Tests
No specific RSU tests exist yet. Consider adding:
- Controller tests for CRUD operations
- Authorization tests (user isolation)
- Validation tests

### TypeScript Tests
No specific RSU tests exist yet. Consider adding:
- Component rendering tests
- Form validation tests
- API integration tests

## Future Enhancements

Potential improvements:
- Tax calculation support
- Stock price auto-fetch integration
- Sale tracking (realized gains)
- Export to CSV/PDF
- Multi-company support
- Vesting notifications
- What-if scenarios (projected value)
