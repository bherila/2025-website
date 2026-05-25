<?php

namespace App\Services\ClientManagement;

use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientCompanyActivity;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class AgreementTransitionService
{
    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function preview(ClientCompany $company, ClientAgreement $agreement, array $input): array
    {
        $this->assertAgreementBelongsToCompany($company, $agreement);

        $effectiveDate = Carbon::parse($input['effective_date'])->startOfDay();
        $outgoingTerminationDate = $effectiveDate->copy()->subDay();
        $successorTerms = $this->successorTerms($agreement, $input);
        $carriedRolloverHours = ($input['carry_rollover'] ?? true)
            ? $this->closingRolloverHours($agreement, $outgoingTerminationDate)
            : 0.0;

        $activeRecurringItems = $agreement->recurringItems()
            ->where(function ($query) use ($effectiveDate): void {
                $query->whereNull('end_date')
                    ->orWhere('end_date', '>=', $effectiveDate->toDateString());
            })
            ->count();

        return [
            'company_id' => $company->id,
            'outgoing_agreement_id' => $agreement->id,
            'effective_date' => $effectiveDate->toDateString(),
            'outgoing_termination_date' => $outgoingTerminationDate->toDateString(),
            'successor_terms' => $successorTerms,
            'carry_rollover' => (bool) ($input['carry_rollover'] ?? true),
            'carried_rollover_hours' => round($carriedRolloverHours, 4),
            'recurring_item_handling' => $this->recurringItemHandling($input),
            'recurring_items_affected' => $activeRecurringItems,
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array{outgoing_agreement: ClientAgreement, successor_agreement: ClientAgreement, preview: array<string, mixed>}
     */
    public function transition(ClientCompany $company, ClientAgreement $agreement, array $input): array
    {
        return DB::transaction(function () use ($company, $agreement, $input): array {
            $preview = $this->preview($company, $agreement, $input);
            $effectiveDate = Carbon::parse($preview['effective_date'])->startOfDay();
            $outgoingTerminationDate = Carbon::parse($preview['outgoing_termination_date'])->startOfDay();

            $agreement->update([
                'termination_date' => $outgoingTerminationDate,
            ]);

            $successor = ClientAgreement::create(array_merge(
                [
                    'client_company_id' => $company->id,
                    'active_date' => $effectiveDate,
                    'termination_date' => null,
                    'agreement_text' => $agreement->agreement_text,
                    'agreement_link' => $agreement->agreement_link,
                    'is_visible_to_client' => $agreement->is_visible_to_client,
                    'initial_rollover_hours' => $preview['carried_rollover_hours'],
                ],
                $preview['successor_terms'],
            ));

            $this->handleRecurringItems($agreement, $successor, $preview['recurring_item_handling'], $effectiveDate);

            ClientCompanyActivity::record($company, 'agreement.transitioned', $successor, [
                'outgoing_agreement_id' => $agreement->id,
                'successor_agreement_id' => $successor->id,
                'effective_date' => $preview['effective_date'],
                'outgoing_termination_date' => $preview['outgoing_termination_date'],
                'successor_terms' => $preview['successor_terms'],
                'carry_rollover' => $preview['carry_rollover'],
                'carried_rollover_hours' => $preview['carried_rollover_hours'],
                'recurring_item_handling' => $preview['recurring_item_handling'],
            ]);

            return [
                'outgoing_agreement' => $agreement->fresh(),
                'successor_agreement' => $successor->fresh('recurringItems'),
                'preview' => $preview,
            ];
        });
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    private function successorTerms(ClientAgreement $agreement, array $input): array
    {
        $terms = $input['successor_terms'] ?? [];
        if (! is_array($terms)) {
            $terms = [];
        }

        $flatInput = array_diff_key($input, array_flip([
            'effective_date',
            'carry_rollover',
            'recurring_item_handling',
            'successor_terms',
        ]));
        $terms = array_merge($terms, $flatInput);

        return [
            'monthly_retainer_hours' => $terms['monthly_retainer_hours'] ?? $agreement->monthly_retainer_hours,
            'catch_up_threshold_hours' => $terms['catch_up_threshold_hours'] ?? $agreement->catch_up_threshold_hours,
            'rollover_months' => $terms['rollover_months'] ?? $agreement->rollover_months,
            'hourly_rate' => $terms['hourly_rate'] ?? $agreement->hourly_rate,
            'monthly_retainer_fee' => $terms['monthly_retainer_fee'] ?? $agreement->monthly_retainer_fee,
            'retainer_fee' => $terms['retainer_fee'] ?? $agreement->retainer_fee,
            'retainer_hours' => $terms['retainer_hours'] ?? $agreement->retainer_hours,
            'billing_cadence' => $terms['billing_cadence'] ?? $agreement->effectiveBillingCadence()->value,
            'bill_overage_interim' => $terms['bill_overage_interim'] ?? $agreement->bill_overage_interim,
            'first_cycle_proration' => $terms['first_cycle_proration'] ?? $agreement->effectiveFirstCycleProration()->value,
        ];
    }

    private function closingRolloverHours(ClientAgreement $agreement, Carbon $outgoingTerminationDate): float
    {
        $invoice = $agreement->invoices()
            ->whereNotIn('status', ['void'])
            ->whereDate('period_end', '<=', $outgoingTerminationDate->toDateString())
            ->orderBy('period_end', 'desc')
            ->first();

        return $invoice ? max(0.0, (float) $invoice->unused_hours_balance) : 0.0;
    }

    /**
     * @param  array<string, mixed>  $input
     */
    private function recurringItemHandling(array $input): string
    {
        $handling = (string) ($input['recurring_item_handling'] ?? 'clone');

        return match ($handling) {
            'end' => 'drop',
            'skip' => 'skip',
            default => $handling,
        };
    }

    private function handleRecurringItems(
        ClientAgreement $outgoing,
        ClientAgreement $successor,
        string $handling,
        Carbon $effectiveDate,
    ): void {
        $closingDate = $effectiveDate->copy()->subDay();
        $items = $outgoing->recurringItems()
            ->where(function ($query) use ($effectiveDate): void {
                $query->whereNull('end_date')
                    ->orWhere('end_date', '>=', $effectiveDate->toDateString());
            })
            ->get();
        $originalEndDates = $items->mapWithKeys(
            fn ($item): array => [$item->id => $item->end_date],
        );

        if (in_array($handling, ['migrate', 'drop'], true)) {
            foreach ($items as $item) {
                $item->update(['end_date' => $closingDate]);
            }
        }

        if (in_array($handling, ['drop', 'skip'], true)) {
            return;
        }

        foreach ($items as $item) {
            $successor->recurringItems()->create([
                'description' => $item->description,
                'amount' => $item->amount,
                'charge_cadence' => $item->charge_cadence->value,
                'anchor_month' => $item->anchor_month,
                'anchor_day' => $item->anchor_day,
                'start_date' => $effectiveDate,
                'end_date' => $originalEndDates->get($item->id),
                'is_taxable' => $item->is_taxable,
                'is_summarized' => $item->is_summarized,
                'notes' => $item->notes,
            ]);
        }
    }

    private function assertAgreementBelongsToCompany(ClientCompany $company, ClientAgreement $agreement): void
    {
        if ((int) $agreement->client_company_id !== (int) $company->id) {
            throw new \InvalidArgumentException('Agreement does not belong to this company.');
        }
    }
}
