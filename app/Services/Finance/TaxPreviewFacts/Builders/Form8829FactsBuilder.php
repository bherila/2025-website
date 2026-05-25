<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\FinForm8829Input;
use App\Models\FinanceTool\FinScheduleCInput;
use App\Models\FinanceTool\FinTaxLineAdjustment;
use App\Services\Finance\K1CodeCharacterResolver;
use App\Services\Finance\ScheduleCSummaryService;
use App\Services\Finance\TaxPreviewFacts\Data\Form8829EntityFact;
use App\Services\Finance\TaxPreviewFacts\Data\Form8829Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Form8829LineFact;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;
use Illuminate\Support\Facades\Schema;

class Form8829FactsBuilder extends TaxPreviewFactBuilder
{
    private const int UNASSIGNED_ENTITY_KEY = 0;

    private const array LINE_14_REFS = ['9', '10', '11'];

    private const array LINE_24_REFS = ['16', '17', '18', '19', '20', '21', '22'];

    private const array LINE_30_REFS = ['42'];

    private const array HOME_OFFICE_LINE_MAP = [
        'scho_mortgage_interest' => ['line' => '10', 'label' => 'Mortgage interest'],
        'scho_real_estate_taxes' => ['line' => '11', 'label' => 'Real estate taxes'],
        'scho_insurance' => ['line' => '18', 'label' => 'Insurance'],
        'scho_rent' => ['line' => '19', 'label' => 'Rent'],
        'scho_repairs_maintenance' => ['line' => '20', 'label' => 'Repairs and maintenance'],
        'scho_utilities' => ['line' => '21', 'label' => 'Utilities'],
        'scho_security' => ['line' => '22', 'label' => 'Security system costs'],
        'scho_cleaning' => ['line' => '22', 'label' => 'Cleaning services'],
        'scho_hoa' => ['line' => '22', 'label' => 'HOA fees'],
        'scho_casualty_losses' => ['line' => '9', 'label' => 'Casualty losses'],
        'scho_depreciation' => ['line' => '42', 'label' => 'Depreciation allowable'],
    ];

    private const array HOME_OFFICE_LINE_LABELS = [
        '9' => 'Casualty losses',
        '10' => 'Deductible mortgage interest',
        '11' => 'Real estate taxes',
        '18' => 'Insurance',
        '19' => 'Rent',
        '20' => 'Repairs and maintenance',
        '21' => 'Utilities',
        '22' => 'Other expenses',
        '42' => 'Depreciation allowable',
    ];

    public function __construct(
        K1CodeCharacterResolver $k1CodeCharacterResolver,
        private readonly ScheduleCSummaryService $scheduleCSummaryService,
    ) {
        parent::__construct($k1CodeCharacterResolver);
    }

