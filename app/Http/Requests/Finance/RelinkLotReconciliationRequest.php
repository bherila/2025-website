<?php

namespace App\Http\Requests\Finance;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class RelinkLotReconciliationRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'broker_lot_id' => ['required', 'integer', 'min:1', 'exists:fin_account_lots,lot_id'],
            'account_lot_id' => ['required', 'integer', 'min:1', 'exists:fin_account_lots,lot_id'],
        ];
    }
}
