<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Models\FinanceTool\FinTaxLineAdjustment;
use App\Services\Finance\K1CodeCharacterResolver;
use App\Services\Finance\ScheduleCSummaryService;
use App\Services\Finance\TaxPreviewFacts\Data\Form8829EntityFact;
use App\Services\Finance\TaxPreviewFacts\Data\Form8829Facts;
use App\Services\Finance\TaxPreviewFacts\Data\QuarterTotals;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleCEntityFact;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleCFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleCFlaggedExpenseRowFact;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;

class ScheduleCFactsBuilder extends TaxPreviewFactBuilder
{
    private const int UNASSIGNED_ENTITY_KEY = 0;

    public function __construct(
        K1CodeCharacterResolver $k1CodeCharacterResolver,
        private readonly ScheduleCSummaryService $scheduleCSummaryService,
    ) {
        parent::__construct($k1CodeCharacterResolver);
    }

    public function build(int $userId, int $year, ?Form8829Facts $form8829 = null): ScheduleCFacts
    {
        $form8829 ??= Form8829Facts::empty();
        $summary = $this->scheduleCSummaryService->getSummary($userId);
        $yearData = $this->yearData($summary['years'], $year);

        if ($yearData === null) {
            return ScheduleCFacts::empty();
        }

        $entities = [];
        $entitiesByKey = [];
        $line31Sources = [];
        $adjustmentsByEntity = $this->adjustmentsByEntity($userId, $year);

        foreach (($yearData['entities'] ?? []) as $entityData) {
            if (! is_array($entityData)) {
                continue;
            }

            $entityId = isset($entityData['entity_id']) ? (int) $entityData['entity_id'] : null;
            $entity = $this->entityFact($entityData, $form8829->entityFor($entityId), $adjustmentsByEntity[$entityId ?? self::UNASSIGNED_ENTITY_KEY] ?? []);
            $entities[] = $entity;
            $entitiesByKey[$this->entityKey($entityData)] = $entity;
            $line31Sources[] = new TaxFactSource(
                id: $this->entitySourceId($entityData, 'line31'),
                label: "{$entity->entityName} — Schedule C net profit",
                amount: $entity->netProfit,
                sourceType: TaxFactSourceType::ScheduleCNetProfit,
                routing: TaxFactRouting::ScheduleCLine31,
                routingReason: 'Schedule C line 31 is gross income less ordinary expenses and allowable home-office deduction.',
                notes: "Gross {$entity->grossReceipts}; returns {$entity->returnsAndAllowances}; expenses {$entity->expenses}; home office {$entity->homeOfficeAllowable}",
            );
        }

        return new ScheduleCFacts(
            entities: $entities,
            grossReceiptsTotal: $this->sumMoney(array_map(static fn (ScheduleCEntityFact $entity): float => $entity->grossReceipts, $entities)),
            returnsAndAllowancesTotal: $this->sumMoney(array_map(static fn (ScheduleCEntityFact $entity): float => $entity->returnsAndAllowances, $entities)),
            grossIncomeAfterReturns: $this->sumMoney(array_map(static fn (ScheduleCEntityFact $entity): float => $entity->grossIncomeAfterReturns, $entities)),
            expensesTotal: $this->sumMoney(array_map(static fn (ScheduleCEntityFact $entity): float => $entity->expenses, $entities)),
            tentativeProfitBeforeHomeOffice: $this->sumMoney(array_map(static fn (ScheduleCEntityFact $entity): float => $entity->tentativeProfitBeforeHomeOffice, $entities)),
            homeOfficeAllowable: $this->sumMoney(array_map(static fn (ScheduleCEntityFact $entity): float => $entity->homeOfficeAllowable, $entities)),
            homeOfficeDisallowed: $this->sumMoney(array_map(static fn (ScheduleCEntityFact $entity): float => $entity->homeOfficeDisallowed, $entities)),
            homeOfficePriorCarryforward: $this->sumMoney(array_map(static fn (ScheduleCEntityFact $entity): float => $entity->homeOfficePriorCarryforward, $entities)),
            homeOfficeCarryoverToNextYear: $this->sumMoney(array_map(static fn (ScheduleCEntityFact $entity): float => $entity->homeOfficeCarryoverToNextYear, $entities)),
            netProfit: $this->sumMoney(array_map(static fn (ScheduleCEntityFact $entity): float => $entity->netProfit, $entities)),
            netProfitCumulativeByQuarter: $this->netProfitCumulativeByQuarter($yearData, $form8829, $entitiesByKey),
            netProfitRoutedToSchedule1: $this->sumMoney(array_map(static fn (ScheduleCEntityFact $entity): float => $entity->netProfit, $entities)),
            line31Sources: $line31Sources,
        );
    }

