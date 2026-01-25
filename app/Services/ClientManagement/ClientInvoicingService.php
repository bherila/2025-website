<?php

namespace App\Services\ClientManagement;

use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoiceLine;
use App\Models\ClientManagement\ClientTimeEntry;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Service for generating client invoices with rollover hour logic.
 *
 * Per agreement terms:
 * - Each month includes a set number of retainer hours
 * - Unused hours can roll over for N months (rollover_months from agreement)
 * - If client goes over in a month, rollover hours are used first (FIFO)
 * - If still over after using rollover, excess is billed at hourly rate
 * - If client was previously negative, new month's hours offset the negative first
 *
 * Uses RolloverCalculator for all rollover logic calculations.
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
     * @param  Carbon  $periodStart  Start of billing period
     * @param  Carbon  $periodEnd  End of billing period
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
        // (excluding the current invoice if updating a draft, and excluding voided invoices)
        $overlappingInvoice = ClientInvoice::where('client_company_id', $company->id)
            ->whereNotIn('status', ['void'])
            ->where(function ($query) use ($periodStart, $periodEnd) {
                // Overlap exists if: existing.start < new.end AND existing.end > new.start
                $query->where('period_start', '<', $periodEnd)
                    ->where('period_end', '>', $periodStart);
            })
            ->when($invoice, function ($query) use ($invoice) {
                // Exclude the current invoice if updating a draft
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
            // Get the previous invoice to carry forward any balances
            $previousInvoice = ClientInvoice::where('client_company_id', $company->id)
                ->where('client_agreement_id', $agreement->id)
                ->whereNotIn('status', ['void'])
                ->where('period_end', '<', $periodStart)
                ->orderBy('period_end', 'desc')
                ->first();

            // Calculate rollover hours available (from previous months within rollover window)
            $rolloverHoursAvailable = $this->calculateRolloverHours($agreement, $periodStart, $previousInvoice);

            // Get negative balance from previous invoice (if client was over)
            $negativeBalanceFromPrevious = $previousInvoice ?
                (float) $previousInvoice->negative_hours_balance : 0;

            // Get all billable, uninvoiced time entries for this period
            $timeEntries = ClientTimeEntry::where('client_company_id', $company->id)
                ->whereNull('client_invoice_line_id')
                ->where('is_billable', true)
                ->whereBetween('date_worked', [$periodStart, $periodEnd])
                ->orderBy('date_worked')
                ->get();

            // Also get any older uninvoiced billable time entries (delayed billing)
            $delayedBillingEntries = ClientTimeEntry::where('client_company_id', $company->id)
                ->whereNull('client_invoice_line_id')
                ->where('is_billable', true)
                ->where('date_worked', '<', $periodStart)
                ->orderBy('date_worked')
                ->get();

            $delayedBillingMinutes = $delayedBillingEntries->sum('minutes_worked');
            $delayedBillingHours = $delayedBillingMinutes / 60;

            // Calculate total hours worked this period
            $totalMinutesWorked = $timeEntries->sum('minutes_worked');
            $hoursWorked = $totalMinutesWorked / 60;

            // Calculate hour balances according to the rules
            $calculation = $this->calculateHourBalances(
                $hoursWorked,
                (float) $agreement->monthly_retainer_hours,
                $rolloverHoursAvailable,
                $negativeBalanceFromPrevious,
                (int) $agreement->rollover_months
            );

            $invoiceData = [
                'client_company_id' => $company->id,
                'client_agreement_id' => $agreement->id,
                'period_start' => $periodStart,
                'period_end' => $periodEnd,
                'retainer_hours_included' => $agreement->monthly_retainer_hours,
                'hours_worked' => $hoursWorked,
                'rollover_hours_used' => $calculation['rollover_hours_used'],
                'unused_hours_balance' => $calculation['unused_hours_balance'],
                'negative_hours_balance' => $calculation['negative_hours_balance'],
                'hours_billed_at_rate' => $calculation['hours_billed_at_rate'],
                'status' => 'draft',
            ];

            if ($invoice) {
                // Update existing draft invoice
                $invoice->update($invoiceData);

                // Only delete system-generated line items (preserve manual items like 'expense' and 'adjustment')
                // System-generated line types: retainer, additional_hours, credit
                $systemGeneratedTypes = ['retainer', 'additional_hours', 'credit'];

                $systemLines = $invoice->lineItems()
                    ->whereIn('line_type', $systemGeneratedTypes)
                    ->get();

                // Unlink time entries from system-generated lines
                foreach ($systemLines as $line) {
                    $line->timeEntries()->update(['client_invoice_line_id' => null]);
                }

                // Delete only system-generated line items
                $invoice->lineItems()
                    ->whereIn('line_type', $systemGeneratedTypes)
                    ->delete();
            } else {
                // Create a new invoice
                $invoiceData['invoice_number'] = $this->generateInvoiceNumber($company, $agreement);
                $invoiceData['invoice_total'] = 0; // Will calculate after line items
                $invoice = ClientInvoice::create($invoiceData);
            }

            // Create line items
            $sortOrder = 1;

            // Line 1: Monthly retainer fee (always)
            $retainerLine = ClientInvoiceLine::create([
                'client_invoice_id' => $invoice->client_invoice_id,
                'client_agreement_id' => $agreement->id,
                'description' => "Monthly Retainer ({$agreement->monthly_retainer_hours} hours)",
                'quantity' => 1,
                'unit_price' => $agreement->monthly_retainer_fee,
                'line_total' => $agreement->monthly_retainer_fee,
                'line_type' => 'retainer',
                'hours' => $agreement->monthly_retainer_hours,
                'sort_order' => $sortOrder++,
            ]);

            // Link time entries to the retainer line (up to the retainer + rollover hours)
            $hoursToLink = $calculation['hours_covered_by_retainer'] + $calculation['rollover_hours_used'];
            $this->linkTimeEntriesToLine($timeEntries, $retainerLine, $hoursToLink);

            // Line 2: Additional hours at hourly rate (if any)
            if ($calculation['hours_billed_at_rate'] > 0) {
                $additionalHoursLine = ClientInvoiceLine::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'client_agreement_id' => $agreement->id,
                    'description' => "Additional Hours @ \${$agreement->hourly_rate}/hr",
                    'quantity' => $calculation['hours_billed_at_rate'],
                    'unit_price' => $agreement->hourly_rate,
                    'line_total' => $calculation['hours_billed_at_rate'] * (float) $agreement->hourly_rate,
                    'line_type' => 'additional_hours',
                    'hours' => $calculation['hours_billed_at_rate'],
                    'sort_order' => $sortOrder++,
                ]);

                // Link remaining time entries to this line
                $this->linkTimeEntriesToLine($timeEntries, $additionalHoursLine, $calculation['hours_billed_at_rate']);
            }

            // Line 3: Delayed billing hours from prior periods (if any)
            if ($delayedBillingHours > 0) {
                $delayedBillingLine = ClientInvoiceLine::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'client_agreement_id' => $agreement->id,
                    'description' => "Prior Period Hours (delayed billing) @ \${$agreement->hourly_rate}/hr",
                    'quantity' => $delayedBillingHours,
                    'unit_price' => $agreement->hourly_rate,
                    'line_total' => $delayedBillingHours * (float) $agreement->hourly_rate,
                    'line_type' => 'additional_hours',
                    'hours' => $delayedBillingHours,
                    'sort_order' => $sortOrder++,
                ]);

                // Link all delayed billing entries to this line
                foreach ($delayedBillingEntries as $entry) {
                    $entry->update(['client_invoice_line_id' => $delayedBillingLine->client_invoice_line_id]);
                }
            }

            // Line 4: Credit for rollover hours applied (informational, $0)
            if ($calculation['rollover_hours_used'] > 0) {
                ClientInvoiceLine::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'client_agreement_id' => $agreement->id,
                    'description' => 'Rollover Hours Applied (from previous months)',
                    'quantity' => $calculation['rollover_hours_used'],
                    'unit_price' => 0,
                    'line_total' => 0,
                    'line_type' => 'credit',
                    'hours' => $calculation['rollover_hours_used'],
                    'sort_order' => $sortOrder++,
                ]);
            }

            // Calculate and update total
            $invoice->recalculateTotal();

            return $invoice->fresh(['lineItems']);
        });
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
     * Calculate hour balances according to the billing rules.
     *
     * Rules:
     * 1. This month's retainer hours are added to the pool
     * 2. If there was a negative balance, offset it first with new hours
     * 3. Hours worked are deducted from available pool (retainer + rollover)
     * 4. If pool is exhausted, excess hours are billed at hourly rate
     * 5. Unused hours can roll over (up to rollover_months limit)
     */
    protected function calculateHourBalances(
        float $hoursWorked,
        float $retainerHours,
        float $rolloverHoursAvailable,
        float $negativeBalanceFromPrevious,
        int $rolloverMonths
    ): array {
        // Use RolloverCalculator to ensure consistent logic with the portal UI
        
        // Adapter: Treat aggregated rollover hours as "1 month ago" hours
        // Since the service already filtered by the rollover window, these are all valid
        $previousMonthsUnused = $rolloverMonths > 0 ? [1 => $rolloverHoursAvailable] : [];

        $opening = $this->rolloverCalculator->calculateOpeningBalance(
            $retainerHours,
            $previousMonthsUnused,
            $rolloverMonths,
            $negativeBalanceFromPrevious
        );

        $closing = $this->rolloverCalculator->calculateClosingBalance(
            $opening['total_available'],
            $hoursWorked,
            $opening['effective_retainer_hours'],
            $opening['rollover_hours']
        );

        // Calculate billable overage
        // This includes hours that exceeded the previous month's negative balance carry-over capacity
        // plus any explicit excess hours from this month (though calculator currently defaults to negative balance)
        $hoursBilledAtRate = $opening['invoiced_negative_balance'] + $closing['excess_hours'];

        return [
            'hours_covered_by_retainer' => $closing['hours_used_from_retainer'],
            'rollover_hours_used' => $closing['hours_used_from_rollover'],
            'hours_billed_at_rate' => $hoursBilledAtRate,
            'unused_hours_balance' => $closing['unused_hours'],
            'negative_hours_balance' => $closing['negative_balance'],
        ];
    }

    /**
     * Link time entries to an invoice line.
     *
     * @param  \Illuminate\Support\Collection  $timeEntries  Collection of time entries (modified in place)
     * @param  ClientInvoiceLine  $line  The invoice line to link to
     * @param  float  $hoursToLink  Maximum hours to link to this line
     */
    protected function linkTimeEntriesToLine($timeEntries, ClientInvoiceLine $line, float $hoursToLink): void
    {
        $minutesToLink = $hoursToLink * 60;
        $minutesLinked = 0;

        foreach ($timeEntries as $entry) {
            // Skip if already linked
            if ($entry->client_invoice_line_id !== null) {
                continue;
            }

            // Skip if we've linked enough
            if ($minutesLinked >= $minutesToLink) {
                break;
            }

            // Link this entry
            $entry->update(['client_invoice_line_id' => $line->client_invoice_line_id]);
            $minutesLinked += $entry->minutes_worked;
        }
    }

    /**
     * Generate a unique invoice number.
     */
    protected function generateInvoiceNumber(ClientCompany $company, ClientAgreement $agreement): string
    {
        // Format: {COMPANY_PREFIX}-{YEAR}{MONTH}-{SEQUENCE}
        $rawPrefix = strtoupper(substr(preg_replace('/[^a-zA-Z0-9]/', '', $company->company_name), 0, 4));
        $prefix = $rawPrefix ? $rawPrefix . '-' : '';
        $yearMonth = now()->format('Ym');

        // Find the next sequence number for this company
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
