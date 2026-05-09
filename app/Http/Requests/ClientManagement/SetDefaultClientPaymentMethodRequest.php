<?php

namespace App\Http\Requests\ClientManagement;

use Illuminate\Foundation\Http\FormRequest;

class SetDefaultClientPaymentMethodRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [];
    }
}
