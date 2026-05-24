# RSU Management System

## Overview
The RSU (Restricted Stock Unit) management system allows users to track equity awards, vesting schedules, and stock valuations across multiple grants.

## Features

### View Awards
- **Route**: `/finance/rsu`
- **Description**: View all RSU awards with detailed vesting information
- **Capabilities**:
  - Stacked bar chart (shares or value over time) with formatted axes and a custom tooltip that sorts grants by size and shows a total
  - Three view modes (top-left tabs):
    - **All vests**: Comprehensive list of all vesting events
    - **Per vest date**: Aggregated by vest dates
    - **Per award**: Aggregated by award ID
  - **"Only show unvested" toggle** (top-right switch): filters the table to future vests only; persists across the three view modes. Per-award view hides awards that have fully vested. The chart is intentionally not filtered so historical context remains visible.
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
  - Import grant letters or vest-confirmation PDFs through the shared GenAI queue

### Add Award (Bulk Import)
- **Route**: `/finance/rsu/add-grant`
- **Description**: Bulk import awards from clipboard
- **Capabilities**:
  - Paste vest schedules in "date shares" format
  - Preview imports before saving
  - Automatic date format conversion (m/d/y → yyyy-mm-dd)
  - Duplicate detection (based on grant_date + award_id + vest_date + symbol)

### GenAI PDF Import
- **Route**: `/finance/rsu/manage`
- **Job type**: `equity_award`
- **Description**: Upload RSU grant letters or vest-confirmation PDFs, parse them asynchronously, and review one editable result per vest tranche.
- **Capabilities**:
  - Direct-to-S3 PDF upload through the shared GenAI import endpoints
  - Optional default stock symbol for documents that omit a ticker
  - Per-tranche confirm or skip actions
  - Non-destructive vest back-fill: a vest confirmation can update an existing row's `vest_price` without erasing an existing `grant_price`
  - Duplicate protection through file-hash job de-duplication plus the user-scoped award unique key

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

**Unique Constraint**: (`uid`, `grant_date`, `award_id`, `vest_date`, `symbol`)

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
- If `id` is not provided: Uses `updateOrInsert` with unique key (uid, grant_date, award_id, vest_date, symbol)

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

### POST /api/rsu/genai-import/{jobId}/results/{resultId}/confirm
Confirm a reviewed GenAI result and upsert it into `fin_equity_awards`.

**Request Body**: One `IAward`-shaped object without `id`.

**Behavior**:
- Validates the job belongs to the authenticated user and has `job_type=equity_award`
- Validates one reviewed vest tranche (`award_id`, dates, whole-share count, max-4 ticker, optional prices)
- Upserts by (`uid`, `grant_date`, `award_id`, `vest_date`, `symbol`)
- Applies optional prices only when present, so null imported prices do not erase existing price data
- Marks the result imported and marks the job imported when no pending review rows remain

### POST /api/rsu/genai-import/{jobId}/results/{resultId}/skip
Skip a reviewed GenAI result without creating or updating an award row.

## Component Architecture

### Main Components

#### RsuPage
- **Path**: `resources/js/components/rsu/RsuPage.tsx`
- **Purpose**: Main dashboard view for RSU data
- **Features**: Charts, multiple view modes, data tables

#### ManageAwardsPage
- **Path**: `resources/js/components/rsu/ManageAwardsPage.tsx`
- **Purpose**: CRUD interface for managing awards
- **Features**: Table view, add/edit/delete modals, GenAI PDF import modal

#### RsuImportModal / RsuImportJobCard
- **Path**: `resources/js/components/rsu/RsuImportModal.tsx`, `resources/js/components/rsu/RsuImportJobCard.tsx`
- **Purpose**: Async PDF upload, polling, and per-tranche review for `equity_award` jobs
- **Features**: PDF validation, optional default symbol context, retry, confirm, skip

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
- `RsuByAward`: Award-grouped view (accepts `hideFullyVested` to drop awards with no unvested shares)
- `RsuByVestDate`: Vest date-grouped view
- `helpers.ts`: Shared utilities — `todayIso()`, `isVested()`, `getShares()`, `shareValue()` — used across all RSU components to keep the vested predicate and `share_count` (currency-or-number) normalization in one place

## Security

- All routes protected with `auth` middleware
- User isolation: Users can only view/edit/delete their own awards
- GenAI confirm/skip endpoints require the job to belong to the authenticated user
- Database constraints ensure data integrity
- CSRF protection on all mutations
