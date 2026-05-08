<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\FinForm8829Input;
use App\Models\FinanceTool\FinTaxLineAdjustment;
use App\Services\Finance\K1CodeCharacterResolver;
use App\Services\Finance\ScheduleCSummaryService;
use App\Services\Finance\TaxPreviewFacts\Data\Form8829EntityFact;
use App\Services\Finance\TaxPreviewFacts\Data\Form8829Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Form8829LineFact;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;

class Form8829FactsBuilder extends TaxPreviewFactBuilder
{
    private const array HOME_OFFICE_LINE_MAP = [
        'scho_mortgage_interest' => ['line' => '10', 'label' => 'Mortgage interest'],
        'scho_real_estate_taxes' => ['line' => '11', 'label' => 'Real estate taxes'],
        'scho_insurance' => ['line' => '19', 'label' => 'Insurance'],
        'scho_rent' => ['line' => '20', 'label' => 'Rent'],
        'scho_utilities' => ['line' => '21', 'label' => 'Utilities'],
        'scho_repairs_maintenance' => ['line' => '22', 'label' => 'Repairs and maintenance'],
        'scho_security' => ['line' => '23', 'label' => 'Security system costs'],
        'scho_cleaning' => ['line' => '23', 'label' => 'Cleaning services'],
        'scho_hoa' => ['line' => '23', 'label' => 'HOA fees'],
        'scho_casualty_losses' => ['line' => '9', 'label' => 'Casualty losses'],
        'scho_depreciation' => ['line' => '41', 'label' => 'Depreciation'],
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
        $adjustmentsByEntity = $this->adjustmentsByEntity($userId, $year);

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
                $inputsByEntity[$entityId ?? 0] ?? null,
                $adjustmentsByEntity[$entityId ?? 0] ?? [],
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
                $adjustmentsByEntity[$entityId] ?? [],
            );
        }

        return new Form8829Facts(
            entities: $entities,
            line36AllowableHomeOfficeDeductionTotal: $this->sumMoney(array_map(static fn (Form8829EntityFact $entity): float => $entity->line36AllowableHomeOfficeDeduction, $entities)),
            line43CarryoverToNextYearTotal: $this->sumMoney(array_map(static fn (Form8829EntityFact $entity): float => $entity->line43CarryoverToNextYear, $entities)),
            line43CarryoverToNextYearCaTotal: $this->sumMoney(array_map(static fn (Form8829EntityFact $entity): float => $entity->line43CarryoverToNextYearCa, $entities)),
        );
    }

    /**
     * @param  array<string, mixed>  $entityData
     * @param  array<string, FinTaxLineAdjustment[]>  $adjustmentsByLine
     */
    private function entityFact(int $year, array $entityData, ?FinForm8829Input $input, array $adjustmentsByLine): Form8829EntityFact
    {
        $entityId = isset($entityData['entity_id']) ? (int) $entityData['entity_id'] : null;
        $entityName = $this->entityName($entityData);
        $method = $input->method ?? 'regular';
        $monthsUsed = min(12, max(1, (int) ($input->months_used ?? 12)));
        $officeSqft = $input?->office_sqft;
        $homeSqft = $input?->home_sqft;
        $businessUseRate = $this->businessUseRate($officeSqft, $homeSqft, $monthsUsed);
        $businessUsePercentage = $this->roundMoney($businessUseRate * 100);

        [$grossReceipts, $returnsAndAllowances] = $this->incomeTotals($entityData);
        $expensesBeforeHomeOffice = $this->sumCategoryTotals($entityData['schedule_c_expense'] ?? []);
        $line8TentativeProfit = max(0.0, $this->subtractMoney($this->subtractMoney($grossReceipts, $returnsAndAllowances), $expensesBeforeHomeOffice));
        $homeOfficeLines = $this->homeOfficeLines($entityData, $businessUseRate, $adjustmentsByLine);
        $line24 = $this->sumMoney(array_map(static fn (Form8829LineFact $line): float => $line->indirectExpense, $homeOfficeLines));
        $line25 = $this->sumMoney(array_map(static fn (Form8829LineFact $line): float => $line->allowable, $homeOfficeLines));
        $line26 = $this->roundMoney((float) ($input->prior_year_op_carryover ?? 0.0));
        $priorYearOpCarryoverCa = $this->roundMoney((float) ($input->prior_year_op_carryover_ca ?? 0.0));
        $priorYearDepreciationCarryover = $this->roundMoney((float) ($input->prior_year_depreciation_carryover ?? 0.0));
        $priorYearDepreciationCarryoverCa = $this->roundMoney((float) ($input->prior_year_depreciation_carryover_ca ?? 0.0));
        $regularClaim = $this->sumMoney([$line25, $line26, $priorYearDepreciationCarryover]);
        $simplifiedDeduction = $this->simplifiedDeduction($officeSqft, $monthsUsed);
        $selectedClaim = $method === 'simplified' ? $simplifiedDeduction : $regularClaim;
        $line36 = $this->roundMoney(min($selectedClaim, $line8TentativeProfit));
        $line36 = $this->applyLineAdjustments($line36, $adjustmentsByLine['line_36'] ?? []);
        $line27 = $method === 'simplified' ? 0.0 : min($this->sumMoney([$line25, $line26]), $line36);
        $line43 = $method === 'simplified'
            ? $this->sumMoney([$line26, $priorYearDepreciationCarryover])
            : max(0.0, $this->subtractMoney($regularClaim, $line36));
        $line43 = $this->applyLineAdjustments($line43, $adjustmentsByLine['line_43'] ?? []);
        $caClaim = $method === 'simplified'
            ? $this->sumMoney([$priorYearOpCarryoverCa, $priorYearDepreciationCarryoverCa])
            : $this->sumMoney([$line25, $priorYearOpCarryoverCa, $priorYearDepreciationCarryoverCa]);
        $line43Ca = $method === 'simplified' ? $caClaim : max(0.0, $this->subtractMoney($caClaim, min($caClaim, $line8TentativeProfit)));
        $line36Sources = $this->lineSources($homeOfficeLines);
        $line43Sources = [];

        if ($line26 !== 0.0) {
            $line36Sources[] = $this->priorCarryforwardSource($entityId, $entityName, 'operating', $line26);
        }

        if ($priorYearDepreciationCarryover !== 0.0) {
            $line36Sources[] = $this->priorCarryforwardSource($entityId, $entityName, 'depreciation', $priorYearDepreciationCarryover);
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

        if ($method === 'regular' && $line43 !== 0.0) {
            $disallowedSource = new TaxFactSource(
                id: 'form-8829-'.$this->entityKey($entityData).'-line43-carryover',
                label: "{$entityName} — home-office carryover to next year",
                amount: -$line43,
                sourceType: TaxFactSourceType::ScheduleCHomeOfficeDisallowed,
                routing: TaxFactRouting::Form8829Line43,
                routingReason: 'Home-office expenses exceeding the Schedule C tentative-profit limit carry forward to the next year.',
            );
            $line36Sources[] = $disallowedSource;
            $line43Sources[] = new TaxFactSource(
                id: 'form-8829-'.$this->entityKey($entityData).'-line43-carryover-positive',
                label: "{$entityName} — home-office carryover to next year",
                amount: $line43,
                sourceType: TaxFactSourceType::ScheduleCHomeOfficeDisallowed,
                routing: TaxFactRouting::Form8829Line43,
                routingReason: 'Home-office expenses exceeding the Schedule C tentative-profit limit carry forward to the next year.',
            );
        }

        foreach ($adjustmentsByLine['line_36'] ?? [] as $adjustment) {
            $line36Sources[] = $this->adjustmentSource($adjustment, TaxFactRouting::Form8829Line36);
        }

        foreach ($adjustmentsByLine['line_43'] ?? [] as $adjustment) {
            $line43Sources[] = $this->adjustmentSource($adjustment, TaxFactRouting::Form8829Line43);
        }

        return new Form8829EntityFact(
            entityId: $entityId,
            entityName: $entityName,
            method: $method,
            officeSqft: $officeSqft,
            homeSqft: $homeSqft,
            monthsUsed: $monthsUsed,
            businessUsePercentage: $businessUsePercentage,
            priorYearOpCarryover: $line26,
            priorYearOpCarryoverCa: $priorYearOpCarryoverCa,
            priorYearDepreciationCarryover: $priorYearDepreciationCarryover,
            priorYearDepreciationCarryoverCa: $priorYearDepreciationCarryoverCa,
            line1OfficeSqft: $this->roundMoney((float) ($officeSqft ?? 0.0)),
            line2HomeSqft: $this->roundMoney((float) ($homeSqft ?? 0.0)),
            line3BusinessUsePercentage: $businessUsePercentage,
            line7BusinessUsePercentage: $businessUsePercentage,
            line8TentativeProfit: $line8TentativeProfit,
            homeOfficeLines: $homeOfficeLines,
            line24IndirectExpensesTotal: $line24,
            line25AllowableIndirectExpenses: $line25,
            line26PriorYearOpCarryover: $line26,
            line27AllowableOperatingExpenses: $this->roundMoney($line27),
            line36AllowableHomeOfficeDeduction: $line36,
            line41ExcessCasualtyAndDepreciation: max(0.0, $this->subtractMoney($regularClaim, $this->sumMoney([$line25, $line26]))),
            line42DepreciationCarryover: min($priorYearDepreciationCarryover, $line43),
            line43CarryoverToNextYear: $line43,
            line43CarryoverToNextYearCa: $this->roundMoney($line43Ca),
            regularDeduction: $regularClaim,
            simplifiedDeduction: $simplifiedDeduction,
            limitationReason: $this->limitationReason($selectedClaim, $line8TentativeProfit, $line36, $method),
            line36Sources: $line36Sources,
            line43Sources: $line43Sources,
        );
    }

    /**
     * @param  array<string, mixed>  $entityData
     * @param  array<string, FinTaxLineAdjustment[]>  $adjustmentsByLine
     * @return Form8829LineFact[]
     */
    private function homeOfficeLines(array $entityData, float $businessUseRate, array $adjustmentsByLine): array
    {
        $lines = [];

        foreach (($entityData['schedule_c_home_office'] ?? []) as $category => $categoryData) {
            if (! is_array($categoryData)) {
                continue;
            }

            $mapping = self::HOME_OFFICE_LINE_MAP[(string) $category] ?? ['line' => '23', 'label' => (string) ($categoryData['label'] ?? $category)];
            $lineRef = 'line_'.$mapping['line'];
            $indirectExpense = $this->parseMoney($categoryData['total'] ?? null) ?? 0.0;
            $allowable = $this->roundMoney($indirectExpense * $businessUseRate);
            $allowable = $this->applyLineAdjustments($allowable, $adjustmentsByLine[$lineRef] ?? []);
            $sources = [
                new TaxFactSource(
                    id: 'form-8829-'.$this->entityKey($entityData).'-'.$category,
                    label: $this->entityName($entityData).' — '.$mapping['label'],
                    amount: $this->roundMoney($indirectExpense),
                    sourceType: TaxFactSourceType::Form8829HomeOfficeExpense,
                    routing: $this->routingForLine($mapping['line']),
                    routingReason: 'Tagged home-office transactions are multiplied by the business-use percentage for Form 8829.',
                    notes: 'Transactions: '.$this->transactionCount($categoryData['transactions'] ?? []),
                ),
            ];

            foreach ($adjustmentsByLine[$lineRef] ?? [] as $adjustment) {
                $sources[] = $this->adjustmentSource($adjustment, $this->routingForLine($mapping['line']));
            }

            $lines[] = new Form8829LineFact(
                lineRef: $mapping['line'],
                label: $mapping['label'],
                directExpense: 0.0,
                indirectExpense: $this->roundMoney($indirectExpense),
                allowable: $allowable,
                sources: $sources,
            );
        }

        return $lines;
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
     * @return array<int, array<string, FinTaxLineAdjustment[]>>
     */
    private function adjustmentsByEntity(int $userId, int $year): array
    {
        $result = [];

        $adjustments = FinTaxLineAdjustment::withoutGlobalScopes()
            ->where('user_id', $userId)
            ->where('tax_year', $year)
            ->where('form', 'form_8829')
            ->whereIn('status', ['open', 'applied'])
            ->orderBy('id')
            ->get();

        foreach ($adjustments as $adjustment) {
            $entityKey = (int) ($adjustment->entity_id ?? 0);
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

    private function priorCarryforwardSource(?int $entityId, string $entityName, string $kind, float $amount): TaxFactSource
    {
        return new TaxFactSource(
            id: "form-8829-{$entityId}-prior-{$kind}",
            label: "{$entityName} — prior-year {$kind} carryforward",
            amount: $amount,
            sourceType: TaxFactSourceType::Form8829PriorYearCarryforward,
            routing: TaxFactRouting::Form8829Line36,
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
            '19' => TaxFactRouting::Form8829Line19,
            '21' => TaxFactRouting::Form8829Line21,
            '25' => TaxFactRouting::Form8829Line25,
            '36' => TaxFactRouting::Form8829Line36,
            '43' => TaxFactRouting::Form8829Line43,
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