    /**
     * @param  array<string, mixed>  $yearData
     * @param  array<string, ScheduleCEntityFact>  $entitiesByKey
     */
    private function netProfitCumulativeByQuarter(array $yearData, Form8829Facts $form8829, array $entitiesByKey): QuarterTotals
    {
        $quarters = ['q1' => 0.0, 'q2' => 0.0, 'q3' => 0.0, 'q4' => 0.0];

        foreach (($yearData['entities'] ?? []) as $entityData) {
            if (! is_array($entityData)) {
                continue;
            }

            $entity = $entitiesByKey[$this->entityKey($entityData)] ?? null;
            if (! $entity instanceof ScheduleCEntityFact) {
                continue;
            }

            $quarterSums = [
                'q1' => ['income' => 0.0, 'expense' => 0.0],
                'q2' => ['income' => 0.0, 'expense' => 0.0],
                'q3' => ['income' => 0.0, 'expense' => 0.0],
                'q4' => ['income' => 0.0, 'expense' => 0.0],
            ];
            $quarterSums = $this->addTransactionsByQuarter($quarterSums, $entityData['schedule_c_income'] ?? [], 'income');
            $quarterSums = $this->addTransactionsByQuarter($quarterSums, $entityData['schedule_c_expense'] ?? [], 'expense');

            $form8829Entity = $form8829->entityFor($entity->entityId);
            $homeOfficeAllowable = $form8829Entity instanceof Form8829EntityFact
                ? $form8829Entity->line36AllowableHomeOfficeDeduction
                : $entity->homeOfficeAllowable;
            $preHomeOfficeNet = 0.0;
            foreach ($quarterSums as $quarter) {
                $preHomeOfficeNet = $this->sumMoney([$preHomeOfficeNet, $this->subtractMoney($quarter['income'], $quarter['expense'])]);
            }
            $homeOfficeScale = $preHomeOfficeNet !== 0.0 ? $homeOfficeAllowable / $preHomeOfficeNet : 0.0;
            $q1GrossNet = $this->subtractMoney($quarterSums['q1']['income'], $quarterSums['q1']['expense']);
            $q2GrossNet = $this->subtractMoney($quarterSums['q2']['income'], $quarterSums['q2']['expense']);
            $q3GrossNet = $this->subtractMoney($quarterSums['q3']['income'], $quarterSums['q3']['expense']);
            $q1Net = $this->subtractMoney($q1GrossNet, $this->roundMoney($q1GrossNet * $homeOfficeScale));
            $q2Net = $this->subtractMoney($q2GrossNet, $this->roundMoney($q2GrossNet * $homeOfficeScale));
            $q3Net = $this->subtractMoney($q3GrossNet, $this->roundMoney($q3GrossNet * $homeOfficeScale));
            $q4Net = $this->subtractMoney($this->subtractMoney($this->subtractMoney($entity->netProfit, $q1Net), $q2Net), $q3Net);

            $quarters['q1'] = $this->sumMoney([$quarters['q1'], $q1Net]);
            $quarters['q2'] = $this->sumMoney([$quarters['q2'], $q2Net]);
            $quarters['q3'] = $this->sumMoney([$quarters['q3'], $q3Net]);
            $quarters['q4'] = $this->sumMoney([$quarters['q4'], $q4Net]);
        }

        return new QuarterTotals(
            q1: $quarters['q1'],
            q2: $this->sumMoney([$quarters['q1'], $quarters['q2']]),
            q3: $this->sumMoney([$quarters['q1'], $quarters['q2'], $quarters['q3']]),
            q4: $this->sumMoney([$quarters['q1'], $quarters['q2'], $quarters['q3'], $quarters['q4']]),
        );
    }

