<?php

namespace App\Http\Requests\FinancialPlanning;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ComputeRothConversionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return self::scenarioRules($this->input('inputs.filingStatus'));
    }

    /**
     * @return array<string, mixed>
     */
    public static function scenarioRules(?string $filingStatus = null): array
    {
        $requiresSpouse = in_array($filingStatus, ['married_filing_jointly', 'qualifying_surviving_spouse'], true);

        return [
            'inputs' => ['required', 'array'],
            'inputs.currentYear' => ['required', 'integer', 'min:2024', 'max:2100'],
            'inputs.filingStatus' => ['required', 'string', Rule::in(['single', 'married_filing_jointly', 'head_of_household', 'qualifying_surviving_spouse'])],
            'inputs.people' => ['required', 'array'],
            'inputs.people.primaryBirthYear' => ['required', 'integer', 'min:1900', 'max:2100'],
            'inputs.people.primaryCurrentAge' => ['nullable', 'integer', 'min:18', 'max:120'],
            'inputs.people.primaryEndAge' => ['required', 'integer', 'min:18', 'max:120'],
            'inputs.people.spouseBirthYear' => [Rule::requiredIf($requiresSpouse), 'nullable', 'integer', 'min:1900', 'max:2100'],
            'inputs.people.spouseCurrentAge' => ['nullable', 'integer', 'min:18', 'max:120'],
            'inputs.people.spouseEndAge' => [Rule::requiredIf($requiresSpouse), 'nullable', 'integer', 'min:18', 'max:120'],
            'inputs.people.firstDeathAge' => ['nullable', 'integer', 'min:18', 'max:120'],
            'inputs.income' => ['required', 'array'],
            'inputs.income.*' => ['nullable', 'numeric', 'min:0', 'max:100000000'],
            'inputs.socialSecurity' => ['required', 'array'],
            'inputs.socialSecurity.piaPrimary' => ['nullable', 'numeric', 'min:0', 'max:100000'],
            'inputs.socialSecurity.piaSpouse' => ['nullable', 'numeric', 'min:0', 'max:100000'],
            'inputs.socialSecurity.fraPrimary' => ['required', 'integer', 'min:65', 'max:67'],
            'inputs.socialSecurity.fraSpouse' => ['required', 'integer', 'min:65', 'max:67'],
            'inputs.socialSecurity.claimAgePrimary' => ['required', 'integer', 'min:62', 'max:70'],
            'inputs.socialSecurity.claimAgeSpouse' => ['required', 'integer', 'min:62', 'max:70'],
            'inputs.socialSecurity.colaPercent' => ['nullable', 'numeric', 'min:0', 'max:20'],
            'inputs.balances' => ['required', 'array'],
            'inputs.balances.*' => ['nullable', 'numeric', 'min:0', 'max:1000000000'],
            'inputs.strategy' => ['required', 'array'],
            'inputs.strategy.name' => ['nullable', 'string', 'max:80'],
            'inputs.strategy.conversionMode' => ['required', 'string', Rule::in(['constant', 'fill_bracket', 'schedule'])],
            'inputs.strategy.conversionStartAge' => ['required', 'integer', 'min:18', 'max:120'],
            'inputs.strategy.conversionEndAge' => ['required', 'integer', 'min:18', 'max:120'],
            'inputs.strategy.annualConversion' => ['required', 'numeric', 'min:0', 'max:100000000'],
            'inputs.strategy.bracketTarget' => ['required', 'numeric', Rule::in([12, 22, 24, 32])],
            'inputs.strategy.perYearConversions' => ['nullable', 'array'],
            'inputs.strategy.perYearConversions.*' => ['nullable', 'numeric', 'min:0', 'max:100000000'],
            'inputs.strategy.harvestLtcg' => ['required', 'boolean'],
            'inputs.strategy.ltcgTargetRate' => ['required', 'numeric', Rule::in([0, 15])],
            'inputs.strategy.withdrawalOrder' => ['required', 'string', 'max:80'],
            'inputs.scenarios' => ['nullable', 'array', 'max:3'],
            'inputs.scenarios.*.name' => ['nullable', 'string', 'max:80'],
            'inputs.scenarios.*.claimAgePrimary' => ['nullable', 'integer', 'min:62', 'max:70'],
            'inputs.scenarios.*.claimAgeSpouse' => ['nullable', 'integer', 'min:62', 'max:70'],
            'inputs.scenarios.*.strategy' => ['nullable', 'array'],
            'inputs.scenarios.*.strategy.conversionMode' => ['nullable', 'string', Rule::in(['constant', 'fill_bracket', 'schedule'])],
            'inputs.scenarios.*.strategy.annualConversion' => ['nullable', 'numeric', 'min:0', 'max:100000000'],
            'inputs.scenarios.*.strategy.bracketTarget' => ['nullable', 'numeric', Rule::in([12, 22, 24, 32])],
            'inputs.assumptions' => ['required', 'array'],
            'inputs.assumptions.preRetirementGrowthPercent' => ['nullable', 'numeric', 'min:0', 'max:25'],
            'inputs.assumptions.postRetirementGrowthPercent' => ['nullable', 'numeric', 'min:0', 'max:25'],
            'inputs.assumptions.cashYieldPercent' => ['nullable', 'numeric', 'min:0', 'max:25'],
            'inputs.assumptions.inflationPercent' => ['nullable', 'numeric', 'min:0', 'max:20'],
            'inputs.assumptions.stateTaxPercent' => ['nullable', 'numeric', 'min:0', 'max:25'],
            'inputs.assumptions.stateTaxesLtcg' => ['boolean'],
            'inputs.assumptions.deductionMode' => ['nullable', 'string', Rule::in(['standard', 'custom'])],
            'inputs.assumptions.customDeduction' => ['nullable', 'numeric', 'min:0', 'max:10000000'],
            'inputs.assumptions.discountRatePercent' => ['nullable', 'numeric', 'min:0', 'max:25'],
            'inputs.assumptions.priorYearMagi' => ['nullable', 'numeric', 'min:0', 'max:100000000'],
            'inputs.assumptions.twoYearsPriorMagi' => ['nullable', 'numeric', 'min:0', 'max:100000000'],
        ];
    }
}
