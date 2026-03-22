# Utility Bill Tracker

## Overview

The Utility Bill Tracker is a tool for managing and tracking utility bills (electricity, gas, water, etc.). It allows users to create utility accounts and track bills associated with each account, including the ability to import bill data from PDF documents using AI extraction.

## Features

- **Utility Account Management**: Create and manage utility accounts (e.g., PECO Electric, Water Company)
- **Bill Tracking**: Track bills with start/end dates, due dates, amounts, taxes, fees, and payment status
- **Electricity-Specific Fields**: For electricity accounts, track power consumption (kWh), generation fees, and delivery fees
- **PDF Import**: Import bill data from PDF documents using Google Gemini AI with support for multiple file uploads
- **PDF Storage**: Store imported PDFs in S3 for future reference with download capability
- **Transaction Linking**: Link utility bills to finance account transactions for reconciliation
- **Quick Status Toggle**: Click on the status badge to quickly toggle between Paid/Unpaid
- **Notes**: Add notes to both accounts and individual bills
- **Total Amount Display**: View total bill amounts per account in the account list

## Account Types

### Electricity
Electricity accounts have additional fields for tracking:
- Power consumed (kWh)
- Total generation fees
- Total delivery fees

### General
General accounts track basic bill information without electricity-specific fields. Use this for water, gas, internet, or other utility types.

## Database Schema

### utility_account
| Column | Type | Description |
|--------|------|-------------|
| id | bigint | Primary key |
| user_id | bigint | Foreign key to users table |
| account_name | varchar(255) | Name of the utility account |
| account_type | varchar(255) | 'Electricity' or 'General' |
| notes | text | Optional account notes |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### utility_bill
| Column | Type | Description |
|--------|------|-------------|
| id | bigint | Primary key |
| utility_account_id | bigint | Foreign key to utility_account |
| bill_start_date | date | Billing period start date |
| bill_end_date | date | Billing period end date |
| due_date | date | Payment due date |
| total_cost | decimal(14,5) | Total bill amount |
| taxes | decimal(14,5) | Tax amount (nullable) |
| fees | decimal(14,5) | Fees amount (nullable) |
| status | varchar(255) | 'Paid' or 'Unpaid' |
| notes | text | Optional bill notes |
| power_consumed_kwh | decimal(14,5) | Power consumed (Electricity only) |
| total_generation_fees | decimal(14,5) | Generation fees (Electricity only) |
| total_delivery_fees | decimal(14,5) | Delivery fees (Electricity only) |
| t_id | bigint | Linked FinAccountLineItem t_id (nullable) |
| pdf_original_filename | varchar(255) | Original uploaded PDF filename |
| pdf_stored_filename | varchar(255) | Generated storage filename |
| pdf_s3_path | varchar(500) | Full S3 path to stored PDF |
| pdf_file_size_bytes | bigint | PDF file size in bytes |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

## Routes

### Web Routes
| Method | URL | Description |
|--------|-----|-------------|
| GET | /utility-bill-tracker | Utility account list page |
| GET | /utility-bill-tracker/{id}/bills | Bills list for a specific account |

### API Routes
| Method | URL | Description |
|--------|-----|-------------|
| GET | /api/utility-bill-tracker/accounts | List all utility accounts (with bill count and total amount) |
| POST | /api/utility-bill-tracker/accounts | Create a new account |
| GET | /api/utility-bill-tracker/accounts/{id} | Get account details |
| PUT | /api/utility-bill-tracker/accounts/{id}/notes | Update account notes |
| DELETE | /api/utility-bill-tracker/accounts/{id} | Delete account (only if no bills) |
| GET | /api/utility-bill-tracker/accounts/{id}/bills | List bills for an account |
| POST | /api/utility-bill-tracker/accounts/{id}/bills | Create a new bill |
| GET | /api/utility-bill-tracker/accounts/{id}/bills/{billId} | Get bill details |
| PUT | /api/utility-bill-tracker/accounts/{id}/bills/{billId} | Update a bill |
| POST | /api/utility-bill-tracker/accounts/{id}/bills/{billId}/toggle-status | Toggle Paid/Unpaid status |
| DELETE | /api/utility-bill-tracker/accounts/{id}/bills/{billId} | Delete a bill (also deletes PDF from S3) |
| GET | /api/utility-bill-tracker/accounts/{id}/bills/{billId}/download-pdf | Download attached PDF |
| DELETE | /api/utility-bill-tracker/accounts/{id}/bills/{billId}/pdf | Delete attached PDF only |
| POST | /api/utility-bill-tracker/accounts/{id}/bills/import-pdf | Import bill from PDF |
| GET | /api/utility-bill-tracker/accounts/{id}/bills/{billId}/linkable | Find linkable transactions |
| POST | /api/utility-bill-tracker/accounts/{id}/bills/{billId}/link | Link bill to transaction |
| POST | /api/utility-bill-tracker/accounts/{id}/bills/{billId}/unlink | Unlink bill from transaction |

