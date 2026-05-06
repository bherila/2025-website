<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Services\Finance\K1CodeCharacterResolver;
use App\Services\Finance\ScheduleCSummaryService;
use App\Services\Finance\TaxPreviewFacts\Data\QuarterTotals;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleCEntityFact;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleCFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;

class ScheduleCFactsBuilder extends TaxPreviewFactBuilder
{
    public function __construct(
        K1CodeCharacterResolver $k1CodeCharacterResolver,
        private readonly ScheduleCSummaryService $scheduleCSummaryService,
    ) {
        parent::__construct($k1CodeCharacterResolver);
    }

    public function build(int $userId, int $year): ScheduleCFacts
    {
        $summary = $this->scheduleCSummaryService->getSummary($userId);
        $homeOfficeCalcs = $this->homeOfficeCalcs($summary['years']);
        $yearData = $this->yearData($summary['years'], $year);

        if ($yearData === null) {
            return ScheduleCFacts::empty();
        }

        $entities = [];
        $line31Sources = [];

        foreach (($yearData['entities'] ?? []) as $entityData) {
            if (! is_array($entityData)) {
                continue;
            }

            $entity = $this->entityFact($year, $entityData, $homeOfficeCalcs);
            $entities[] = $entity;
            $line31Sources[] = new TaxFactSource(
                id: $this->entitySourceId($entityData, 'line31'),
                label: "{$entity->entityName} — Schedule C net profit",
                amount: $entity->netProfit,
                sourceType: TaxFactSourceType::ScheduleCNetProfit,
                routing: TaxFactRouting::ScheduleCLine31,
                routingReason: 'Schedule C line 31 is gross receipts less ordinary expenses and allowable home-office deduction.',
                notes: "Gross {$entity->grossReceipts}; expenses {$entity->expenses}; home office {$entity->homeOfficeAllowable}",
            );
        }

        return new ScheduleCFacts(
            entities: $entities,
            grossReceiptsTotal: $this->sumMoney(array_map(static fn (ScheduleCEntityFact $entity): float => $entity->grossReceipts, $entities)),
            expensesTotal: $this->sumMoney(array_map(static fn (ScheduleCEntityFact $entity): float => $entity->expenses, $entities)),
            homeOfficeAllowable: $this->sumMoney(array_map(static fn (ScheduleCEntityFact $entity): float => $entity->homeOfficeAllowable, $entities)),
            homeOfficeDisallowed: $this->sumMoney(array_map(static fn (ScheduleCEntityFact $entity): float => $entity->homeOfficeDisallowed, $entities)),
            homeOfficePriorCarryforward: $this->sumMoney(array_map(static fn (ScheduleCEntityFact $entity): float => $entity->homeOfficePriorCarryforward, $entities)),
            netProfit: $this->sumMoney(array_map(static fn (ScheduleCEntityFact $entity): float => $entity->netProfit, $entities)),
            netProfitByQuarter: $this->netProfitByQuarter($year, $yearData, $homeOfficeCalcs),
            deductiblePortionRoutedToSchedule1: $this->sumMoney(array_map(static fn (ScheduleCEntityFact $entity): float => $entity->netProfit, $entities)),
            line31Sources: $line31Sources,
        );
    }

