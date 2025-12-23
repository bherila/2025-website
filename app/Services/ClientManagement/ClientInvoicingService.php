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
        $this->rolloverCalculator = $rolloverCalculator ?? new RolloverCalculator();
    }

    /**
     * Generate an invoice for a specific billing period.
     * 
     * @param ClientCompany $company The client company
     * @param Carbon $periodStart Start of billing period
     * @param Carbon $periodEnd End of billing period
     * @param ClientAgreement|null $agreement The agreement to use (defaults to active agreement)
     * @return ClientInvoice The generated invoice
     * @throws \Exception If no active agreement or validation fails
     */
    public function generateInvoice(
        ClientCompany $company,
        Carbon $periodStart,
        Carbon $periodEnd,
        ?ClientAgreement $agreement = null
    ): ClientInvoice {
        // Get the active agreement if not provided
        if (!$agreement) {
            $agreement = $company->activeAgreement();
            if (!$agreement) {
                throw new \Exception('No active agreement found for this client company.');
            }
        }

        // Validate period doesn't overlap with existing invoices
        $existingInvoice = ClientInvoice::where('client_company_id', $company->id)
            ->where('client_agreement_id', $agreement->id)
            ->where(function ($query) use ($periodStart, $periodEnd) {
                $query->whereBetween('period_start', [$periodStart, $periodEnd])
                    ->orWhereBetween('period_end', [$periodStart, $periodEnd])
                    ->orWhere(function ($q) use ($periodStart, $periodEnd) {
                        $q->where('period_start', '<=', $periodStart)
                          ->where('period_end', '>=', $periodEnd);
                    });
            })
            ->whereNotIn('status', ['void'])
            ->first();

        if ($existingInvoice) {
            throw new \Exception("An invoice already exists for this period (Invoice #{$existingInvoice->invoice_number}).");
        }

        return DB::transaction(function () use ($company, $agreement, $periodStart, $periodEnd) {
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

            // Generate invoice number
            $invoiceNumber = $this->generateInvoiceNumber($company, $agreement);

            // Create the invoice
            $invoice = ClientInvoice::create([
                'client_company_id' => $company->id,
                'client_agreement_id' => $agreement->id,
                'period_start' => $periodStart,
                'period_end' => $periodEnd,
                'invoice_number' => $invoiceNumber,
                'invoice_total' => 0, // Will calculate after line items
                'retainer_hours_included' => $agreement->monthly_retainer_hours,
                'hours_worked' => $hoursWorked,
                'rollover_hours_used' => $calculation['rollover_hours_used'],
                'unused_hours_balance' => $calculation['unused_hours_balance'],
                'negative_hours_balance' => $calculation['negative_hours_balance'],
                'hours_billed_at_rate' => $calculation['hours_billed_at_rate'],
                'status' => 'draft',
            ]);

            // Create line items
            $sortOrder = 1;

            // Line 1: Monthly retainer fee (always)
            $retainerLine = ClientInvoiceLine::create([
                'client_invoice_id' => $invoice->client_invoice_id,
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

            // Line 3: Credit for rollover hours applied (informational, $0)
            if ($calculation['rollover_hours_used'] > 0) {
                ClientInvoiceLine::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'description' => "Rollover Hours Applied (from previous months)",
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
        // Start with this month's retainer hours
        $availableRetainerHours = $retainerHours;
        
        // If there was a negative balance, offset it first
        if ($negativeBalanceFromPrevious > 0) {
            $offsetAmount = min($negativeBalanceFromPrevious, $availableRetainerHours);
            $availableRetainerHours -= $offsetAmount;
            $negativeBalanceFromPrevious -= $offsetAmount;
        }

        // Total hours available = remaining retainer + rollover
        $totalAvailable = $availableRetainerHours + $rolloverHoursAvailable;
        
        // Calculate how hours are consumed
        $hoursCoveredByRetainer = 0;
        $rolloverHoursUsed = 0;
        $hoursBilledAtRate = 0;
        $unusedHoursBalance = 0;
        $newNegativeBalance = 0;

        if ($hoursWorked <= $availableRetainerHours) {
            // All work covered by this month's retainer
            $hoursCoveredByRetainer = $hoursWorked;
            $unusedHoursBalance = $availableRetainerHours - $hoursWorked;
            // Don't add rollover to unused - those stay as-is for future months
        } elseif ($hoursWorked <= $totalAvailable) {
            // Need to use some rollover hours
            $hoursCoveredByRetainer = $availableRetainerHours;
            $rolloverHoursUsed = $hoursWorked - $availableRetainerHours;
            $unusedHoursBalance = 0; // Used all of this month's hours
        } else {
            // Exceeded all available hours - bill excess at rate
            $hoursCoveredByRetainer = $availableRetainerHours;
            $rolloverHoursUsed = $rolloverHoursAvailable;
            $hoursBilledAtRate = $hoursWorked - $totalAvailable;
            $unusedHoursBalance = 0;
            // Note: We only track negative balance if there's no rollover option
            // With rollover, excess is just billed immediately
        }

        return [
            'hours_covered_by_retainer' => round($hoursCoveredByRetainer, 4),
            'rollover_hours_used' => round($rolloverHoursUsed, 4),
            'hours_billed_at_rate' => round($hoursBilledAtRate, 4),
            'unused_hours_balance' => round($unusedHoursBalance, 4),
            'negative_hours_balance' => round($newNegativeBalance + $negativeBalanceFromPrevious, 4),
        ];
    }

    /**
     * Link time entries to an invoice line.
     * 
     * @param \Illuminate\Support\Collection $timeEntries Collection of time entries (modified in place)
     * @param ClientInvoiceLine $line The invoice line to link to
     * @param float $hoursToLink Maximum hours to link to this line
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
        $prefix = strtoupper(substr(preg_replace('/[^a-zA-Z0-9]/', '', $company->name), 0, 4));
        $yearMonth = now()->format('Ym');
        
        // Find the next sequence number for this company
        $lastInvoice = ClientInvoice::where('client_company_id', $company->id)
            ->where('invoice_number', 'like', "{$prefix}-{$yearMonth}-%")
            ->orderBy('invoice_number', 'desc')
            ->first();

        if ($lastInvoice) {
            $lastSeq = (int) substr($lastInvoice->invoice_number, -3);
            $seq = $lastSeq + 1;
        } else {
            $seq = 1;
        }

        return sprintf('%s-%s-%03d', $prefix, $yearMonth, $seq);
    }

    /**
     * Preview what an invoice would look like without creating it.
     */
    public function previewInvoice(
        ClientCompany $company,
        Carbon $periodStart,
        Carbon $periodEnd,
        ?ClientAgreement $agreement = null
    ): array {
        if (!$agreement) {
            $agreement = $company->activeAgreement();
            if (!$agreement) {
                throw new \Exception('No active agreement found for this client company.');
            }
        }

        // Get the previous invoice
        $previousInvoice = ClientInvoice::where('client_company_id', $company->id)
            ->where('client_agreement_id', $agreement->id)
            ->whereNotIn('status', ['void'])
            ->where('period_end', '<', $periodStart)
            ->orderBy('period_end', 'desc')
            ->first();

        $rolloverHoursAvailable = $this->calculateRolloverHours($agreement, $periodStart, $previousInvoice);
        $negativeBalanceFromPrevious = $previousInvoice ? 
            (float) $previousInvoice->negative_hours_balance : 0;

        // Get time entries
        $timeEntries = ClientTimeEntry::where('client_company_id', $company->id)
            ->whereNull('client_invoice_line_id')
            ->where('is_billable', true)
            ->whereBetween('date_worked', [$periodStart, $periodEnd])
            ->orderBy('date_worked')
            ->get();

        $totalMinutesWorked = $timeEntries->sum('minutes_worked');
        $hoursWorked = $totalMinutesWorked / 60;

        $calculation = $this->calculateHourBalances(
            $hoursWorked,
            (float) $agreement->monthly_retainer_hours,
            $rolloverHoursAvailable,
            $negativeBalanceFromPrevious,
            (int) $agreement->rollover_months
        );

        // Calculate totals
        $retainerTotal = (float) $agreement->monthly_retainer_fee;
        $additionalHoursTotal = $calculation['hours_billed_at_rate'] * (float) $agreement->hourly_rate;
        $invoiceTotal = $retainerTotal + $additionalHoursTotal;

        return [
            'period_start' => $periodStart->toDateString(),
            'period_end' => $periodEnd->toDateString(),
            'agreement' => [
                'monthly_retainer_hours' => $agreement->monthly_retainer_hours,
                'monthly_retainer_fee' => $agreement->monthly_retainer_fee,
                'hourly_rate' => $agreement->hourly_rate,
                'rollover_months' => $agreement->rollover_months,
            ],
            'time_entries_count' => $timeEntries->count(),
            'hours_worked' => round($hoursWorked, 2),
            'rollover_hours_available' => round($rolloverHoursAvailable, 2),
            'negative_balance_carried' => round($negativeBalanceFromPrevious, 2),
            'calculation' => $calculation,
            'line_items' => [
                [
                    'description' => "Monthly Retainer ({$agreement->monthly_retainer_hours} hours)",
                    'quantity' => 1,
                    'unit_price' => (float) $agreement->monthly_retainer_fee,
                    'total' => $retainerTotal,
                ],
                ...(
                    $calculation['hours_billed_at_rate'] > 0 ? [[
                        'description' => "Additional Hours @ \${$agreement->hourly_rate}/hr",
                        'quantity' => $calculation['hours_billed_at_rate'],
                        'unit_price' => (float) $agreement->hourly_rate,
                        'total' => $additionalHoursTotal,
                    ]] : []
                ),
            ],
            'invoice_total' => round($invoiceTotal, 2),
        ];
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
