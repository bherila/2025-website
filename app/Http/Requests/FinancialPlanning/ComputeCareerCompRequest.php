<?php

namespace App\Http\Requests\FinancialPlanning;

use App\Services\Planning\CareerComp\VestingSchedule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ComputeCareerCompRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return self::inputRules();
    }

    /** @return array<string, mixed> */
    public static function inputRules(): array
    {
        return [
            'inputs' => ['required', 'array'],
            'inputs.horizonYears' => ['required', 'integer', 'min:1', 'max:30'],
            'inputs.startYear' => ['required', 'integer', 'min:2000', 'max:2200'],
            'inputs.currentJob' => ['nullable', 'array'],
            'inputs.hypotheticalJobs' => ['required', 'array', 'max:10'],
            'inputs.hypotheticalJobs.*' => ['required', 'array'],
            ...self::jobRules('inputs.currentJob', true),
            ...self::jobRules('inputs.hypotheticalJobs.*', false),
        ];
    }

    /** @return array<string, mixed> */
    public static function scenarioRules(): array
    {
        return self::inputRules();
    }

    /** @return array<string, mixed> */
    private static function jobRules(string $prefix, bool $nullable): array
    {
        $required = $nullable ? 'nullable' : 'required';

        return [
            "{$prefix}.id" => [$required, 'string', 'max:120'],
            "{$prefix}.name" => [$required, 'string', 'max:200'],
            "{$prefix}.company" => [$required, 'array'],
            "{$prefix}.company.type" => [$required, Rule::in(['public', 'private'])],
            "{$prefix}.company.currentSharePrice" => ['nullable', 'numeric', 'min:0'],
            "{$prefix}.company.fourNineA" => ['nullable', 'numeric', 'min:0'],
            "{$prefix}.company.fullyDilutedShares" => ['nullable', 'numeric', 'min:0'],
            "{$prefix}.company.annualDilutionPct" => ['nullable', 'numeric', 'min:0', 'max:100'],
            "{$prefix}.company.liquidityDate" => ['nullable', 'date_format:Y-m-d'],
            "{$prefix}.comp" => [$required, 'array'],
            "{$prefix}.comp.baseSalary" => ['nullable', 'numeric', 'min:0'],
            "{$prefix}.comp.cashBonus" => ['nullable', 'numeric', 'min:0'],
            "{$prefix}.comp.annualRaisePct" => ['nullable', 'numeric', 'min:0', 'max:100'],
            "{$prefix}.refresher" => ['nullable', 'array'],
            "{$prefix}.refresher.pctOfBase" => ['nullable', 'numeric', 'min:0', 'max:1000'],
            "{$prefix}.refresher.cadenceYears" => ['nullable', 'integer', 'min:1', 'max:30'],
            "{$prefix}.refresher.firstYearOffset" => ['nullable', 'integer', 'min:0', 'max:30'],
            "{$prefix}.refresher.vestingYears" => ['nullable', 'numeric', 'min:0', 'max:10'],
            "{$prefix}.refresher.cliffMonths" => ['nullable', 'integer', 'min:0', 'max:120'],
            "{$prefix}.refresher.vestingFrequency" => ['nullable', Rule::in(VestingSchedule::FREQUENCIES)],
            "{$prefix}.rsuGrants" => ['nullable', 'array', 'max:50'],
            "{$prefix}.rsuGrants.*.id" => ['required', 'string', 'max:120'],
            "{$prefix}.rsuGrants.*.kind" => ['required', Rule::in(['hire', 'refresher'])],
            "{$prefix}.rsuGrants.*.grantDate" => ['required', 'date_format:Y-m-d'],
            "{$prefix}.rsuGrants.*.shareCount" => ['nullable', 'numeric', 'min:0'],
            "{$prefix}.rsuGrants.*.grantValue" => ['nullable', 'numeric', 'min:0'],
            "{$prefix}.rsuGrants.*.grantPrice" => ['nullable', 'numeric', 'min:0'],
            "{$prefix}.rsuGrants.*.cliffMonths" => ['required', 'integer', 'min:0', 'max:120'],
            "{$prefix}.rsuGrants.*.vestingYears" => ['required', 'numeric', 'min:0.25', 'max:10'],
            "{$prefix}.rsuGrants.*.vestingFrequency" => ['nullable', Rule::in(VestingSchedule::FREQUENCIES)],
            "{$prefix}.optionGrants" => ['nullable', 'array', 'max:50'],
            "{$prefix}.optionGrants.*.id" => ['required', 'string', 'max:120'],
            "{$prefix}.optionGrants.*.kind" => ['required', Rule::in(['hire', 'refresher'])],
            "{$prefix}.optionGrants.*.type" => ['required', Rule::in(['iso', 'nso'])],
            "{$prefix}.optionGrants.*.grantDate" => ['required', 'date_format:Y-m-d'],
            "{$prefix}.optionGrants.*.shareCount" => ['required', 'numeric', 'min:0'],
            "{$prefix}.optionGrants.*.strike" => ['required', 'numeric', 'min:0'],
            "{$prefix}.optionGrants.*.cliffMonths" => ['required', 'integer', 'min:0', 'max:120'],
            "{$prefix}.optionGrants.*.vestingYears" => ['required', 'numeric', 'min:0.25', 'max:10'],
            "{$prefix}.optionGrants.*.vestingFrequency" => ['nullable', Rule::in(VestingSchedule::FREQUENCIES)],
            "{$prefix}.optionGrants.*.earlyExercise83b" => ['required', 'boolean'],
            "{$prefix}.growthBands" => [$required, 'array'],
            "{$prefix}.growthBands.lowPct" => ['nullable', 'numeric', 'min:-100', 'max:1000'],
            "{$prefix}.growthBands.mediumPct" => ['nullable', 'numeric', 'min:-100', 'max:1000'],
            "{$prefix}.growthBands.highPct" => ['nullable', 'numeric', 'min:-100', 'max:1000'],
        ];
    }
}
