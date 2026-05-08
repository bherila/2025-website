<?php

namespace App\Http\Requests\Finance;

use App\Models\FinanceTool\FinTaxLineAdjustment;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class UpdateTaxLineAdjustmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'line_ref' => ['sometimes', 'string', 'max:40'],
            'kind' => ['sometimes', 'string', Rule::in(FinTaxLineAdjustment::KINDS)],
            'amount' => ['nullable', 'numeric'],
            'description' => ['nullable', 'string', 'max:5000'],
            'status' => ['sometimes', 'string', Rule::in(FinTaxLineAdjustment::STATUSES)],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $existing = $this->existingAdjustment();
            $nextKind = (string) $this->input('kind', $existing?->kind);
            $nextAmount = $this->has('amount') ? $this->input('amount') : $existing?->amount;

            if (in_array($nextKind, ['override', 'adjustment'], true) && $nextAmount === null) {
                $validator->errors()->add('amount', 'An amount is required for overrides and adjustments.');
            }
        });
    }

    private function existingAdjustment(): ?FinTaxLineAdjustment
    {
        $id = $this->route('id');
        if ($id === null) {
            return null;
        }

        return FinTaxLineAdjustment::query()
            ->where('user_id', auth()->id())
            ->find((int) $id);
    }
}