    public function build(int $userId, int $year): Form8829Facts
    {
        $summary = $this->scheduleCSummaryService->getSummary($userId);
        $yearData = $this->yearData($summary['years'], $year);
        $inputsByEntity = $this->inputsByEntity($userId, $year);
        $scheduleCInputsByEntity = $this->scheduleCInputsByEntity($userId, $year);
        $adjustmentsByEntity = $this->adjustmentsByEntity($userId, $year, 'form_8829');
        $scheduleCAdjustmentsByEntity = $this->adjustmentsByEntity($userId, $year, 'schedule_c');

        if ($yearData === null && $inputsByEntity === []) {
            return Form8829Facts::empty();
        }

        $entities = [];
        $seenEntityIds = [];

        foreach (($yearData['entities'] ?? []) as $entityData) {
            if (! is_array($entityData)) {
                continue;
            }

            $entityId = isset($entityData['entity_id']) ? (int) $entityData['entity_id'] : null;
            $hasInput = $entityId !== null && isset($inputsByEntity[$entityId]);
            if (! $hasInput && $this->sumCategoryTotals($entityData['schedule_c_home_office'] ?? []) === 0.0) {
                continue;
            }

            if ($entityId !== null) {
                $seenEntityIds[] = $entityId;
            }

            $entities[] = $this->entityFact(
                $year,
                $entityData,
                $inputsByEntity[$entityId ?? self::UNASSIGNED_ENTITY_KEY] ?? null,
                $scheduleCInputsByEntity[$entityId ?? self::UNASSIGNED_ENTITY_KEY] ?? null,
                $adjustmentsByEntity[$entityId ?? self::UNASSIGNED_ENTITY_KEY] ?? [],
                $scheduleCAdjustmentsByEntity[$entityId ?? self::UNASSIGNED_ENTITY_KEY] ?? [],
            );
        }

        foreach ($inputsByEntity as $entityId => $input) {
            if (in_array($entityId, $seenEntityIds, true)) {
                continue;
            }

            $entity = FinEmploymentEntity::withoutGlobalScopes()->find($entityId);
            if (! $entity instanceof FinEmploymentEntity || (int) $entity->user_id !== $userId) {
                continue;
            }

            $entities[] = $this->entityFact(
                $year,
                [
                    'entity_id' => $entityId,
                    'entity_name' => $entity->display_name,
                    'schedule_c_income' => [],
                    'schedule_c_expense' => [],
                    'schedule_c_home_office' => [],
                ],
                $input,
                $scheduleCInputsByEntity[$entityId] ?? null,
                $adjustmentsByEntity[$entityId] ?? [],
                $scheduleCAdjustmentsByEntity[$entityId] ?? [],
            );
        }

        return new Form8829Facts(
            entities: $entities,
            line36AllowableHomeOfficeDeductionTotal: $this->sumMoney(array_map(static fn (Form8829EntityFact $entity): float => $entity->line36AllowableHomeOfficeDeduction, $entities)),
            line43OperatingCarryoverToNextYearTotal: $this->sumMoney(array_map(static fn (Form8829EntityFact $entity): float => $entity->line43OperatingCarryoverToNextYear, $entities)),
            line43OperatingCarryoverToNextYearCaTotal: $this->sumMoney(array_map(static fn (Form8829EntityFact $entity): float => $entity->line43OperatingCarryoverToNextYearCa, $entities)),
            line44ExcessCasualtyAndDepreciationCarryoverToNextYearTotal: $this->sumMoney(array_map(static fn (Form8829EntityFact $entity): float => $entity->line44ExcessCasualtyAndDepreciationCarryoverToNextYear, $entities)),
            line44ExcessCasualtyAndDepreciationCarryoverToNextYearCaTotal: $this->sumMoney(array_map(static fn (Form8829EntityFact $entity): float => $entity->line44ExcessCasualtyAndDepreciationCarryoverToNextYearCa, $entities)),
            carryoverToNextYearTotal: $this->sumMoney(array_map(static fn (Form8829EntityFact $entity): float => $entity->carryoverToNextYear, $entities)),
            carryoverToNextYearCaTotal: $this->sumMoney(array_map(static fn (Form8829EntityFact $entity): float => $entity->carryoverToNextYearCa, $entities)),
        );
    }

