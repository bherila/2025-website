<?php

namespace App\Services\Finance\CapitalGains;

/**
 * Builds canonical Form 8949 report rows and Schedule D rollup inputs from a
 * set of CanonicalCapitalGainTransactions and WashSaleAdjustments.
 *
 * This is the single shared output generator used by:
 *   • Tax Preview — Capital Gains Reconciliation workflow
 *   • Tax Preview — Form 8949 preview
 *   • Tax Preview — Schedule D preview
 *   • XLSX export
 *
 * Reporting modes follow the IRS guidance for Form 8949 / Schedule D:
 *
 *   schedule_d_summary   — Eligible transactions are summarised directly on
 *                          Schedule D without individual Form 8949 rows.
 *   form_8949_summary    — Transactions are summarised on Form 8949 by box.
 *   form_8949_transactions — Every transaction appears as an individual row.
 *
 * Cross-account wash-sale adjustments always carve out their affected
 * transactions into individual Form 8949 rows regardless of reporting mode.
 */
class Form8949ReportBuilder
{
    /** Form 8949 boxes that are short-term */
    private const SHORT_TERM_BOXES = ['A', 'B', 'C'];

    /** Form 8949 box -> Schedule D line mapping */
    private const BOX_TO_SCHEDULE_D_LINE = [
        'A' => '1b',
        'B' => '2',
        'C' => '3',
        'D' => '8b',
        'E' => '9',
        'F' => '10',
    ];

    public function __construct(
        private readonly CapitalGainsImportNormalizer $normalizer,
    ) {}

    /**
     * Build Form 8949 report rows from canonical transactions.
     *
     * @param  CanonicalCapitalGainTransaction[]  $transactions
     * @param  WashSaleAdjustment[]  $adjustments  Taxpayer-level wash-sale adjustments (cross-account)
     * @param  string  $reportingMode  'schedule_d_summary'|'form_8949_summary'|'form_8949_transactions'
     * @return Form8949ReportRow[]
     */
    public function buildRows(
        array $transactions,
        array $adjustments = [],
        string $reportingMode = 'form_8949_transactions',
    ): array {
        $adjustedIds = $this->adjustedTransactionIds($adjustments);
        $summaryBuckets = [];
        $individualRows = [];

        foreach ($transactions as $txn) {
            $box = $this->normalizer->inferForm8949Box($txn);

            $wsAdjustment = $adjustedIds[$txn->id] ?? null;
            $needsIndividualRow = ($reportingMode === 'form_8949_transactions')
                || ($wsAdjustment !== null)
                || ($box === null);

            if ($needsIndividualRow) {
                $individualRows[] = $this->buildIndividualRow($txn, $box, $wsAdjustment);
            } elseif ($reportingMode === 'form_8949_summary') {
                $summaryBuckets[$box][] = $txn;
            }
        }

        foreach ($summaryBuckets as $box => $txnsForBox) {
            $individualRows[] = $this->buildSummaryRow($box, $txnsForBox);
        }

        usort($individualRows, fn (Form8949ReportRow $a, Form8949ReportRow $b): int => ($a->form8949Box ?? 'Z') <=> ($b->form8949Box ?? 'Z'));

        return $individualRows;
    }

