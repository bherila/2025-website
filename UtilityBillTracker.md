# Utility Bill Tracker

## Overview

The Utility Bill Tracker is a tool for managing and tracking utility bills (electricity, gas, water, etc.). It allows users to create utility accounts and track bills associated with each account, including the ability to import bill data from PDF documents using AI extraction.

## Features

- **Utility Account Management**: Create and manage utility accounts (e.g., PECO Electric, Water Company)
- **Bill Tracking**: Track bills with start/end dates, due dates, amounts, and payment status
- **Electricity-Specific Fields**: For electricity accounts, track power consumption (kWh), generation fees, and delivery fees
- **PDF Import**: Import bill data from PDF documents using Google Gemini AI
- **Notes**: Add notes to both accounts and individual bills

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
| status | varchar(255) | 'Paid' or 'Unpaid' |
| notes | text | Optional bill notes |
| power_consumed_kwh | decimal(14,5) | Power consumed (Electricity only) |
| total_generation_fees | decimal(14,5) | Generation fees (Electricity only) |
| total_delivery_fees | decimal(14,5) | Delivery fees (Electricity only) |
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
| GET | /api/utility-bill-tracker/accounts | List all utility accounts |
| POST | /api/utility-bill-tracker/accounts | Create a new account |
| GET | /api/utility-bill-tracker/accounts/{id} | Get account details |
| PUT | /api/utility-bill-tracker/accounts/{id}/notes | Update account notes |
| DELETE | /api/utility-bill-tracker/accounts/{id} | Delete account (only if no bills) |
| GET | /api/utility-bill-tracker/accounts/{id}/bills | List bills for an account |
| POST | /api/utility-bill-tracker/accounts/{id}/bills | Create a new bill |
| GET | /api/utility-bill-tracker/accounts/{id}/bills/{billId} | Get bill details |
| PUT | /api/utility-bill-tracker/accounts/{id}/bills/{billId} | Update a bill |
| DELETE | /api/utility-bill-tracker/accounts/{id}/bills/{billId} | Delete a bill |
| POST | /api/utility-bill-tracker/accounts/{id}/bills/import-pdf | Import bill from PDF |

## File Structure

```
app/
  Http/
    Controllers/
      UtilityBillTracker/
        UtilityAccountController.php      # Web controller for views
        UtilityAccountApiController.php   # API for account CRUD
        UtilityBillApiController.php      # API for bill CRUD
        UtilityBillImportController.php   # PDF import with Gemini AI
  Models/
    UtilityBillTracker/
      UtilityAccount.php                  # Eloquent model for accounts
      UtilityBill.php                     # Eloquent model for bills

resources/
  js/
    components/
      utility-bill-tracker/
        UtilityAccountListPage.tsx        # Account list page component
        UtilityBillListPage.tsx           # Bill list page component
        CreateAccountModal.tsx            # Modal for creating accounts
        EditBillModal.tsx                 # Modal for creating/editing bills
        ImportBillModal.tsx               # Modal for PDF import
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
2. Upload a PDF utility bill document
3. The system will extract:
   - Bill period dates
   - Due date
   - Total cost
   - For electricity accounts: kWh consumed, generation fees, delivery fees

The import process may take 1-2 minutes depending on the PDF complexity.

## Security

- All API endpoints require authentication
- Users can only access their own utility accounts and bills
- The UtilityAccount model uses a global scope to filter by the authenticated user

## Usage

1. Navigate to **Tools > Utility Bill Tracker** in the navigation menu
2. Click **Add Account** to create a new utility account
3. Select the account type (Electricity or General)
4. Click on an account to view and manage its bills
5. Add bills manually or import from PDF
6. Track payment status and add notes as needed