    /**
     * @param  array<string, mixed>  $entityData
     * @param  array<string, FinTaxLineAdjustment[]>  $adjustmentsByLine
     * @param  array<string, FinTaxLineAdjustment[]>  $scheduleCAdjustmentsByLine
     */
    private function entityFact(
        int $year,
        array $entityData,
        ?FinForm8829Input $input,
        ?FinScheduleCInput $scheduleCInput,
        array $adjustmentsByLine,
        array $scheduleCAdjustmentsByLine,
    ): Form8829EntityFact {
        $entityId = isset($entityData['entity_id']) ? (int) $entityData['entity_id'] : null;
        $entityName = $this->entityName($entityData);
        $method = $input->method ?? 'regular';
        $monthsUsed = min(12, max(1, (int) ($input->months_used ?? 12)));
        $officeSqft = $input?->office_sqft;
        $homeSqft = $input?->home_sqft;
        $businessUseRate = $this->businessUseRate($officeSqft, $homeSqft, $monthsUsed);
        $businessUsePercentage = $this->roundMoney($businessUseRate * 100);

        [$grossReceipts, $returnsAndAllowances] = $this->incomeTotals($entityData);
        if ($scheduleCInput instanceof FinScheduleCInput) {
            $grossReceipts = $this->sumMoney([$grossReceipts, (float) $scheduleCInput->gross_receipts]);
            if ($scheduleCInput->other_income !== null) {
                $grossReceipts = $this->sumMoney([$grossReceipts, (float) $scheduleCInput->other_income]);
            }
            $returnsAndAllowances = $this->sumMoney([$returnsAndAllowances, (float) $scheduleCInput->returns_and_allowances]);
        }
        $expensesBeforeHomeOffice = $this->applyLineAdjustments(
            $this->sumCategoryTotals($entityData['schedule_c_expense'] ?? []),
            $scheduleCAdjustmentsByLine['line_28'] ?? [],
        );
        $line8TentativeProfit = $this->applyLineAdjustments(
            $this->subtractMoney($this->subtractMoney($grossReceipts, $returnsAndAllowances), $expensesBeforeHomeOffice),
            $scheduleCAdjustmentsByLine['line_29'] ?? [],
        );
        $line8TentativeProfit = max(0.0, $line8TentativeProfit);
        $computedHomeOfficeLines = $this->homeOfficeLines($entityData, $businessUseRate, $adjustmentsByLine);
        $homeOfficeLines = $method === 'simplified' ? [] : $computedHomeOfficeLines;
        $line14 = $method === 'regular' ? $this->sumAllowableLines($homeOfficeLines, self::LINE_14_REFS) : 0.0;
        $line15 = max(0.0, $this->subtractMoney($line8TentativeProfit, $line14));
        $line23 = $method === 'regular' ? $this->sumIndirectLines($homeOfficeLines, self::LINE_24_REFS) : 0.0;
        $line24 = $method === 'regular' ? $this->sumAllowableLines($homeOfficeLines, self::LINE_24_REFS) : 0.0;
        $priorYearOpCarryover = $this->roundMoney((float) ($input->prior_year_op_carryover ?? 0.0));
        $line25 = $method === 'regular' ? $priorYearOpCarryover : 0.0;
        $priorYearOpCarryoverCa = $this->roundMoney((float) ($input->prior_year_op_carryover_ca ?? 0.0));
        $priorYearDepreciationCarryover = $this->roundMoney((float) ($input->prior_year_depreciation_carryover ?? 0.0));
        $priorYearDepreciationCarryoverCa = $this->roundMoney((float) ($input->prior_year_depreciation_carryover_ca ?? 0.0));
        $line26 = $method === 'regular' ? $this->sumMoney([$line24, $line25]) : 0.0;
        $line27 = $method === 'regular' ? min($line15, $line26) : 0.0;
        $line28 = $method === 'regular' ? max(0.0, $this->subtractMoney($line15, $line27)) : 0.0;
        $line30 = $method === 'regular' ? $this->sumAllowableLines($homeOfficeLines, self::LINE_30_REFS) : 0.0;
        $line31 = $method === 'regular' ? $priorYearDepreciationCarryover : 0.0;
        $line32 = $method === 'regular' ? $this->sumMoney([$line30, $line31]) : 0.0;
        $line33 = $method === 'regular' ? min($line28, $line32) : 0.0;
        $regularClaim = $method === 'regular' ? $this->sumMoney([$line14, $line27, $line33]) : 0.0;
        $simplifiedDeduction = $this->simplifiedDeduction($officeSqft, $monthsUsed);
        $selectedClaim = $method === 'simplified' ? min($simplifiedDeduction, $line8TentativeProfit) : $regularClaim;
        $line36 = $this->roundMoney($selectedClaim);
        $line36 = $this->applyLineAdjustments($line36, $adjustmentsByLine['line_36'] ?? []);
        $line43 = $method === 'simplified' ? $priorYearOpCarryover : max(0.0, $this->subtractMoney($line26, $line27));
        $line43 = $this->applyLineAdjustments($line43, $adjustmentsByLine['line_43'] ?? []);
        $line44 = $method === 'simplified' ? $priorYearDepreciationCarryover : max(0.0, $this->subtractMoney($line32, $line33));
        $line44 = $this->applyLineAdjustments($line44, $adjustmentsByLine['line_44'] ?? []);
        $line26Ca = $method === 'regular' ? $this->sumMoney([$line24, $priorYearOpCarryoverCa]) : $priorYearOpCarryoverCa;
        $line27Ca = min($line15, $line26Ca);
        $line28Ca = max(0.0, $this->subtractMoney($line15, $line27Ca));
        $line32Ca = $method === 'regular' ? $this->sumMoney([$line30, $priorYearDepreciationCarryoverCa]) : $priorYearDepreciationCarryoverCa;
        $line33Ca = min($line28Ca, $line32Ca);
        $line43Ca = max(0.0, $this->subtractMoney($line26Ca, $line27Ca));
        $line44Ca = max(0.0, $this->subtractMoney($line32Ca, $line33Ca));
        $carryoverToNextYear = $this->sumMoney([$line43, $line44]);
        $carryoverToNextYearCa = $this->sumMoney([$line43Ca, $line44Ca]);
        $line36Sources = $this->lineSources($homeOfficeLines);
        $line43Sources = [];
        $line44Sources = [];

        if ($line25 !== 0.0) {
            $line36Sources[] = $this->priorCarryforwardSource($entityId, $entityName, 'operating', $line25, TaxFactRouting::Form8829Line25);
        }

        if ($line31 !== 0.0) {
            $line36Sources[] = $this->priorCarryforwardSource($entityId, $entityName, 'depreciation', $line31, TaxFactRouting::Form8829Line31);
        }

        if ($method === 'simplified' && $simplifiedDeduction !== 0.0) {
            $line36Sources[] = new TaxFactSource(
                id: 'form-8829-'.$this->entityKey($entityData).'-simplified',
                label: "{$entityName} — simplified home-office deduction",
                amount: $simplifiedDeduction,
                sourceType: TaxFactSourceType::Form8829SimplifiedMethod,
                routing: TaxFactRouting::Form8829Line36,
                routingReason: 'Simplified method uses $5 per square foot, limited to 300 square feet and prorated by months used.',
            );
        }

        if ($line43 !== 0.0) {
            $disallowedSource = new TaxFactSource(
                id: 'form-8829-'.$this->entityKey($entityData).'-line43-carryover',
                label: "{$entityName} — operating expense carryover to next year",
                amount: -$line43,
                sourceType: TaxFactSourceType::ScheduleCHomeOfficeDisallowed,
                routing: TaxFactRouting::Form8829Line43,
                routingReason: 'Operating expenses exceeding the Form 8829 limit carry forward to the next year.',
            );
            if ($method === 'regular') {
                $line36Sources[] = $disallowedSource;
            }
            $line43Sources[] = new TaxFactSource(
                id: 'form-8829-'.$this->entityKey($entityData).'-line43-carryover-positive',
                label: "{$entityName} — operating expense carryover to next year",
                amount: $line43,
                sourceType: TaxFactSourceType::ScheduleCHomeOfficeDisallowed,
                routing: TaxFactRouting::Form8829Line43,
                routingReason: 'Operating expenses exceeding the Form 8829 limit carry forward to the next year.',
            );
        }

        if ($line44 !== 0.0) {
            $disallowedSource = new TaxFactSource(
                id: 'form-8829-'.$this->entityKey($entityData).'-line44-carryover',
                label: "{$entityName} — casualty/depreciation carryover to next year",
                amount: -$line44,
                sourceType: TaxFactSourceType::ScheduleCHomeOfficeDisallowed,
                routing: TaxFactRouting::Form8829Line44,
                routingReason: 'Excess casualty losses and depreciation exceeding the Form 8829 limit carry forward to the next year.',
            );
            if ($method === 'regular') {
                $line36Sources[] = $disallowedSource;
            }
            $line44Sources[] = new TaxFactSource(
                id: 'form-8829-'.$this->entityKey($entityData).'-line44-carryover-positive',
                label: "{$entityName} — casualty/depreciation carryover to next year",
                amount: $line44,
                sourceType: TaxFactSourceType::ScheduleCHomeOfficeDisallowed,
                routing: TaxFactRouting::Form8829Line44,
                routingReason: 'Excess casualty losses and depreciation exceeding the Form 8829 limit carry forward to the next year.',
            );
        }

        foreach ($adjustmentsByLine['line_36'] ?? [] as $adjustment) {
            $line36Sources[] = $this->adjustmentSource($adjustment, TaxFactRouting::Form8829Line36);
        }

        foreach ($adjustmentsByLine['line_43'] ?? [] as $adjustment) {
            $line43Sources[] = $this->adjustmentSource($adjustment, TaxFactRouting::Form8829Line43);
        }

        foreach ($adjustmentsByLine['line_44'] ?? [] as $adjustment) {
            $line44Sources[] = $this->adjustmentSource($adjustment, TaxFactRouting::Form8829Line44);
        }

        return new Form8829EntityFact(
            entityId: $entityId,
            entityName: $entityName,
            method: $method,
            officeSqft: $officeSqft,
            homeSqft: $homeSqft,
            monthsUsed: $monthsUsed,
            businessUsePercentage: $businessUsePercentage,
            priorYearOpCarryover: $priorYearOpCarryover,
            priorYearOpCarryoverCa: $priorYearOpCarryoverCa,
            priorYearDepreciationCarryover: $priorYearDepreciationCarryover,
            priorYearDepreciationCarryoverCa: $priorYearDepreciationCarryoverCa,
            line1OfficeSqft: $this->roundMoney((float) ($officeSqft ?? 0.0)),
            line2HomeSqft: $this->roundMoney((float) ($homeSqft ?? 0.0)),
            line3BusinessUsePercentage: $businessUsePercentage,
            line7BusinessUsePercentage: $businessUsePercentage,
            line8TentativeProfit: $line8TentativeProfit,
            homeOfficeLines: $homeOfficeLines,
            line14DeductibleMortgageInterestAndTaxes: $line14,
            line15OperatingExpenseLimit: $line15,
            line23OperatingExpensesTotal: $line23,
            line24AllowableOperatingIndirectExpenses: $line24,
            line25PriorYearOpCarryover: $line25,
            line26TotalOperatingExpenseClaim: $line26,
            line27AllowableOperatingExpenses: $this->roundMoney($line27),
            line28ExcessCasualtyAndDepreciationLimit: $line28,
            line30Depreciation: $line30,
            line31PriorYearExcessCasualtyAndDepreciationCarryover: $line31,
            line32TotalExcessCasualtyAndDepreciation: $line32,
            line33AllowableExcessCasualtyAndDepreciation: $line33,
            line36AllowableHomeOfficeDeduction: $line36,
            line43OperatingCarryoverToNextYear: $line43,
            line43OperatingCarryoverToNextYearCa: $this->roundMoney($line43Ca),
            line44ExcessCasualtyAndDepreciationCarryoverToNextYear: $line44,
            line44ExcessCasualtyAndDepreciationCarryoverToNextYearCa: $this->roundMoney($line44Ca),
            carryoverToNextYear: $carryoverToNextYear,
            carryoverToNextYearCa: $this->roundMoney($carryoverToNextYearCa),
            regularDeduction: $regularClaim,
            simplifiedDeduction: $simplifiedDeduction,
            limitationReason: $this->limitationReason($selectedClaim, $line8TentativeProfit, $line36, $method),
            line36Sources: $line36Sources,
            line43Sources: $line43Sources,
            line44Sources: $line44Sources,
        );
    }

