<?php

namespace App\Http\Requests\ClientManagement;

use App\Models\ClientManagement\ClientCompany;
use App\Services\ClientManagement\BillingCycleResolver;
use Carbon\Carbon;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreClientInvoiceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'period_start' => ['required_without:cycle_start', 'date'],
            'period_end' => ['required_with:period_start', 'date', 'after:period_start'],
            'cycle_start' => ['required_without:period_start', 'date'],
            'cycle_end' => ['required_with:cycle_start', 'date', 'after:cycle_start'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'period_start.required_without' => 'Provide either a manual period start or a cadence cycle start.',
            'period_end.required_with' => 'A manual period end is required when period start is provided.',
            'cycle_start.required_without' => 'Provide either a cadence cycle start or a manual period start.',
            'cycle_end.required_with' => 'A cadence cycle end is required when cycle start is provided.',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($this->filled('period_start') && $this->usesCycleShorthand()) {
                $validator->errors()->add('period_start', 'Manual period fields cannot be combined with cycle fields.');
                $validator->errors()->add('cycle_start', 'Cycle fields cannot be combined with manual period fields.');
            }

            if ($validator->errors()->isNotEmpty() || ! $this->usesCycleShorthand()) {
                return;
            }

            $company = $this->company();
            $agreement = $company?->activeAgreement() ?? $company?->mostRecentAgreement();
            if (! $agreement) {
                return;
            }

            $cycleStart = Carbon::parse($this->input('cycle_start'))->startOfDay();
            $cycleEnd = Carbon::parse($this->input('cycle_end'))->startOfDay();
            $cycle = (new BillingCycleResolver)->cycleContaining($agreement, $cycleStart);

            if (! $cycleStart->isSameDay($cycle->start) || ! $cycleEnd->isSameDay($cycle->end)) {
                $validator->errors()->add('cycle_start', 'Cycle dates must match the agreement billing cadence cycle.');
            }
        });
    }

    public function periodStart(): Carbon
    {
        return Carbon::parse($this->input('cycle_start', $this->input('period_start')))->startOfDay();
    }

    public function periodEnd(): Carbon
    {
        return Carbon::parse($this->input('cycle_end', $this->input('period_end')))->startOfDay();
    }

    public function usesCycleShorthand(): bool
    {
        return $this->filled('cycle_start') || $this->filled('cycle_end');
    }

    private function company(): ?ClientCompany
    {
        $company = $this->route('company');

        return $company instanceof ClientCompany ? $company : null;
    }
}