    /**
     * @param  array<string, mixed>  $yearData
     * @param  array<string, array{allowable:float,disallowed:float,priorCarryForward:float,reason:string}>  $homeOfficeCalcs
     */
    private function netProfitByQuarter(int $year, array $yearData, array $homeOfficeCalcs): QuarterTotals
    {
        $quarters = ['q1' => 0.0, 'q2' => 0.0, 'q3' => 0.0, 'q4' => 0.0];

        foreach (($yearData['entities'] ?? []) as $entityData) {
            if (! is_array($entityData)) {
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

            $calc = $homeOfficeCalcs[$this->entityYearKey($year, $entityData)] ?? ['allowable' => 0.0];
            $preHomeOfficeNet = 0.0;
            foreach ($quarterSums as $quarter) {
                $preHomeOfficeNet = $this->sumMoney([$preHomeOfficeNet, $this->subtractMoney($quarter['income'], $quarter['expense'])]);
            }
            $homeOfficeScale = $preHomeOfficeNet !== 0.0 ? $calc['allowable'] / $preHomeOfficeNet : 0.0;
            $q1GrossNet = $this->subtractMoney($quarterSums['q1']['income'], $quarterSums['q1']['expense']);
            $q2GrossNet = $this->subtractMoney($quarterSums['q2']['income'], $quarterSums['q2']['expense']);
            $q3GrossNet = $this->subtractMoney($quarterSums['q3']['income'], $quarterSums['q3']['expense']);
            $entity = $this->entityFact($year, $entityData, $homeOfficeCalcs);
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
        foreach ($categories as $category) {
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
                $bucketAmount = $kind === 'income' ? $amount : abs($amount);
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
     * @param  array<int, array<string, mixed>>  $allYears
     * @return array<string, array{allowable:float,disallowed:float,priorCarryForward:float,reason:string}>
     */
    private function homeOfficeCalcs(array $allYears): array
    {
        $calcs = [];
        $carryForwardByEntity = [];
        usort($allYears, static fn (array $left, array $right): int => ((int) ($left['year'] ?? 0)) <=> ((int) ($right['year'] ?? 0)));

        foreach ($allYears as $yearData) {
            foreach (($yearData['entities'] ?? []) as $entityData) {
                if (! is_array($entityData)) {
                    continue;
                }

                $entityKey = $this->entityKey($entityData);
                $priorCarryForward = $carryForwardByEntity[$entityKey] ?? 0.0;
                $incomeTotal = $this->sumCategoryTotals($entityData['schedule_c_income'] ?? []);
                $expenseTotal = $this->sumCategoryTotals($entityData['schedule_c_expense'] ?? []);
                $homeOfficeTotal = $this->sumCategoryTotals($entityData['schedule_c_home_office'] ?? []);
                $netBeforeHomeOffice = $this->subtractMoney($incomeTotal, $expenseTotal);
                $limit = max(0.0, $netBeforeHomeOffice);
                $totalClaim = $this->sumMoney([$homeOfficeTotal, $priorCarryForward]);
                $allowable = $this->roundMoney(min($totalClaim, $limit));
                $disallowed = $this->subtractMoney($totalClaim, $allowable);

                $calcs[$this->entityYearKey((int) $yearData['year'], $entityData)] = [
                    'allowable' => $allowable,
                    'disallowed' => $disallowed,
                    'priorCarryForward' => $priorCarryForward,
                    'reason' => $this->homeOfficeLimitationReason($totalClaim, $netBeforeHomeOffice, $allowable),
                ];
                $carryForwardByEntity[$entityKey] = $disallowed;
            }
        }

        return $calcs;
    }

    /**
     * @param  array<string, mixed>  $entityData
     * @param  array<string, array{allowable:float,disallowed:float,priorCarryForward:float,reason:string}>  $homeOfficeCalcs
     */
    private function entityFact(int $year, array $entityData, array $homeOfficeCalcs): ScheduleCEntityFact
    {
        $calc = $homeOfficeCalcs[$this->entityYearKey($year, $entityData)] ?? [
            'allowable' => 0.0,
            'disallowed' => 0.0,
            'priorCarryForward' => 0.0,
            'reason' => 'No home-office deduction claimed for this entity.',
        ];
        $grossReceiptSources = $this->categorySources($entityData, 'schedule_c_income', TaxFactSourceType::ScheduleCGrossReceipts, TaxFactRouting::ScheduleCLine1);
        $expenseSources = $this->categorySources($entityData, 'schedule_c_expense', TaxFactSourceType::ScheduleCExpenseCategory, TaxFactRouting::ScheduleCLine28);
        $homeOfficeSources = $this->categorySources($entityData, 'schedule_c_home_office', TaxFactSourceType::ScheduleCHomeOfficeClaimed, TaxFactRouting::ScheduleCLine30);
        $entityName = $this->entityName($entityData);
        $grossReceipts = $this->sumSources($grossReceiptSources);
        $expenses = $this->sumSources($expenseSources);
        $homeOfficeClaimed = $this->sumSources($homeOfficeSources);
        $netProfitBeforeHomeOffice = $this->subtractMoney($grossReceipts, $expenses);
        $netProfit = $this->subtractMoney($netProfitBeforeHomeOffice, $calc['allowable']);

        if ($calc['priorCarryForward'] !== 0.0) {
            $homeOfficeSources[] = $this->homeOfficeAdjustmentSource($entityData, $entityName, 'prior-carryforward', $calc['priorCarryForward'], TaxFactSourceType::ScheduleCHomeOfficePriorCarryforward, 'Prior-year home-office carryforward available for the current year.');
        }

        if ($calc['disallowed'] !== 0.0) {
            $homeOfficeSources[] = $this->homeOfficeAdjustmentSource($entityData, $entityName, 'disallowed', -$calc['disallowed'], TaxFactSourceType::ScheduleCHomeOfficeDisallowed, 'Home-office deduction disallowed this year and carried forward.');
        }

        return new ScheduleCEntityFact(
            entityId: isset($entityData['entity_id']) ? (int) $entityData['entity_id'] : null,
            entityName: $entityName,
            grossReceiptSources: $grossReceiptSources,
            grossReceipts: $grossReceipts,
            expenseSources: $expenseSources,
            expenses: $expenses,
            homeOfficeSources: $homeOfficeSources,
            homeOfficeClaimed: $homeOfficeClaimed,
            homeOfficeAllowable: $calc['allowable'],
            homeOfficeDisallowed: $calc['disallowed'],
            homeOfficePriorCarryforward: $calc['priorCarryForward'],
            homeOfficeLimitationReason: $calc['reason'],
            netProfitBeforeHomeOffice: $netProfitBeforeHomeOffice,
            netProfit: $netProfit,
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
    private function categorySources(array $entityData, string $key, TaxFactSourceType $sourceType, TaxFactRouting $routing): array
    {
        $sources = [];

        foreach (($entityData[$key] ?? []) as $category => $categoryData) {
            if (! is_array($categoryData)) {
                continue;
            }

            $amount = $this->parseMoney($categoryData['total'] ?? null) ?? 0.0;
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

    /**
     * @param  array<string, mixed>  $entityData
     */
    private function homeOfficeAdjustmentSource(array $entityData, string $entityName, string $suffix, float $amount, TaxFactSourceType $sourceType, string $reason): TaxFactSource
    {
        return new TaxFactSource(
            id: $this->entitySourceId($entityData, "home-office-{$suffix}"),
            label: "{$entityName} — home-office {$suffix}",
            amount: $this->roundMoney($amount),
            sourceType: $sourceType,
            routing: TaxFactRouting::ScheduleCLine30,
            routingReason: $reason,
        );
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

    private function homeOfficeLimitationReason(float $totalClaim, float $netBeforeHomeOffice, float $allowable): string
    {
        if ($totalClaim === 0.0) {
            return 'No home-office deduction claimed for this entity.';
        }

        if ($netBeforeHomeOffice <= 0.0) {
            return 'Home-office deduction is disallowed because net profit before home-office is not positive.';
        }

        if ($allowable < $totalClaim) {
            return 'Home-office deduction is limited to net profit before home-office; the disallowed amount carries forward.';
        }

        return 'Home-office deduction is fully allowable for this year.';
    }

    /**
     * @param  array<string, mixed>  $entityData
     */
    private function entityYearKey(int $year, array $entityData): string
    {
        return "{$year}-{$this->entityKey($entityData)}";
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
