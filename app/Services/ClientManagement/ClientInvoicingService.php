<?php

namespace App\Services\ClientManagement;

use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientExpense;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoiceLine;
use App\Models\ClientManagement\ClientTimeEntry;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Service for generating client invoices with rollover hour logic.
 *
 * Invoice Structure (for month M):
 * 1. Prior-month time entries included in retainer (dated last day of M-1, $0)
 * 2. Additional work beyond retainer fee (dated last day of M-1, charged at hourly rate)
 * 3. Billable work from prior month with no retainer (dated last day of M-1, charged at hourly rate)
 * 4. Monthly retainer fee for month M (dated first day of M)
 * 5. Reimbursable expenses (dated per expense date)
 *
 * Rules:
 * - Invoice date is always the date the invoice is generated
 * - Retainer fee line item is always dated as the first day of month M
 * - Prior-month work is dated as the last day of month M-1
 * - Hourly rate is determined by the active agreement for month M
 * - Time entry subitems display their original dates
 */
class ClientInvoicingService
{
    protected RolloverCalculator $rolloverCalculator;

    public function __construct(?RolloverCalculator $rolloverCalculator = null)
    {
        $this->rolloverCalculator = $rolloverCalculator ?? new RolloverCalculator;
    }

    /**
     * Generate invoices for all calendar months from agreement start to now.
     *
     * @param  ClientCompany  $company  The client company
     * @return array Summary of generated/updated/skipped invoices
     *
     * @throws \Exception If no active agreement found
     */
    public function generateAllMonthlyInvoices(ClientCompany $company): array
    {
        $agreement = $company->activeAgreement();
        if (! $agreement) {
            throw new \Exception('No active agreement found for this client company.');
        }

        $generated = [];
        $updated = [];
        $skipped = [];

        // Start from the agreement's active date
        $currentDate = Carbon::parse($agreement->active_date)->startOfMonth();
        $endDate = $agreement->termination_date
            ? Carbon::parse($agreement->termination_date)
            : now();

        // Generate invoices for each calendar month
        while ($currentDate->lte($endDate)) {
            $periodStart = $currentDate->copy()->startOfMonth();
            $periodEnd = $currentDate->copy()->endOfMonth();

            // Check if invoice already exists for this period
            $existingInvoice = ClientInvoice::where('client_company_id', $company->id)
                ->where('period_start', $periodStart)
                ->where('period_end', $periodEnd)
                ->first();

            if ($existingInvoice) {
                // Skip if invoice is issued, paid, or voided
                if (in_array($existingInvoice->status, ['issued', 'paid', 'void'])) {
                    $skipped[] = [
                        'period' => $periodStart->format('Y-m'),
                        'invoice_id' => $existingInvoice->client_invoice_id,
                        'status' => $existingInvoice->status,
                        'reason' => 'Invoice already exists with status: '.$existingInvoice->status,
                    ];
                } else {
                    // Re-generate if draft
                    try {
                        $invoice = $this->generateInvoice($company, $periodStart, $periodEnd, $agreement);
                        $updated[] = [
                            'period' => $periodStart->format('Y-m'),
                            'invoice_id' => $invoice->client_invoice_id,
                            'invoice_number' => $invoice->invoice_number,
                        ];
                    } catch (\Exception $e) {
                        $skipped[] = [
                            'period' => $periodStart->format('Y-m'),
                            'error' => $e->getMessage(),
                        ];
                    }
                }
            } else {
                // Generate new invoice
                try {
                    $invoice = $this->generateInvoice($company, $periodStart, $periodEnd, $agreement);
                    $generated[] = [
                        'period' => $periodStart->format('Y-m'),
                        'invoice_id' => $invoice->client_invoice_id,
                        'invoice_number' => $invoice->invoice_number,
                    ];
                } catch (\Exception $e) {
                    $skipped[] = [
                        'period' => $periodStart->format('Y-m'),
                        'error' => $e->getMessage(),
                    ];
                }
            }

            // Move to next month
            $currentDate->addMonth();
        }

        return [
            'generated' => $generated,
            'updated' => $updated,
            'skipped' => $skipped,
            'summary' => [
                'generated_count' => count($generated),
                'updated_count' => count($updated),
                'skipped_count' => count($skipped),
            ],
        ];
    }