    /**
     * @param  array<string, array{income: float, expense: float}>  $quarterSums
     * @param  array<string, mixed>  $categories
     * @param  'income'|'expense'  $kind
     * @return array<string, array{income: float, expense: float}>
     */
    private function addTransactionsByQuarter(array $quarterSums, array $categories, string $kind): array
    {
        foreach ($categories as $categoryKey => $category) {
            if (! is_array($category)) {
                continue;
            }

            foreach (($category['transactions'] ?? []) as $transaction) {
                if (! is_array($transaction)) {
                    continue;
                }

                $date = (string) ($transaction['t_date'] ?? '');
                $month = (int) substr($date, 5, 2);
                $quarter = $month < 4 ? 'q1' : ($month < 7 ? 'q2' : ($month < 10 ? 'q3' : 'q4'));
                $amount = $this->parseMoney($transaction['t_amt'] ?? null) ?? 0.0;
                $bucketAmount = $kind === 'income'
                    ? ((string) $categoryKey === 'business_returns' ? -abs($amount) : $amount)
                    : ($amount < 0.0 ? abs($amount) : 0.0);
                if ($kind === 'income') {
                    $quarterSums[$quarter]['income'] = $this->sumMoney([$quarterSums[$quarter]['income'], $bucketAmount]);
                } else {
                    $quarterSums[$quarter]['expense'] = $this->sumMoney([$quarterSums[$quarter]['expense'], $bucketAmount]);
                }
            }
        }

        return $quarterSums;
    }

