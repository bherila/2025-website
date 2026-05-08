<?php

namespace App\Http\Requests\ClientManagement;

use Carbon\Carbon;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class GenerateInterimOverageInvoiceRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return auth()->check();
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'yyyymm' => ['nullable', 'date_format:Ym'],
            'month' => ['required_without_all:period_start,yyyymm', 'date_format:Y-m'],
            'period_start' => ['required_without_all:month,yyyymm', 'date'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'month.required_without_all' => 'Provide a month or period start for the interim invoice.',
            'period_start.required_without_all' => 'Provide a period start or month for the interim invoice.',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function validationData(): array
    {
        return array_merge($this->all(), [
            'yyyymm' => $this->route('yyyymm'),
        ]);
    }

    public function periodStart(): Carbon
    {
        if ($this->route('yyyymm')) {
            return Carbon::createFromFormat('Ymd', (string) $this->route('yyyymm').'01')->startOfMonth();
        }

        if ($this->filled('month')) {
            return Carbon::createFromFormat('Y-m-d', $this->input('month').'-01')->startOfMonth();
        }

        return Carbon::parse($this->input('period_start'))->startOfMonth();
    }
}
