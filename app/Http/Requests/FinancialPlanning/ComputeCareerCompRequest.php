<?php

namespace App\Http\Requests\FinancialPlanning;

use App\Services\Planning\CareerComp\VestingSchedule;
use Closure;
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
            'inputs.modelAssumptions' => ['nullable', 'array'],
            'inputs.modelAssumptions.commonFmvPctOfPreferred' => ['nullable', 'array'],
            'inputs.modelAssumptions.commonFmvPctOfPreferred.stageA' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'inputs.modelAssumptions.commonFmvPctOfPreferred.stageB' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'inputs.modelAssumptions.commonFmvPctOfPreferred.stageC' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'inputs.modelAssumptions.commonFmvPctOfPreferred.bridge' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'inputs.modelAssumptions.commonFmvPctOfPreferred.stageD' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'inputs.modelAssumptions.commonFmvPctOfPreferred.stageE' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'inputs.modelAssumptions.commonFmvPctOfPreferred.liquidityEvent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'inputs.modelAssumptions.tax' => ['nullable', 'array'],
            'inputs.modelAssumptions.tax.filingStatus' => ['nullable', Rule::in(['single', 'mfj'])],
            'inputs.modelAssumptions.careerTransition' => ['nullable', 'array'],
            'inputs.modelAssumptions.careerTransition.currentJobNoticeWeeks' => ['nullable', 'numeric', 'min:0', 'max:52'],
            'inputs.modelAssumptions.careerTransition.timeOffBetweenJobsWeeks' => ['nullable', 'numeric', 'min:0', 'max:52'],
            'inputs.currentJob' => ['nullable', 'array'],
            'inputs.currentJobs' => ['nullable', 'array', 'max:10'],
            'inputs.currentJobs.*' => ['required', 'array'],
            'inputs.hypotheticalJobs' => ['required', 'array', 'max:10'],
            'inputs.hypotheticalJobs.*' => ['required', 'array'],
            ...self::jobRules('inputs.currentJob', true),
            ...self::jobRules('inputs.currentJobs.*', false),
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
            "{$prefix}.notesMarkdown" => ['nullable', 'string', 'max:200000'],
            "{$prefix}.archived" => ['nullable', 'boolean'],
            "{$prefix}.startDate" => ['nullable', 'date_format:Y-m-d'],
            "{$prefix}.priorJobResignationDate" => ['nullable', 'date_format:Y-m-d'],
            "{$prefix}.transitionOverride" => ['nullable', 'array'],
            "{$prefix}.transitionOverride.currentJobNoticeWeeks" => ['nullable', 'numeric', 'min:0', 'max:52'],
            "{$prefix}.transitionOverride.timeOffBetweenJobsWeeks" => ['nullable', 'numeric', 'min:0', 'max:52'],
            "{$prefix}.retainedCurrentJobIds" => ['nullable', 'array', 'max:10'],
            "{$prefix}.retainedCurrentJobIds.*" => ['string', 'max:120'],
            "{$prefix}.company" => [$required, 'array'],
            "{$prefix}.company.type" => [$required, Rule::in(['public', 'private'])],
            "{$prefix}.company.currentSharePrice" => ['nullable', 'numeric', 'min:0'],
            "{$prefix}.company.fourNineA" => ['nullable', 'numeric', 'min:0'],
            "{$prefix}.company.fullyDilutedShares" => ['nullable', 'numeric', 'min:0'],
            "{$prefix}.company.annualDilutionPct" => ['nullable', 'numeric', 'min:0', 'max:100'],
            "{$prefix}.company.liquidityDate" => ['nullable', 'date_format:Y-m-d'],
            "{$prefix}.company.valuationScenarios" => ['nullable', 'array', 'max:12'],
            "{$prefix}.company.valuationScenarios.*.id" => ['required_with:'.$prefix.'.company.valuationScenarios', 'string', 'max:120'],
            "{$prefix}.company.valuationScenarios.*.label" => ['required_with:'.$prefix.'.company.valuationScenarios', 'string', 'max:160'],
            "{$prefix}.company.valuationScenarios.*.outcome" => ['required_with:'.$prefix.'.company.valuationScenarios', Rule::in(['low', 'medium', 'high'])],
            "{$prefix}.company.valuationScenarios.*.stages" => ['required_with:'.$prefix.'.company.valuationScenarios', 'array', 'min:1', 'max:30'],
            "{$prefix}.company.valuationScenarios.*.stages.*.id" => ['nullable', 'string', 'max:120'],
            "{$prefix}.company.valuationScenarios.*.stages.*.year" => ['required', 'integer', 'min:2000', 'max:2200'],
            "{$prefix}.company.valuationScenarios.*.stages.*.stage" => ['nullable', 'string', 'max:120'],
            "{$prefix}.company.valuationScenarios.*.stages.*.preferredPostMoneyValuation" => ['nullable', 'numeric', 'min:0'],
            "{$prefix}.company.valuationScenarios.*.stages.*.capitalDilutionPct" => ['nullable', 'numeric', 'min:0', 'max:100'],
            "{$prefix}.company.valuationScenarios.*.stages.*.employeePoolDilutionPct" => ['nullable', 'numeric', 'min:0', 'max:100'],
            "{$prefix}.company.valuationScenarios.*.stages.*.commonFmv" => ['nullable', 'numeric', 'min:0'],
            "{$prefix}.company.valuationScenarios.*.stages.*.commonFmvDiscountPct" => ['nullable', 'numeric', 'min:0', 'max:100'],
            "{$prefix}.company.valuationScenarios.*.stages.*.liquidityEvent" => ['nullable', 'boolean'],
            "{$prefix}.comp" => [$required, 'array'],
            "{$prefix}.comp.baseSalary" => ['nullable', 'numeric', 'min:0'],
            "{$prefix}.comp.cashBonus" => ['nullable', 'numeric', 'min:0'],
            "{$prefix}.comp.annualRaisePct" => ['nullable', 'numeric', 'min:0', 'max:100'],
            "{$prefix}.grantTypes" => ['nullable', 'array'],
            "{$prefix}.grantTypes.rsu" => ['nullable', 'boolean'],
            "{$prefix}.grantTypes.options" => ['nullable', 'boolean'],
            "{$prefix}.refresher" => ['nullable', 'array'],
            "{$prefix}.refresher.pctOfBase" => ['nullable', 'numeric', 'min:0', 'max:1000'],
            "{$prefix}.refresher.optionPctOfFullyDilutedShares" => ['nullable', 'numeric', 'min:0', 'max:100'],
            "{$prefix}.refresher.optionType" => ['nullable', Rule::in(['iso'])],
            "{$prefix}.refresher.cadenceYears" => ['nullable', 'integer', 'min:1', 'max:30'],
            "{$prefix}.refresher.firstYearOffset" => ['nullable', 'integer', 'min:0', 'max:30'],
            "{$prefix}.refresher.vestingYears" => ['nullable', 'numeric', 'min:0.25', 'max:10'],
            "{$prefix}.refresher.cliffMonths" => ['nullable', 'integer', 'min:0', 'max:120', self::refresherCliffDoesNotExceedVesting()],
            "{$prefix}.refresher.vestingFrequency" => ['nullable', Rule::in(VestingSchedule::FREQUENCIES)],
            "{$prefix}.rsuGrants" => ['nullable', 'array', 'max:50'],
            "{$prefix}.rsuGrants.*.id" => ['required', 'string', 'max:120'],
            "{$prefix}.rsuGrants.*.kind" => ['required', Rule::in(['hire', 'refresher'])],
            "{$prefix}.rsuGrants.*.grantDate" => ['required', 'date_format:Y-m-d'],
            "{$prefix}.rsuGrants.*.vestingStartDate" => ['nullable', 'date_format:Y-m-d'],
            "{$prefix}.rsuGrants.*.shareCount" => ['nullable', 'numeric', 'min:0'],
            "{$prefix}.rsuGrants.*.grantValue" => ['nullable', 'numeric', 'min:0'],
            "{$prefix}.rsuGrants.*.grantPrice" => ['nullable', 'numeric', 'min:0'],
            "{$prefix}.rsuGrants.*.vestingEvents" => ['nullable', 'array', 'max:240'],
            "{$prefix}.rsuGrants.*.vestingEvents.*.vestDate" => ['required_with:'.$prefix.'.rsuGrants.*.vestingEvents', 'date_format:Y-m-d'],
            "{$prefix}.rsuGrants.*.vestingEvents.*.shareCount" => ['required_with:'.$prefix.'.rsuGrants.*.vestingEvents', 'numeric', 'min:0'],
            "{$prefix}.rsuGrants.*.vestingEvents.*.sourceAwardId" => ['nullable', 'string', 'max:120'],
            "{$prefix}.rsuGrants.*.vestingEvents.*.sourceAwardRowId" => ['nullable', 'integer', 'min:1'],
            "{$prefix}.rsuGrants.*.vestingEvents.*.symbol" => ['nullable', 'string', 'max:32'],
            "{$prefix}.rsuGrants.*.vestingEvents.*.grantPrice" => ['nullable', 'numeric', 'min:0'],
            "{$prefix}.rsuGrants.*.vestingEvents.*.vestPrice" => ['nullable', 'numeric', 'min:0'],
            "{$prefix}.rsuGrants.*.cliffMonths" => ['required', 'integer', 'min:0', 'max:120'],
            "{$prefix}.rsuGrants.*.vestingYears" => ['required', 'numeric', 'min:0.25', 'max:10'],
            "{$prefix}.rsuGrants.*.vestingFrequency" => ['nullable', Rule::in(VestingSchedule::FREQUENCIES)],
            ...self::vestingScheduleRules("{$prefix}.rsuGrants.*.vestingSchedule"),
            "{$prefix}.optionGrants" => ['nullable', 'array', 'max:50'],
            "{$prefix}.optionGrants.*.id" => ['required', 'string', 'max:120'],
            "{$prefix}.optionGrants.*.kind" => ['required', Rule::in(['hire', 'refresher'])],
            "{$prefix}.optionGrants.*.type" => ['required', Rule::in(['iso', 'nso'])],
            "{$prefix}.optionGrants.*.grantDate" => ['required', 'date_format:Y-m-d'],
            "{$prefix}.optionGrants.*.vestingStartDate" => ['nullable', 'date_format:Y-m-d'],
            "{$prefix}.optionGrants.*.shareCount" => ['required', 'numeric', 'min:0'],
            "{$prefix}.optionGrants.*.strike" => ['required', 'numeric', 'min:0'],
            "{$prefix}.optionGrants.*.cliffMonths" => ['required', 'integer', 'min:0', 'max:120'],
            "{$prefix}.optionGrants.*.vestingYears" => ['required', 'numeric', 'min:0.25', 'max:10'],
            "{$prefix}.optionGrants.*.vestingFrequency" => ['nullable', Rule::in(VestingSchedule::FREQUENCIES)],
            "{$prefix}.optionGrants.*.earlyExercise83b" => ['required', 'boolean'],
            ...self::vestingScheduleRules("{$prefix}.optionGrants.*.vestingSchedule"),
            "{$prefix}.growthBands" => [$required, 'array'],
            "{$prefix}.growthBands.lowPct" => ['nullable', 'numeric', 'min:-100', 'max:1000'],
            "{$prefix}.growthBands.mediumPct" => ['nullable', 'numeric', 'min:-100', 'max:1000'],
            "{$prefix}.growthBands.highPct" => ['nullable', 'numeric', 'min:-100', 'max:1000'],
        ];
    }

    /** @return array<string, mixed> */
    private static function vestingScheduleRules(string $prefix): array
    {
        return [
            $prefix => ['nullable', 'array'],
            "{$prefix}.type" => ['nullable', Rule::in(VestingSchedule::SCHEDULE_TYPES)],
            "{$prefix}.presetId" => ['nullable', 'string', 'max:120'],
            "{$prefix}.durationMonths" => ['nullable', 'integer', 'min:1', 'max:120'],
            "{$prefix}.cliffMonths" => ['nullable', 'integer', 'min:0', 'max:120'],
            "{$prefix}.frequency" => ['nullable', Rule::in(VestingSchedule::FREQUENCIES)],
            "{$prefix}.tranches" => ['nullable', 'array', 'max:24'],
            "{$prefix}.tranches.*.month" => ['required_with:'.$prefix.'.tranches', 'integer', 'min:0', 'max:120'],
            "{$prefix}.tranches.*.percent" => ['required_with:'.$prefix.'.tranches', 'numeric', 'min:0', 'max:100'],
        ];
    }

    private static function refresherCliffDoesNotExceedVesting(): Closure
    {
        return static function (string $attribute, mixed $value, Closure $fail): void {
            if (! is_numeric($value)) {
                return;
            }

            $vestingYears = request()->input(str_replace('.cliffMonths', '.vestingYears', $attribute));
            if (! is_numeric($vestingYears)) {
                return;
            }

            if ((int) $value > (float) $vestingYears * 12) {
                $fail('The :attribute must not exceed the refresher vesting duration.');
            }
        };
    }
}