    /**
     * Generate an invoice for a specific billing period.
     *
     * @param  ClientCompany  $company  The client company
     * @param  Carbon  $periodStart  Start of billing period (first day of month M)
     * @param  Carbon  $periodEnd  End of billing period (last day of month M)
     * @param  ClientAgreement|null  $agreement  The agreement to use (defaults to active agreement)
     * @return ClientInvoice The generated invoice
     *
     * @throws \Exception If no active agreement or validation fails
     */
    public function generateInvoice(
        ClientCompany $company,
        Carbon $periodStart,
        Carbon $periodEnd,
        ?ClientAgreement $agreement = null
    ): ClientInvoice {
        // Get the active agreement if not provided
        if (! $agreement) {
            $agreement = $company->activeAgreement();
            if (! $agreement) {
                throw new \Exception('No active agreement found for this client company.');
            }
        }

        // Check for an existing invoice for this exact period
        $invoice = ClientInvoice::where('client_company_id', $company->id)
            ->where('client_agreement_id', $agreement->id)
            ->where('period_start', $periodStart)
            ->where('period_end', $periodEnd)
            ->whereNotIn('status', ['void'])
            ->first();

        // If invoice exists and is already issued, it cannot be changed.
        if ($invoice && $invoice->isIssued()) {
            throw new \Exception("An issued invoice (#{$invoice->invoice_number}) already exists for this period and cannot be modified.");
        }

        // Check for overlapping periods with other invoices for the same company
        $overlappingInvoice = ClientInvoice::where('client_company_id', $company->id)
            ->whereNotIn('status', ['void'])
            ->where(function ($query) use ($periodStart, $periodEnd) {
                $query->where('period_start', '<', $periodEnd)
                    ->where('period_end', '>', $periodStart);
            })
            ->when($invoice, function ($query) use ($invoice) {
                $query->where('client_invoice_id', '!=', $invoice->client_invoice_id);
            })
            ->first();

        if ($overlappingInvoice) {
            throw new \Exception(
                "An invoice (#{$overlappingInvoice->invoice_number}) already exists for an overlapping period ".
                "({$overlappingInvoice->period_start->format('M d, Y')} - {$overlappingInvoice->period_end->format('M d, Y')}). ".
                'Please choose a different date range or void the existing invoice first.'
            );
        }

        return DB::transaction(function () use ($company, $agreement, $periodStart, $periodEnd, $invoice) {
            // Calculate prior month boundaries (M-1)
            $priorMonthEnd = $periodStart->copy()->subDay(); // Last day of M-1
            $priorMonthStart = $priorMonthEnd->copy()->startOfMonth(); // First day of M-1

            // Get the previous invoice to carry forward any balances
            $previousInvoice = ClientInvoice::where('client_company_id', $company->id)
                ->where('client_agreement_id', $agreement->id)
                ->whereNotIn('status', ['void'])
                ->where('period_end', '<', $periodStart)
                ->orderBy('period_end', 'desc')
                ->first();

            // Calculate rollover hours available (from previous months within rollover window)
            $rolloverHoursAvailable = $this->calculateRolloverHours($agreement, $periodStart, $previousInvoice);

            // Get unbilled time entries from the prior month (M-1)
            $priorMonthEntries = ClientTimeEntry::where('client_company_id', $company->id)
                ->whereNull('client_invoice_line_id')
                ->where('is_billable', true)
                ->whereBetween('date_worked', [$priorMonthStart, $priorMonthEnd])
                ->orderBy('date_worked')
                ->get();

            $priorMonthMinutes = $priorMonthEntries->sum('minutes_worked');
            $priorMonthHours = $priorMonthMinutes / 60;

            // Determine if prior month had a retainer - check if agreement was active in prior month
            $priorMonthHadRetainer = $agreement->active_date <= $priorMonthEnd && 
                ($agreement->termination_date === null || $agreement->termination_date >= $priorMonthStart);

            // Get negative balance from previous invoice
            $negativeBalanceFromPrevious = $previousInvoice ? (float) $previousInvoice->negative_hours_balance : 0;

            // Calculate hour balances
            $retainerHours = (float) $agreement->monthly_retainer_hours;
            $hourlyRate = (float) $agreement->hourly_rate;

            // Calculate how prior month hours are handled
            $priorMonthCoveredByRetainer = 0;
            $priorMonthOverage = 0;
            $priorMonthBillableNoRetainer = 0;

            if ($priorMonthHadRetainer && $priorMonthHours > 0) {
                // Prior month had retainer - calculate coverage
                $availableForPriorMonth = $retainerHours + $rolloverHoursAvailable - $negativeBalanceFromPrevious;
                $priorMonthCoveredByRetainer = min($priorMonthHours, max(0, $availableForPriorMonth));
                $priorMonthOverage = max(0, $priorMonthHours - $priorMonthCoveredByRetainer);
            } elseif ($priorMonthHours > 0) {
                // Prior month had no retainer - all hours are billable
                $priorMonthBillableNoRetainer = $priorMonthHours;
            }

            // Calculate closing balances
            $totalHoursUsed = $priorMonthCoveredByRetainer;
            $rolloverUsed = max(0, min($rolloverHoursAvailable, max(0, $totalHoursUsed - $retainerHours + $negativeBalanceFromPrevious)));
            $unusedHoursBalance = max(0, $retainerHours + $rolloverHoursAvailable - $negativeBalanceFromPrevious - $totalHoursUsed);
            $hoursBilledAtRate = $priorMonthOverage + $priorMonthBillableNoRetainer;

            // Prepare invoice data
            $invoiceData = [
                'client_company_id' => $company->id,
                'client_agreement_id' => $agreement->id,
                'period_start' => $periodStart,
                'period_end' => $periodEnd,
                'retainer_hours_included' => $retainerHours,
                'hours_worked' => $priorMonthHours,
                'rollover_hours_used' => $rolloverUsed,
                'unused_hours_balance' => $unusedHoursBalance,
                'negative_hours_balance' => 0, // New logic doesn't use negative balance
                'hours_billed_at_rate' => $hoursBilledAtRate,
                'status' => 'draft',
            ];

            if ($invoice) {
                // Update existing draft invoice
                $invoice->update($invoiceData);

                // Delete system-generated line items (preserve manual items)
                $systemGeneratedTypes = ['retainer', 'additional_hours', 'credit', 'prior_month_retainer', 'prior_month_billable'];

                $systemLines = $invoice->lineItems()
                    ->whereIn('line_type', $systemGeneratedTypes)
                    ->get();

                foreach ($systemLines as $line) {
                    $line->timeEntries()->update(['client_invoice_line_id' => null]);
                    $line->expenses()->update(['client_invoice_line_id' => null]);
                }

                $invoice->lineItems()
                    ->whereIn('line_type', $systemGeneratedTypes)
                    ->delete();
                
                // Also unlink expenses that were linked to expense-type lines for this invoice
                $expenseLines = $invoice->lineItems()->where('line_type', 'expense')->get();
                foreach ($expenseLines as $line) {
                    $line->expenses()->update(['client_invoice_line_id' => null]);
                }
                $invoice->lineItems()->where('line_type', 'expense')->delete();
            } else {
                // Create a new invoice
                $invoiceData['invoice_number'] = $this->generateInvoiceNumber($company, $agreement);
                $invoiceData['invoice_total'] = 0;
                $invoice = ClientInvoice::create($invoiceData);
            }

            $sortOrder = 1;

            // Line 1: Prior-month time entries included in retainer ($0)
            if ($priorMonthCoveredByRetainer > 0) {
                $coveredEntries = $this->selectEntriesUpToHours($priorMonthEntries, $priorMonthCoveredByRetainer);
                
                $priorRetainerLine = ClientInvoiceLine::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'client_agreement_id' => $agreement->id,
                    'description' => 'Work items included in prior month retainer',
                    'quantity' => $this->formatHoursForQuantity($priorMonthCoveredByRetainer),
                    'unit_price' => 0,
                    'line_total' => 0,
                    'line_type' => 'prior_month_retainer',
                    'hours' => $priorMonthCoveredByRetainer,
                    'line_date' => $priorMonthEnd,
                    'sort_order' => $sortOrder++,
                ]);

                $this->linkTimeEntriesToLine($coveredEntries, $priorRetainerLine);
            }

            // Line 2: Additional work beyond retainer fee (overage from prior month)
            if ($priorMonthOverage > 0) {
                $overageEntries = $priorMonthEntries->filter(fn($e) => $e->client_invoice_line_id === null);
                
                $overageLine = ClientInvoiceLine::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'client_agreement_id' => $agreement->id,
                    'description' => 'Additional work beyond retainer fee',
                    'quantity' => $this->formatHoursForQuantity($priorMonthOverage),
                    'unit_price' => $hourlyRate,
                    'line_total' => $priorMonthOverage * $hourlyRate,
                    'line_type' => 'additional_hours',
                    'hours' => $priorMonthOverage,
                    'line_date' => $priorMonthEnd,
                    'sort_order' => $sortOrder++,
                ]);

