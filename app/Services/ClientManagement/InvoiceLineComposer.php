<?php

namespace App\Services\ClientManagement;

use App\Enums\ClientManagement\InvoiceLineType;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientExpense;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoiceLine;
use App\Models\ClientManagement\ClientTask;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Services\ClientManagement\DataTransferObjects\DeferredAllocationResult;
use App\Services\ClientManagement\DataTransferObjects\TimeEntryFragment;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class InvoiceLineComposer
{
    public function __construct(private readonly RecurringItemBiller $recurringItemBiller = new RecurringItemBiller) {}

    /**
     * Remove generated lines from a draft invoice before regeneration.
     */
    public function resetSystemGeneratedLines(ClientInvoice $invoice): void
    {
        $systemLines = $invoice->lineItems()
            ->whereIn('line_type', InvoiceLineType::systemGeneratedValues())
            ->get();

        foreach ($systemLines as $line) {
            $line->timeEntries()->update(['client_invoice_line_id' => null]);
            $line->tasks()->update(['client_invoice_line_id' => null]);
        }
        $invoice->lineItems()->whereIn('line_type', InvoiceLineType::systemGeneratedValues())->delete();

        $expenseLines = $invoice->lineItems()->where('line_type', InvoiceLineType::Expense->value)->get();
        foreach ($expenseLines as $line) {
            $line->expenses()->update(['client_invoice_line_id' => null]);
        }
        $invoice->lineItems()->where('line_type', InvoiceLineType::Expense->value)->delete();
    }

    /**
     * Add recurring fixed-fee item incidences to a cadence-period invoice.
     */
    public function addRecurringItemLines(
        ClientInvoice $invoice,
        ClientAgreement $agreement,
        Carbon $periodStart,
        Carbon $periodEnd,
        int &$sortOrder,
    ): void {
        $agreement->loadMissing('recurringItems');

        foreach ($this->recurringItemBiller->linesForCycle($agreement, $periodStart, $periodEnd) as $lineData) {
            $line = $this->recurringItemBiller->buildLine($lineData, $sortOrder++);
            $line->client_invoice_id = $invoice->client_invoice_id;
            $line->save();
        }
    }

    /**
     * Add reimbursable expenses to the invoice.
     */
    public function addReimbursableExpenses(
        ClientCompany $company,
        ClientInvoice $invoice,
        Carbon $invoiceDate,
        int &$sortOrder
    ): void {
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

            $expense->update(['client_invoice_line_id' => $line->client_invoice_line_id]);
        }
    }

    /**
     * Add billable milestone tasks (with milestone_price > 0) to the invoice.
     *
     * Includes all unbilled tasks completed on or before the period end.
     * This handles the case where a task was completed in a prior period where
     * the invoice was already issued/paid — such tasks are carried forward to
     * the next available (draft or new) invoice.
     */
    public function addBillableMilestoneTasks(
        ClientCompany $company,
        ClientInvoice $invoice,
        Carbon $periodEnd,
        int &$sortOrder
    ): void {
        $tasks = ClientTask::whereHas('project', function ($q) use ($company) {
            $q->where('client_company_id', $company->id);
        })
            ->where('milestone_price', '>', 0)
            ->whereNotNull('completed_at')
            ->whereNull('client_invoice_line_id')
            ->where('completed_at', '<=', $periodEnd->copy()->endOfDay())
            ->orderBy('completed_at')
            ->get();

        foreach ($tasks as $task) {
            $line = ClientInvoiceLine::create([
                'client_invoice_id' => $invoice->client_invoice_id,
                'client_agreement_id' => $invoice->client_agreement_id,
                'description' => 'Milestone: '.$task->name,
                'quantity' => '1',
                'unit_price' => $task->milestone_price,
                'line_total' => $task->milestone_price,
                'line_type' => 'milestone',
                'hours' => null,
                'line_date' => $task->completed_at,
                'sort_order' => $sortOrder++,
            ]);

            $task->update(['client_invoice_line_id' => $line->client_invoice_line_id]);
        }
    }

    /**
     * Add a single prior_month_retainer line that covers all deferred time
     * entries that fit in the remaining capacity for this period.
     *
     * The whole-entry invariant (see docs/client-management/deferred-billing.md):
     * each entry is attached directly — TimeEntrySplitter is never involved.
     */
    public function addDeferredRetainerLine(
        ClientInvoice $invoice,
        ClientAgreement $agreement,
        DeferredAllocationResult $result,
        Carbon $periodEnd,
        int &$sortOrder,
    ): void {
        $hours = $result->hoursBilled;
        $line = ClientInvoiceLine::create([
            'client_invoice_id' => $invoice->client_invoice_id,
            'client_agreement_id' => $agreement->id,
            'description' => sprintf(
                'Deferred work items applied to retainer (%s)',
                $this->formatHoursForQuantity($hours),
            ),
            'quantity' => '',
            'unit_price' => 0,
            'line_total' => 0,
            'line_type' => 'prior_month_retainer',
            'hours' => $hours,
            'line_date' => $periodEnd,
            'sort_order' => $sortOrder++,
        ]);

        foreach ($result->billed as $candidate) {
            $candidate->entry->update([
                'client_invoice_line_id' => $line->client_invoice_line_id,
            ]);
        }
    }

    /**
     * Add an additional_hours line that force-bills every outstanding deferred
     * entry at the agreement's hourly rate. Used on termination invoices so
     * the client is never left with unbilled deferred work.
     *
     * @param  Collection<int, ClientTimeEntry>  $entries
     */
    public function addDeferredTerminationLine(
        ClientInvoice $invoice,
        ClientAgreement $agreement,
        Collection $entries,
        int &$sortOrder,
    ): void {
        $totalMinutes = (int) $entries->sum('minutes_worked');
        if ($totalMinutes <= 0) {
            return;
        }
        $hours = round($totalMinutes / 60, 4);
        $rate = (float) $agreement->hourly_rate;

        $line = ClientInvoiceLine::create([
            'client_invoice_id' => $invoice->client_invoice_id,
            'client_agreement_id' => $agreement->id,
            'description' => sprintf(
                'Deferred work items billed on agreement termination (%s @ $%.2f/hr)',
                $this->formatHoursForQuantity($hours),
                $rate,
            ),
            'quantity' => $this->formatHoursForQuantity($hours),
            'unit_price' => $rate,
            'line_total' => round($hours * $rate, 2),
            'line_type' => 'additional_hours',
            'hours' => $hours,
            'line_date' => $invoice->period_end,
            'sort_order' => $sortOrder++,
        ]);

        foreach ($entries as $entry) {
            $entry->update(['client_invoice_line_id' => $line->client_invoice_line_id]);
        }
    }

    /**
     * Link all time entry fragments to their respective invoice lines, handling splits correctly.
     *
     * @param  array<int, array<int, TimeEntryFragment>>  $fragmentsToLines
     */
    public function linkAllFragmentsToLines(array $fragmentsToLines, TimeEntrySplitter $splitter): void
    {
        $entrySplitPlan = [];

        foreach ($fragmentsToLines as $lineId => $fragments) {
            foreach ($fragments as $fragment) {
                $entryId = $fragment->originalTimeEntryId;
                if (! isset($entrySplitPlan[$entryId])) {
                    $entrySplitPlan[$entryId] = [];
                }
                $entrySplitPlan[$entryId][] = [
                    'line_id' => $lineId,
                    'minutes' => $fragment->minutes,
                ];
            }
        }

        foreach ($entrySplitPlan as $entryId => $splits) {
            $entry = ClientTimeEntry::find($entryId);
            if (! $entry) {
                continue;
            }

            if (count($splits) == 1 && $splits[0]['minutes'] >= $entry->minutes_worked) {
                $entry->update(['client_invoice_line_id' => $splits[0]['line_id']]);

                continue;
            }

            $remainingEntry = $entry;
            $totalMinutes = $entry->minutes_worked;
            $processedMinutes = 0;

            foreach ($splits as $i => $split) {
                $minutesForThisSplit = min($split['minutes'], $totalMinutes - $processedMinutes);

                if ($minutesForThisSplit <= 0) {
                    break;
                }

                $isLastSplit = ($i == count($splits) - 1) || ($processedMinutes + $minutesForThisSplit >= $totalMinutes);

                if ($isLastSplit) {
                    $remainingEntry->update(['client_invoice_line_id' => $split['line_id']]);
                } else {
                    $splitResult = $splitter->splitEntry($remainingEntry, $minutesForThisSplit);
                    $splitResult['primary']->update(['client_invoice_line_id' => $split['line_id']]);
                    $remainingEntry = $splitResult['overflow'];
                }

                $processedMinutes += $minutesForThisSplit;
            }
        }
    }

    private function formatHoursForQuantity(float $hours): string
    {
        if (abs($hours - round($hours)) < 0.0001) {
            return (string) (int) round($hours);
        }

        return rtrim(rtrim(number_format($hours, 4, '.', ''), '0'), '.');
    }
}