    /**
     * Build Schedule D rollup inputs from canonical transactions.
     *
     * Returns one ScheduleDRollupInput per Form 8949 box that has transactions.
     *
     * @param  CanonicalCapitalGainTransaction[]  $transactions
     * @param  WashSaleAdjustment[]  $adjustments
     * @param  array<string, string>  $reportingModesByDocumentAccountKey
     * @return ScheduleDRollupInput[]
     */
    public function buildScheduleDRollup(
        array $transactions,
        array $adjustments = [],
        string $reportingMode = 'form_8949_transactions',
        array $reportingModesByDocumentAccountKey = [],
    ): array {
        $adjustedIds = $this->adjustedTransactionIds($adjustments);

        /** @var array<string, array{box: string, reportingMode: string, proceeds: float, basis: float, adjustment: float, count: int}> $buckets */
        $buckets = [];

        foreach ($transactions as $txn) {
            $box = $this->normalizer->inferForm8949Box($txn);
            if ($box === null) {
                continue;
            }

            $wsAdjustment = $adjustedIds[$txn->id] ?? null;

            $adjustmentAmount = $wsAdjustment !== null ? $wsAdjustment->disallowedLoss : $txn->washSaleDisallowed;
            $effectiveReportingMode = $txn->taxDocumentId !== null
                ? ($reportingModesByDocumentAccountKey[$this->reportingModeLookupKey($txn->taxDocumentId, $txn->accountId)] ?? $reportingMode)
                : $reportingMode;
            $documentKey = $txn->taxDocumentId !== null ? $this->reportingModeLookupKey($txn->taxDocumentId, $txn->accountId) : 'global';
            $bucketKey = "{$documentKey}|{$box}|{$effectiveReportingMode}";

            if (! isset($buckets[$bucketKey])) {
                $buckets[$bucketKey] = [
                    'box' => $box,
                    'reportingMode' => $effectiveReportingMode,
                    'proceeds' => 0.0,
                    'basis' => 0.0,
                    'adjustment' => 0.0,
                    'count' => 0,
                ];
            }

            $buckets[$bucketKey]['proceeds'] += $txn->proceeds;
            $buckets[$bucketKey]['basis'] += $txn->costBasis;
            $buckets[$bucketKey]['adjustment'] += $adjustmentAmount;
            $buckets[$bucketKey]['count']++;
        }

        /** @var array<string, array{box: string, scheduleDLine: string, proceeds: float, basis: float, adjustment: float, count: int}> $lineBuckets */
        $lineBuckets = [];
        foreach ($buckets as $totals) {
            $box = $totals['box'];
            $scheduleDLine = $this->scheduleDLineForBox($box, $totals['reportingMode'], $totals['adjustment']);
            $lineBucketKey = "{$box}|{$scheduleDLine}";

            if (! isset($lineBuckets[$lineBucketKey])) {
                $lineBuckets[$lineBucketKey] = [
                    'box' => $box,
                    'scheduleDLine' => $scheduleDLine,
                    'proceeds' => 0.0,
                    'basis' => 0.0,
                    'adjustment' => 0.0,
                    'count' => 0,
                ];
            }

            $lineBuckets[$lineBucketKey]['proceeds'] += $totals['proceeds'];
            $lineBuckets[$lineBucketKey]['basis'] += $totals['basis'];
            $lineBuckets[$lineBucketKey]['adjustment'] += $totals['adjustment'];
            $lineBuckets[$lineBucketKey]['count'] += $totals['count'];
        }

        $results = [];
        foreach ($lineBuckets as $totals) {
            $box = $totals['box'];
            $isShortTerm = in_array($box, self::SHORT_TERM_BOXES, true);
            $netGain = $totals['proceeds'] - $totals['basis'] + $totals['adjustment'];

            $results[] = new ScheduleDRollupInput(
                form8949Box: $box,
                isShortTerm: $isShortTerm,
                scheduleDLine: $totals['scheduleDLine'],
                totalProceeds: $totals['proceeds'],
                totalCostBasis: $totals['basis'],
                totalAdjustment: $totals['adjustment'],
                netGainOrLoss: $netGain,
                rowCount: $totals['count'],
            );
        }

        usort($results, fn (ScheduleDRollupInput $a, ScheduleDRollupInput $b): int => [$a->form8949Box, $a->scheduleDLine] <=> [$b->form8949Box, $b->scheduleDLine]);

        return $results;
    }

    private function reportingModeLookupKey(int $taxDocumentId, ?int $accountId): string
    {
        return "doc:{$taxDocumentId}|account:".($accountId !== null ? (string) $accountId : 'none');
    }

    // -------------------------------------------------------------------------
    // Row builders
    // -------------------------------------------------------------------------