    /**
     * @param  array<string, mixed>  $entityData
     * @param  array<string, FinTaxLineAdjustment[]>  $adjustmentsByLine
     */
    private function entityFact(array $entityData, ?Form8829EntityFact $form8829Entity, array $adjustmentsByLine): ScheduleCEntityFact
    {
        $entityName = $this->entityName($entityData);
        $grossReceiptSources = $this->categorySources(
            $entityData,
            'schedule_c_income',
            TaxFactSourceType::ScheduleCGrossReceipts,
            TaxFactRouting::ScheduleCLine1,
            static fn (string $category): bool => $category !== 'business_returns',
        );
        $returnsAndAllowancesSources = $this->categorySources(
            $entityData,
            'schedule_c_income',
            TaxFactSourceType::ScheduleCReturnsAndAllowances,
            TaxFactRouting::ScheduleCLine2,
            static fn (string $category): bool => $category === 'business_returns',
            true,
        );
        $expenseSources = $this->categorySources($entityData, 'schedule_c_expense', TaxFactSourceType::ScheduleCExpenseCategory, TaxFactRouting::ScheduleCLine28);
        $hasForm8829Entity = $form8829Entity instanceof Form8829EntityFact;
        $homeOfficeSources = $hasForm8829Entity
            ? $form8829Entity->line36Sources
            : $this->categorySources($entityData, 'schedule_c_home_office', TaxFactSourceType::ScheduleCHomeOfficeClaimed, TaxFactRouting::ScheduleCLine30);

        $grossReceipts = $this->applyLineAdjustments($this->sumSources($grossReceiptSources), $adjustmentsByLine['line_1'] ?? []);
        $returnsAndAllowances = $this->applyLineAdjustments($this->sumSources($returnsAndAllowancesSources), $adjustmentsByLine['line_2'] ?? []);
        $grossIncomeAfterReturns = $this->applyLineAdjustments($this->subtractMoney($grossReceipts, $returnsAndAllowances), $adjustmentsByLine['line_3'] ?? []);
        $expenses = $this->applyLineAdjustments($this->sumSources($expenseSources), $adjustmentsByLine['line_28'] ?? []);
        $tentativeProfitBeforeHomeOffice = $this->applyLineAdjustments($this->subtractMoney($grossIncomeAfterReturns, $expenses), $adjustmentsByLine['line_29'] ?? []);
        $homeOfficeClaimed = $hasForm8829Entity
            ? ($form8829Entity->method === 'simplified' ? $form8829Entity->simplifiedDeduction : $form8829Entity->regularDeduction)
            : $this->sumSources($homeOfficeSources);
        $computedHomeOfficeAllowable = $hasForm8829Entity
            ? $form8829Entity->line36AllowableHomeOfficeDeduction
            : $this->sumSources($homeOfficeSources);
        $homeOfficeAllowable = $this->applyLineAdjustments($computedHomeOfficeAllowable, $adjustmentsByLine['line_30'] ?? []);
        $homeOfficeDisallowed = $hasForm8829Entity ? $form8829Entity->carryoverToNextYear : 0.0;
        $homeOfficePriorCarryforward = $this->sumMoney([
            $hasForm8829Entity ? $form8829Entity->priorYearOpCarryover : 0.0,
            $hasForm8829Entity ? $form8829Entity->priorYearDepreciationCarryover : 0.0,
        ]);
        $homeOfficeCarryoverToNextYear = $hasForm8829Entity ? $form8829Entity->carryoverToNextYear : 0.0;
        $netProfitBeforeHomeOffice = $tentativeProfitBeforeHomeOffice;
        $netProfit = $this->applyLineAdjustments($this->subtractMoney($netProfitBeforeHomeOffice, $homeOfficeAllowable), $adjustmentsByLine['line_31'] ?? []);

        foreach ($adjustmentsByLine as $lineRef => $adjustments) {
            $sources = array_map(fn (FinTaxLineAdjustment $adjustment): TaxFactSource => $this->adjustmentSource($adjustment, $this->routingForLine($lineRef)), $adjustments);

            match ($lineRef) {
                'line_1' => array_push($grossReceiptSources, ...$sources),
                'line_2' => array_push($returnsAndAllowancesSources, ...$sources),
                'line_28' => array_push($expenseSources, ...$sources),
                'line_30' => array_push($homeOfficeSources, ...$sources),
                default => null,
            };
        }

        return new ScheduleCEntityFact(
            entityId: isset($entityData['entity_id']) ? (int) $entityData['entity_id'] : null,
            entityName: $entityName,
            grossReceiptSources: $grossReceiptSources,
            grossReceipts: $grossReceipts,
            returnsAndAllowancesSources: $returnsAndAllowancesSources,
            returnsAndAllowances: $returnsAndAllowances,
            grossIncomeAfterReturns: $grossIncomeAfterReturns,
            expenseSources: $expenseSources,
            expenses: $expenses,
            homeOfficeSources: $homeOfficeSources,
            homeOfficeClaimed: $homeOfficeClaimed,
            homeOfficeAllowable: $homeOfficeAllowable,
            homeOfficeDisallowed: $homeOfficeDisallowed,
            homeOfficePriorCarryforward: $homeOfficePriorCarryforward,
            homeOfficeCarryoverToNextYear: $homeOfficeCarryoverToNextYear,
            homeOfficeLimitationReason: $hasForm8829Entity ? $form8829Entity->limitationReason : 'No home-office deduction claimed for this entity.',
            tentativeProfitBeforeHomeOffice: $tentativeProfitBeforeHomeOffice,
            netProfitBeforeHomeOffice: $netProfitBeforeHomeOffice,
            netProfit: $netProfit,
            flaggedExpenseRows: $this->flaggedExpenseRows($entityData),
        );
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
     * @return TaxFactSource[]
     */
    private function categorySources(array $entityData, string $key, TaxFactSourceType $sourceType, TaxFactRouting $routing, ?callable $categoryFilter = null, bool $absoluteAmount = false): array
    {
        $sources = [];

        foreach (($entityData[$key] ?? []) as $category => $categoryData) {
            if (! is_array($categoryData)) {
                continue;
            }

            if ($categoryFilter !== null && ! $categoryFilter((string) $category)) {
                continue;
            }

            $amount = $this->parseMoney($categoryData['total'] ?? null) ?? 0.0;
            if ($absoluteAmount) {
                $amount = abs($amount);
            }
            $sources[] = new TaxFactSource(
                id: $this->entitySourceId($entityData, (string) $category),
                label: $this->entityName($entityData).' — '.(string) ($categoryData['label'] ?? $category),
                amount: $this->roundMoney($amount),
                sourceType: $sourceType,
                routing: $routing,
                routingReason: $this->categoryRoutingReason($key),
                notes: 'Transactions: '.$this->transactionCount($categoryData['transactions'] ?? []),
            );
        }

        return $sources;
    }

    private function transactionCount(mixed $transactions): int
    {
        return is_array($transactions) ? count($transactions) : 0;
    }

    private function categoryRoutingReason(string $key): string
    {
        return match ($key) {
            'schedule_c_income' => 'Tagged Schedule C income transactions flow to Schedule C line 1.',
            'schedule_c_expense' => 'Tagged Schedule C expense transactions are summarized on Schedule C line 28.',
            'schedule_c_home_office' => 'Tagged home-office costs are limited and routed to Schedule C line 30.',
            default => 'Tagged Schedule C transactions are included in the business rollup.',
        };
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
            ->where('form', 'schedule_c')
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

    private function sourceTypeForAdjustment(FinTaxLineAdjustment $adjustment): TaxFactSourceType
    {
        return match ($adjustment->kind) {
            'override' => TaxFactSourceType::UserOverride,
            'supporting_detail' => TaxFactSourceType::UserSupportingDetail,
            'follow_up_flag' => TaxFactSourceType::UserFollowUpFlag,
            default => TaxFactSourceType::UserAdjustment,
        };
    }

    private function routingForLine(string $lineRef): ?TaxFactRouting
    {
        return match ($this->normalizeLineRef($lineRef)) {
            'line_1' => TaxFactRouting::ScheduleCLine1,
            'line_2' => TaxFactRouting::ScheduleCLine2,
            'line_3' => TaxFactRouting::ScheduleCLine3,
            'line_28' => TaxFactRouting::ScheduleCLine28,
            'line_29' => TaxFactRouting::ScheduleCLine29,
            'line_30' => TaxFactRouting::ScheduleCLine30,
            'line_31' => TaxFactRouting::ScheduleCLine31,
            default => null,
        };
    }

    private function normalizeLineRef(string $lineRef): string
    {
        $normalized = strtolower(trim($lineRef));
        $normalized = str_replace(['schedule_c.', 'sch_c.', 'l.'], '', $normalized);
        $normalized = str_replace(['-', ' '], '_', $normalized);

        if (preg_match('/^(?:line_)?(\d+)$/', $normalized, $matches) === 1) {
            return 'line_'.$matches[1];
        }

        return $normalized;
    }

    /**
     * @param  array<string, mixed>  $entityData
     * @return ScheduleCFlaggedExpenseRowFact[]
     */
    private function flaggedExpenseRows(array $entityData): array
    {
        $rows = [];

        foreach (($entityData['flagged_expense_rows'] ?? []) as $row) {
            if (! is_array($row)) {
                continue;
            }

            $rows[] = new ScheduleCFlaggedExpenseRowFact(
                transactionId: (int) ($row['t_id'] ?? 0),
                date: (string) ($row['t_date'] ?? ''),
                description: isset($row['t_description']) ? (string) $row['t_description'] : null,
                amount: $this->roundMoney((float) ($row['t_amt'] ?? 0.0)),
                accountId: isset($row['t_account']) ? (int) $row['t_account'] : null,
                taxCharacteristic: (string) ($row['tax_characteristic'] ?? ''),
                label: (string) ($row['label'] ?? ''),
                category: (string) ($row['category'] ?? ''),
                reason: (string) ($row['reason'] ?? 'Positive expense-tagged row excluded from Schedule C expenses.'),
            );
        }

        return $rows;
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

    /**
     * @param  array<string, mixed>  $entityData
     */
    private function entitySourceId(array $entityData, string $suffix): string
    {
        return 'schedule-c-'.$this->entityKey($entityData).'-'.$suffix;
    }
}
