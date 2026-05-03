<?php

namespace App\Http\Requests\Finance;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class Form8949LotExportRequest extends FormRequest
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
            'source' => ['required', 'string', 'in:database,analyzer'],
            'scope' => ['required_if:source,database', 'string', 'in:all,account_document'],
            'tax_year' => ['required_if:scope,all', 'integer', 'min:1900', 'max:2100'],
            'account_id' => ['required_if:scope,account_document', 'integer', 'min:1'],
            'tax_document_id' => ['required_if:scope,account_document', 'integer', 'min:1'],
            'account_link_id' => ['nullable', 'integer', 'min:1'],
            'lots' => ['required_if:source,analyzer', 'array'],
            'lots.*.symbol' => ['nullable', 'string', 'max:50'],
            'lots.*.description' => ['nullable', 'string', 'max:255'],
            'lots.*.quantity' => ['nullable', 'numeric'],
            'lots.*.dateAcquired' => ['nullable', 'string', 'max:32'],
            'lots.*.purchase_date' => ['nullable', 'string', 'max:32'],
            'lots.*.dateSold' => ['required_if:source,analyzer', 'string', 'max:32'],
            'lots.*.sale_date' => ['nullable', 'string', 'max:32'],
            'lots.*.proceeds' => ['required_if:source,analyzer', 'numeric'],
            'lots.*.costBasis' => ['nullable', 'numeric'],
            'lots.*.cost_basis' => ['nullable', 'numeric'],
            'lots.*.gainOrLoss' => ['nullable', 'numeric'],
            'lots.*.realized_gain_loss' => ['nullable', 'numeric'],
            'lots.*.adjustmentAmount' => ['nullable', 'numeric'],
            'lots.*.adjustmentCode' => ['nullable', 'string', 'max:8'],
            'lots.*.washSaleDisallowed' => ['nullable', 'numeric'],
            'lots.*.wash_sale_disallowed' => ['nullable', 'numeric'],
            'lots.*.disallowedLoss' => ['nullable', 'numeric'],
            'lots.*.isShortTerm' => ['nullable', 'boolean'],
            'lots.*.is_short_term' => ['nullable', 'boolean'],
        ];
    }
}