    private function buildIndividualRow(
        CanonicalCapitalGainTransaction $txn,
        ?string $box,
        ?WashSaleAdjustment $wsAdjustment,
    ): Form8949ReportRow {
        $isShortTerm = $box !== null
            ? in_array($box, self::SHORT_TERM_BOXES, true)
            : ($txn->isShortTerm ?? false);
        $adjustmentAmount = $wsAdjustment !== null ? $wsAdjustment->disallowedLoss : $txn->washSaleDisallowed;
        $adjustmentCode = null;
        if ($adjustmentAmount > 0) {
            $adjustmentCode = 'W';
        }

        $gainOrLoss = $txn->proceeds - $txn->costBasis + $adjustmentAmount;

        return new Form8949ReportRow(
            form8949Box: $box,
            description: $txn->description,
            dateAcquired: $txn->dateAcquired,
            dateSold: $txn->dateSold,
            proceeds: $txn->proceeds,
            costBasis: $txn->costBasis,
            adjustmentCode: $adjustmentCode,
            adjustmentAmount: $adjustmentAmount,
            gainOrLoss: $gainOrLoss,
            isShortTerm: $isShortTerm,
            isCovered: $txn->isCovered,
            isSummaryRow: false,
            accountName: $txn->accountName,
            taxDocumentId: $txn->taxDocumentId,
            sourceTransactionId: $txn->id,
        );
    }

    /**
     * @param  CanonicalCapitalGainTransaction[]  $transactions
     */
    private function buildSummaryRow(string $box, array $transactions): Form8949ReportRow
    {
        $isShortTerm = in_array($box, self::SHORT_TERM_BOXES, true);
        $totalProceeds = 0.0;
        $totalBasis = 0.0;
        $totalAdjustment = 0.0;
        $hasWashSale = false;

        foreach ($transactions as $txn) {
            $totalProceeds += $txn->proceeds;
            $totalBasis += $txn->costBasis;
            $totalAdjustment += $txn->washSaleDisallowed;
            if ($txn->washSaleDisallowed > 0) {
                $hasWashSale = true;
            }
        }

        $gainOrLoss = $totalProceeds - $totalBasis + $totalAdjustment;
        $count = count($transactions);
        $description = "{$count} transactions - see attached statement";

        return new Form8949ReportRow(
            form8949Box: $box,
            description: $description,
            dateAcquired: 'various',
            dateSold: 'various',
            proceeds: $totalProceeds,
            costBasis: $totalBasis,
            adjustmentCode: $hasWashSale ? 'W' : null,
            adjustmentAmount: $totalAdjustment,
            gainOrLoss: $gainOrLoss,
            isShortTerm: $isShortTerm,
            isCovered: null,
            isSummaryRow: true,
            accountName: null,
            taxDocumentId: null,
            sourceTransactionId: null,
        );
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Build a lookup of canonical transaction IDs that have taxpayer-level
     * cross-account wash-sale adjustments.
     *
     * @param  WashSaleAdjustment[]  $adjustments
     * @return array<string, WashSaleAdjustment> Keyed by lossSaleId
     */
    private function adjustedTransactionIds(array $adjustments): array
    {
        $result = [];
        foreach ($adjustments as $adj) {
            $result[$adj->lossSaleId] = $adj;

            if ($adj->saleLotId !== null) {
                $result["account_lot:{$adj->saleLotId}"] = $adj;
                $result["1099b:{$adj->saleLotId}"] = $adj;
            }
        }

        return $result;
    }

    private function scheduleDLineForBox(string $box, string $reportingMode, float $adjustmentAmount): string
    {
        if ($reportingMode === 'schedule_d_summary' && abs($adjustmentAmount) <= 0.005) {
            if ($box === 'A') {
                return '1a';
            }

            if ($box === 'D') {
                return '8a';
            }
        }

        return self::BOX_TO_SCHEDULE_D_LINE[$box] ?? '?';
    }
}