    /**
     * @param  array<string, mixed>  $entityData
     * @param  array<string, FinTaxLineAdjustment[]>  $adjustmentsByLine
     * @return Form8829LineFact[]
     */
    private function homeOfficeLines(array $entityData, float $businessUseRate, array $adjustmentsByLine): array
    {
        /**
         * @var array<string, array{label:string,directExpense:float,indirectExpense:float,allowable:float,sources:TaxFactSource[]}> $linesByRef
         */
        $linesByRef = [];
        $lines = [];

        foreach (($entityData['schedule_c_home_office'] ?? []) as $category => $categoryData) {
            if (! is_array($categoryData)) {
                continue;
            }

            $mapping = self::HOME_OFFICE_LINE_MAP[(string) $category] ?? ['line' => '22', 'label' => (string) ($categoryData['label'] ?? $category)];
            $line = (string) $mapping['line'];
            $indirectExpense = $this->parseMoney($categoryData['total'] ?? null) ?? 0.0;
            $baseAllowable = $this->roundMoney($indirectExpense * $businessUseRate);

            if (! isset($linesByRef[$line])) {
                $linesByRef[$line] = [
                    'label' => self::HOME_OFFICE_LINE_LABELS[$line],
                    'directExpense' => 0.0,
                    'indirectExpense' => 0.0,
                    'allowable' => 0.0,
                    'sources' => [],
                ];
            }

            $linesByRef[$line]['indirectExpense'] = $this->sumMoney([$linesByRef[$line]['indirectExpense'], $indirectExpense]);
            $linesByRef[$line]['allowable'] = $this->sumMoney([$linesByRef[$line]['allowable'], $baseAllowable]);
            $linesByRef[$line]['sources'][] = new TaxFactSource(
                id: 'form-8829-'.$this->entityKey($entityData).'-'.$category,
                label: $this->entityName($entityData).' — '.$mapping['label'],
                amount: $baseAllowable,
                sourceType: TaxFactSourceType::Form8829HomeOfficeExpense,
                routing: $this->routingForLine($line),
                routingReason: 'Tagged home-office transactions are multiplied by the business-use percentage for Form 8829.',
                notes: 'Transactions: '.$this->transactionCount($categoryData['transactions'] ?? []),
            );
        }

        foreach ($linesByRef as $line => $lineData) {
            $lineRef = 'line_'.$line;
            $sources = $lineData['sources'];

            foreach ($adjustmentsByLine[$lineRef] ?? [] as $adjustment) {
                $sources[] = $this->adjustmentSource($adjustment, $this->routingForLine($line));
            }

            $lines[] = new Form8829LineFact(
                lineRef: $line,
                label: $lineData['label'],
                directExpense: $this->roundMoney($lineData['directExpense']),
                indirectExpense: $this->roundMoney($lineData['indirectExpense']),
                allowable: $this->applyLineAdjustments($lineData['allowable'], $adjustmentsByLine[$lineRef] ?? []),
                sources: $sources,
            );
        }

        return $lines;
    }