                $this->linkAllEntriesToLine($overageEntries, $overageLine);
            }

            // Line 3: Billable work from prior month (no retainer in that month)
            if ($priorMonthBillableNoRetainer > 0) {
                $billableLine = ClientInvoiceLine::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'client_agreement_id' => $agreement->id,
                    'description' => 'Billable work from prior month',
                    'quantity' => $this->formatHoursForQuantity($priorMonthBillableNoRetainer),
                    'unit_price' => $hourlyRate,
                    'line_total' => $priorMonthBillableNoRetainer * $hourlyRate,
                    'line_type' => 'prior_month_billable',
                    'hours' => $priorMonthBillableNoRetainer,
                    'line_date' => $priorMonthEnd,
                    'sort_order' => $sortOrder++,
                ]);

                $this->linkAllEntriesToLine($priorMonthEntries, $billableLine);
            }

            // Line 4: Monthly retainer fee for month M (dated first day of M)
            ClientInvoiceLine::create([
                'client_invoice_id' => $invoice->client_invoice_id,
                'client_agreement_id' => $agreement->id,
                'description' => "Monthly Retainer ({$agreement->monthly_retainer_hours} hours) - " . $periodStart->format('M j, Y'),
                'quantity' => '1',
                'unit_price' => $agreement->monthly_retainer_fee,
                'line_total' => $agreement->monthly_retainer_fee,
                'line_type' => 'retainer',
                'hours' => $retainerHours,
                'line_date' => $periodStart,
                'sort_order' => $sortOrder++,
            ]);

            // Line 5: Rollover hours applied (informational, $0)
            if ($rolloverUsed > 0) {
                ClientInvoiceLine::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'client_agreement_id' => $agreement->id,
                    'description' => 'Rollover Hours Applied (from previous months)',
                    'quantity' => $this->formatHoursForQuantity($rolloverUsed),
                    'unit_price' => 0,
                    'line_total' => 0,
                    'line_type' => 'credit',
                    'hours' => $rolloverUsed,
                    'line_date' => $periodStart,
                    'sort_order' => $sortOrder++,
                ]);
            }

            // Line 6+: Reimbursable expenses (dated per expense date)
            $this->addReimbursableExpenses($company, $invoice, $periodEnd, $sortOrder);

            // Calculate and update total
            $invoice->recalculateTotal();

            // Update period_start and period_end based on actual line item dates
            $this->updateInvoicePeriodFromLineItems($invoice);

            return $invoice->fresh(['lineItems']);
        });
    }

    /**
     * Add reimbursable expenses to the invoice.
     */
    protected function addReimbursableExpenses(
        ClientCompany $company,
        ClientInvoice $invoice,
        Carbon $invoiceDate,
        int &$sortOrder
    ): void {
        // Get all un-invoiced reimbursable expenses up to and including the invoice date
        $expenses = ClientExpense::where('client_company_id', $company->id)
            ->where('is_reimbursable', true)
            ->whereNull('client_invoice_line_id')
            ->where('expense_date', '<=', $invoiceDate)
            ->orderBy('expense_date')
            ->get();

        foreach ($expenses as $expense) {
            $line = ClientInvoiceLine::create([
                'client_invoice_id' => $invoice->client_invoice_id,
                'client_agreement_id' => $invoice->client_agreement_id,
                'description' => $expense->description,
                'quantity' => 1,
                'unit_price' => $expense->amount,
                'line_total' => $expense->amount,
                'line_type' => 'expense',
                'hours' => null,
                'line_date' => $expense->expense_date,
                'sort_order' => $sortOrder++,
            ]);

            // Link expense to invoice line
            $expense->update(['client_invoice_line_id' => $line->client_invoice_line_id]);
        }
    }

    /**
     * Select time entries up to the specified hours limit.
     */
    protected function selectEntriesUpToHours($entries, float $hoursLimit): \Illuminate\Support\Collection
    {
        $minutesLimit = (int) round($hoursLimit * 60);
        $minutesSelected = 0;
        $selectedEntries = collect();

        foreach ($entries as $entry) {
            if ($entry->client_invoice_line_id !== null) {
                continue;
            }

            if ($minutesSelected >= $minutesLimit) {
                break;
            }

            $remainingNeeded = $minutesLimit - $minutesSelected;

            if ($entry->minutes_worked <= $remainingNeeded) {
                $selectedEntries->push($entry);
                $minutesSelected += $entry->minutes_worked;
            } else {
                // Partial entry - split it
                $overageMinutes = $entry->minutes_worked - $remainingNeeded;

                // Create a new entry for the overage
                $rolledOverEntry = $entry->replicate();
                $rolledOverEntry->minutes_worked = $overageMinutes;
                $rolledOverEntry->client_invoice_line_id = null;
                $rolledOverEntry->save();

                // Update original entry to the billed portion
                $entry->minutes_worked = $remainingNeeded;
                $entry->save();

                $selectedEntries->push($entry);
                $minutesSelected += $remainingNeeded;
            }
        }

        return $selectedEntries;
    }

    /**
     * Link all provided time entries to an invoice line.
     */
    protected function linkAllEntriesToLine($entries, ClientInvoiceLine $line): void
    {
        foreach ($entries as $entry) {
            if ($entry->client_invoice_line_id === null) {
                $entry->update(['client_invoice_line_id' => $line->client_invoice_line_id]);
            }
        }
    }

    /**
     * Link time entries to an invoice line.
     */
    protected function linkTimeEntriesToLine($entries, ClientInvoiceLine $line): void
    {
        foreach ($entries as $entry) {
            $entry->update(['client_invoice_line_id' => $line->client_invoice_line_id]);
        }
    }

    /**
     * Update invoice period_start and period_end based on actual line item dates.
     * Expands the period to include the full range from earliest to latest line_date,
     * but never contracts it smaller than the original billing period.
     */
    protected function updateInvoicePeriodFromLineItems(ClientInvoice $invoice): void
    {
        $lineItems = $invoice->lineItems()->whereNotNull('line_date')->get();

        if ($lineItems->isEmpty()) {
            return;
        }

        $earliestLineDate = $lineItems->min('line_date');
        $latestLineDate = $lineItems->max('line_date');

        // Expand period to include line item dates, but don't contract
        $newPeriodStart = min($invoice->period_start, $earliestLineDate);
        $newPeriodEnd = max($invoice->period_end, $latestLineDate);

        $invoice->update([
            'period_start' => $newPeriodStart,
            'period_end' => $newPeriodEnd,
        ]);
    }

    /**
     * Format hours as h:mm string for invoice line quantity display.
     * 
     * @param float $hours Decimal hours (e.g., 1.5)
     * @return string Formatted as "h:mm" (e.g., "1:30")
     */
    protected function formatHoursForQuantity(float $hours): string
    {
        $totalMinutes = (int) round($hours * 60);
        $h = intdiv($totalMinutes, 60);
        $m = $totalMinutes % 60;
        
        return sprintf('%d:%02d', $h, $m);
    }

    /**
     * Calculate rollover hours available from previous invoices within the rollover window.
     */
    protected function calculateRolloverHours(
        ClientAgreement $agreement,
        Carbon $periodStart,
        ?ClientInvoice $previousInvoice
    ): float {
        if ((int) $agreement->rollover_months === 0) {
            return 0;
        }

        // Find invoices within the rollover window
        $rolloverWindowStart = $periodStart->copy()->subMonths((int) $agreement->rollover_months);

        // Sum up unused hours from invoices in the rollover window
        $rolloverHours = ClientInvoice::where('client_agreement_id', $agreement->id)
            ->whereNotIn('status', ['void'])
            ->where('period_start', '>=', $rolloverWindowStart)
            ->where('period_end', '<', $periodStart)
            ->sum('unused_hours_balance');

        return (float) $rolloverHours;
    }

    /**
     * Generate a unique invoice number.
     */
    protected function generateInvoiceNumber(ClientCompany $company, ClientAgreement $agreement): string
    {
        $rawPrefix = strtoupper(substr(preg_replace('/[^a-zA-Z0-9]/', '', $company->company_name), 0, 4));
        $prefix = $rawPrefix ? $rawPrefix . '-' : '';
        $yearMonth = now()->format('Ym');

        $lastInvoice = ClientInvoice::where('client_company_id', $company->id)
            ->where('invoice_number', 'like', "{$rawPrefix}%{$yearMonth}-%")
            ->orderBy('invoice_number', 'desc')
            ->first();

        if ($lastInvoice) {
            $lastSeq = (int) substr($lastInvoice->invoice_number, -3);
            $seq = $lastSeq + 1;
        } else {
            $seq = 1;
        }

        return sprintf('%s%s-%03d', $prefix, $yearMonth, $seq);
    }

    /**
     * Get invoicing history for a client company.
     */
    public function getInvoiceHistory(ClientCompany $company): array
    {
        $invoices = ClientInvoice::where('client_company_id', $company->id)
            ->with(['agreement', 'lineItems'])
            ->orderBy('period_start', 'desc')
            ->get();

        return $invoices->map(function ($invoice) {
            return [
                'id' => $invoice->client_invoice_id,
                'invoice_number' => $invoice->invoice_number,
                'period_start' => $invoice->period_start->toDateString(),
                'period_end' => $invoice->period_end->toDateString(),
                'invoice_total' => $invoice->invoice_total,
                'status' => $invoice->status,
                'issue_date' => $invoice->issue_date?->toDateString(),
                'paid_date' => $invoice->paid_date?->toDateString(),
                'hours_worked' => $invoice->hours_worked,
                'retainer_hours_included' => $invoice->retainer_hours_included,
                'unused_hours_balance' => $invoice->unused_hours_balance,
                'hours_billed_at_rate' => $invoice->hours_billed_at_rate,
            ];
        })->toArray();
    }
}