## File Structure

```
app/
  Http/
    Controllers/
      UtilityBillTracker/
        UtilityAccountController.php      # Web controller for views
        UtilityAccountApiController.php   # API for account CRUD (with total amount sum)
        UtilityBillApiController.php      # API for bill CRUD, status toggle, PDF download/delete
        UtilityBillImportController.php   # PDF import with Gemini AI and S3 storage
        UtilityBillLinkingController.php  # Link bills to finance transactions
  Models/
    UtilityBillTracker/
      UtilityAccount.php                  # Eloquent model for accounts
      UtilityBill.php                     # Eloquent model for bills (with S3 deletion on delete)

resources/
  js/
    components/
      utility-bill-tracker/
        UtilityAccountListPage.tsx        # Account list page component (with total amount column)
        UtilityBillListPage.tsx           # Bill list page component (sorted by due date desc)
        CreateAccountModal.tsx            # Modal for creating accounts
        EditBillModal.tsx                 # Modal for creating/editing bills (with taxes/fees and PDF info)
        ImportBillModal.tsx               # Modal for multi-file PDF import with progress
        LinkBillModal.tsx                 # Modal for linking bills to transactions
        DeleteConfirmModal.tsx            # Confirmation modal for deletions
    types/
      utility-bill-tracker/
        index.ts                          # TypeScript interfaces
    utility-bill-tracker.tsx              # Vite entry point

  views/
    utility-bill-tracker/
      accounts.blade.php                  # Account list view
      bills.blade.php                     # Bill list view
```

## PDF Import

The PDF import feature uses Google Gemini AI to extract bill data from uploaded PDF documents. To use this feature:

1. Configure your Gemini API key in your account settings
2. Click "Import PDF" and select one or more PDF utility bill documents
3. The system will process each file sequentially with progress tracking
4. The system will extract:
   - Bill period dates
   - Due date
   - Total cost
   - Taxes and fees
   - For electricity accounts: kWh consumed, generation fees, delivery fees
5. Imported PDFs are stored in S3 and can be downloaded later

The import process may take 1-2 minutes per file depending on the PDF complexity.

### Multi-File Import
- Select multiple PDF files at once
- Files are processed one-by-one sequentially
- Progress bar shows overall completion
- Each file shows success/failure status
- Failed imports don't stop the remaining files

## Transaction Linking

Utility bills can be linked to finance account transactions for reconciliation:

1. Click the Link button (chain icon) on any bill
2. The system searches for transactions within 90 days of the due date with amounts within 10% of the total cost
3. Select a matching transaction to link
4. Linked bills show the transaction amount in the "Linked" column
5. Click the Link button again to unlink or change the linked transaction

## Security

- All API endpoints require authentication
- Users can only access their own utility accounts and bills
- The UtilityAccount model uses a global scope to filter by the authenticated user
- PDFs are stored in S3 with user-specific paths and accessed via temporary signed URLs
- Deleting a bill automatically deletes its associated PDF from S3

## Usage

1. Navigate to **Tools > Utility Bill Tracker** in the navigation menu
2. Click **Add Account** to create a new utility account
3. Select the account type (Electricity or General)
4. Click on an account to view and manage its bills
5. Add bills manually or import from PDF (supports multiple files)
6. Click on the status badge to quickly toggle Paid/Unpaid
7. Use the Link button to connect bills to finance transactions
8. Download attached PDFs using the download button
9. Track taxes, fees, and add notes as needed
