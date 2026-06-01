<?php

namespace App\Http\Requests\ClientManagement;

use Carbon\Carbon;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

class GenerateInterimOverageInvoiceRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return Gate::allows('Admin');
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'yyyymm' => ['required', 'date_format:Ym'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'yyyymm.required' => 'Provide the YYYYMM month in the interim invoice route.',
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
        return Carbon::createFromFormat('Ymd', (string) $this->route('yyyymm').'01')->startOfMonth();
    }
}