    /**
     * @param  Form8829LineFact[]  $lines
     * @param  string[]  $lineRefs
     */
    private function sumAllowableLines(array $lines, array $lineRefs): float
    {
        return $this->sumMoney(array_map(
            static fn (Form8829LineFact $line): float => in_array($line->lineRef, $lineRefs, true) ? $line->allowable : 0.0,
            $lines,
        ));
    }

    /**
     * @param  Form8829LineFact[]  $lines
     * @param  string[]  $lineRefs
     */
    private function sumIndirectLines(array $lines, array $lineRefs): float
    {
        return $this->sumMoney(array_map(
            static fn (Form8829LineFact $line): float => in_array($line->lineRef, $lineRefs, true) ? $line->indirectExpense : 0.0,
            $lines,
        ));
    }

    /**
     * @return array<int, FinForm8829Input>
     */
    private function inputsByEntity(int $userId, int $year): array
    {
        return FinForm8829Input::withoutGlobalScopes()
            ->where('user_id', $userId)
            ->where('tax_year', $year)
            ->get()
            ->keyBy('employment_entity_id')
            ->all();
    }

    /**
     * @return array<int, FinScheduleCInput>
     */
    private function scheduleCInputsByEntity(int $userId, int $year): array
    {
        if (! Schema::hasTable('fin_schedule_c_inputs')) {
            return [];
        }

        return FinScheduleCInput::withoutGlobalScopes()
            ->where('user_id', $userId)
            ->where('tax_year', $year)
            ->get()
            ->keyBy('employment_entity_id')
            ->all();
    }

