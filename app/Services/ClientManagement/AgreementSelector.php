<?php

namespace App\Services\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class AgreementSelector
{
    /**
     * Use active agreement if available; otherwise fall back to the most
     * recently terminated agreement so invoice generation can handle trailing
     * post-termination work.
     */
    public function agreementForInvoiceGeneration(ClientCompany $company): ClientAgreement
    {
        $agreement = $company->activeAgreement() ?? $company->mostRecentAgreement();
        if (! $agreement) {
            throw new \Exception('No agreement found for this client company.');
        }

        return $agreement;
    }

    /**
     * Return every historical agreement segment that can still produce invoices.
     *
     * @return Collection<int, ClientAgreement>
     */
    public function agreementsForInvoiceGeneration(ClientCompany $company): Collection
    {
        $agreements = $company->agreements()
            ->where(function ($query): void {
                $query->where('active_date', '<=', now())
                    ->orWhere(function ($query): void {
                        $query->where('billing_cadence', '!=', BillingCadence::Monthly->value)
                            ->where('active_date', '<=', now()->copy()->addMonth());
                    });
            })
            ->orderBy('active_date')
            ->orderBy('id')
            ->get();

        if ($agreements->isEmpty()) {
            throw new \Exception('No agreement found for this client company.');
        }

        return $agreements;
    }

    /**
     * @param  Collection<int, ClientAgreement>  $agreements
     */
    public function successorAgreementForGeneration(Collection $agreements, ClientAgreement $agreement): ?ClientAgreement
    {
        $activeDate = Carbon::parse($agreement->active_date)->startOfDay();

        return $agreements->first(function (ClientAgreement $candidate) use ($agreement, $activeDate): bool {
            if ((int) $candidate->id === (int) $agreement->id) {
                return false;
            }

            $candidateActiveDate = Carbon::parse($candidate->active_date)->startOfDay();

            return $candidateActiveDate->gt($activeDate)
                || ($candidateActiveDate->eq($activeDate) && (int) $candidate->id > (int) $agreement->id);
        });
    }

    public function agreementCoveringDate(ClientCompany $company, Carbon $date): ?ClientAgreement
    {
        return $company->agreements()
            ->where('active_date', '<=', $date->toDateString())
            ->where(function ($query) use ($date): void {
                $query->whereNull('termination_date')
                    ->orWhere('termination_date', '>=', $date->toDateString());
            })
            ->orderBy('active_date', 'desc')
            ->orderBy('id', 'desc')
            ->first();
    }
}