    /**
     * @return array<int, array<string, FinTaxLineAdjustment[]>>
     */
    private function adjustmentsByEntity(int $userId, int $year, string $form): array
    {
        $result = [];

        $adjustments = FinTaxLineAdjustment::withoutGlobalScopes()
            ->where('user_id', $userId)
            ->where('tax_year', $year)
            ->where('form', $form)
            ->whereIn('status', ['open', 'applied'])
            ->orderBy('id')
            ->get();

        foreach ($adjustments as $adjustment) {
            $entityKey = (int) ($adjustment->entity_id ?? self::UNASSIGNED_ENTITY_KEY);
            $lineKey = $this->normalizeLineRef($adjustment->line_ref);
            $result[$entityKey][$lineKey][] = $adjustment;
        }

        return $result;
    }

    /**
     * @param  array<int, array<string, mixed>>  $years
     * @return array<string, mixed>|null
     */
    private function yearData(array $years, int $year): ?array
    {
        foreach ($years as $yearData) {
            if ((int) ($yearData['year'] ?? 0) === $year) {
                return $yearData;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $entityData
     * @return array{0:float,1:float}
     */
    private function incomeTotals(array $entityData): array
    {
        $grossReceipts = 0.0;
        $returnsAndAllowances = 0.0;

        foreach (($entityData['schedule_c_income'] ?? []) as $category => $categoryData) {
            if (! is_array($categoryData)) {
                continue;
            }

            $amount = $this->parseMoney($categoryData['total'] ?? null) ?? 0.0;
            if ((string) $category === 'business_returns') {
                $returnsAndAllowances = $this->sumMoney([$returnsAndAllowances, abs($amount)]);
            } else {
                $grossReceipts = $this->sumMoney([$grossReceipts, $amount]);
            }
        }

        return [$grossReceipts, $returnsAndAllowances];
    }

    /**
     * @param  array<string, mixed>  $categories
     */
    private function sumCategoryTotals(array $categories): float
    {
        $totals = [];
        foreach ($categories as $category) {
            $totals[] = is_array($category) ? ($this->parseMoney($category['total'] ?? null) ?? 0.0) : 0.0;
        }

        return $this->sumMoney($totals);
    }

    private function businessUseRate(?float $officeSqft, ?float $homeSqft, int $monthsUsed): float
    {
        if (($officeSqft ?? 0.0) <= 0.0 || ($homeSqft ?? 0.0) <= 0.0) {
            return 1.0;
        }

        return min(1.0, max(0.0, ($officeSqft / $homeSqft) * ($monthsUsed / 12)));
    }

    private function simplifiedDeduction(?float $officeSqft, int $monthsUsed): float
    {
        if (($officeSqft ?? 0.0) <= 0.0) {
            return 0.0;
        }

        // The simplified method uses the user's average monthly office square footage, capped at 300 sq ft.
        return $this->roundMoney(min((float) $officeSqft, 300.0) * 5.0 * ($monthsUsed / 12));
    }

    /**
     * @param  FinTaxLineAdjustment[]  $adjustments
     */
    private function applyLineAdjustments(float $computed, array $adjustments): float
    {
        $value = $computed;

        foreach ($adjustments as $adjustment) {
            if ($adjustment->kind === 'override' && $adjustment->amount !== null) {
                $value = (float) $adjustment->amount;
            } elseif ($adjustment->kind === 'adjustment' && $adjustment->amount !== null) {
                $value = $this->sumMoney([$value, (float) $adjustment->amount]);
            }
        }

        return $this->roundMoney($value);
    }

    private function adjustmentSource(FinTaxLineAdjustment $adjustment, ?TaxFactRouting $routing): TaxFactSource
    {
        return new TaxFactSource(
            id: 'tax-line-adjustment-'.$adjustment->id,
            label: ucfirst(str_replace('_', ' ', $adjustment->kind)),
            amount: $this->roundMoney((float) ($adjustment->amount ?? 0.0)),
            sourceType: $this->sourceTypeForAdjustment($adjustment),
            routing: $routing,
            routingReason: 'User-entered tax-line '.$adjustment->kind.'.',
            notes: $adjustment->description,
            isReviewed: $adjustment->status !== 'open',
            reviewStatus: $adjustment->status,
            reviewAction: $adjustment->kind === 'follow_up_flag' ? 'follow_up' : null,
        );
    }

    private function priorCarryforwardSource(?int $entityId, string $entityName, string $kind, float $amount, TaxFactRouting $routing): TaxFactSource
    {
        return new TaxFactSource(
            id: "form-8829-{$entityId}-prior-{$kind}",
            label: "{$entityName} — prior-year {$kind} carryforward",
            amount: $amount,
            sourceType: TaxFactSourceType::Form8829PriorYearCarryforward,
            routing: $routing,
            routingReason: 'User-entered prior-year home-office carryforward is included in the regular-method Form 8829 limitation.',
        );
    }

    /**
     * @param  Form8829LineFact[]  $lines
     * @return TaxFactSource[]
     */
    private function lineSources(array $lines): array
    {
        $sources = [];

        foreach ($lines as $line) {
            array_push($sources, ...$line->sources);
        }

        return $sources;
    }

    private function sourceTypeForAdjustment(FinTaxLineAdjustment $adjustment): TaxFactSourceType
    {
        return match ($adjustment->kind) {
            'override' => TaxFactSourceType::UserOverride,
            'supporting_detail' => TaxFactSourceType::UserSupportingDetail,
            'follow_up_flag' => TaxFactSourceType::UserFollowUpFlag,
            default => TaxFactSourceType::UserAdjustment,
        };
    }

    private function routingForLine(string $line): ?TaxFactRouting
    {
        return match ($line) {
            '18' => TaxFactRouting::Form8829Line18,
            '19' => TaxFactRouting::Form8829Line19,
            '20' => TaxFactRouting::Form8829Line20,
            '21' => TaxFactRouting::Form8829Line21,
            '22' => TaxFactRouting::Form8829Line22,
            '25' => TaxFactRouting::Form8829Line25,
            '31' => TaxFactRouting::Form8829Line31,
            '36' => TaxFactRouting::Form8829Line36,
            '42' => TaxFactRouting::Form8829Line42,
            '43' => TaxFactRouting::Form8829Line43,
            '44' => TaxFactRouting::Form8829Line44,
            default => null,
        };
    }

    private function normalizeLineRef(string $lineRef): string
    {
        $normalized = strtolower(trim($lineRef));
        $normalized = str_replace(['form_8829.', '8829.', 'l.'], '', $normalized);
        $normalized = str_replace(['-', ' '], '_', $normalized);

        if (preg_match('/^(?:line_)?(\d+)$/', $normalized, $matches) === 1) {
            return 'line_'.$matches[1];
        }

        return $normalized;
    }

    private function transactionCount(mixed $transactions): int
    {
        return is_array($transactions) ? count($transactions) : 0;
    }

    /**
     * @param  array<string, mixed>  $entityData
     */
    private function entityKey(array $entityData): string
    {
        return isset($entityData['entity_id']) ? (string) $entityData['entity_id'] : 'unassigned';
    }

    /**
     * @param  array<string, mixed>  $entityData
     */
    private function entityName(array $entityData): string
    {
        $name = $entityData['entity_name'] ?? null;

        return is_string($name) && trim($name) !== '' ? $name : 'Unassigned Schedule C business';
    }

    private function limitationReason(float $claim, float $limit, float $allowed, string $method): string
    {
        if ($claim === 0.0) {
            return 'No home-office deduction claimed for this entity.';
        }

        if ($limit <= 0.0) {
            return 'Home-office deduction is disallowed because Schedule C tentative profit is not positive.';
        }

        if ($allowed < $claim) {
            return "Home-office deduction is limited to Schedule C tentative profit under the {$method} method.";
        }

        return "Home-office deduction is fully allowable under the {$method} method.";
    }
}
