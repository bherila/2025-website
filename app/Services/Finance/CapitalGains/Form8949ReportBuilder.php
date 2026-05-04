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

    /** Form 8949 box → Schedule D line mapping */
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
        // Build a lookup of transactions affected by cross-account wash-sale adjustments
        $adjustedIds = $this->adjustedTransactionIds($adjustments);

        // Build per-box buckets for summary rows
        $summaryBuckets = [];
        $individualRows = [];

        foreach ($transactions as $txn) {
            $box = $this->normalizer->inferForm8949Box($txn) ?? 'C'; // Default uncovered ST

            $wsAdjustment = $adjustedIds[$txn->id] ?? null;
            $needsIndividualRow = ($reportingMode === 'form_8949_transactions')
                || ($wsAdjustment !== null);   // cross-account adjustment forces individual row

            if ($needsIndividualRow) {
                $individualRows[] = $this->buildIndividualRow($txn, $box, $wsAdjustment);
            } elseif ($reportingMode === 'form_8949_summary') {
                $summaryBuckets[$box][] = $txn;
            } else {
                // schedule_d_summary — no Form 8949 rows at all; callers use buildScheduleDRollup()
            }
        }

        // Build summary rows for form_8949_summary mode
        foreach ($summaryBuckets as $box => $txnsForBox) {
            $individualRows[] = $this->buildSummaryRow($box, $txnsForBox);
        }

        // Sort: short-term first (A→C), long-term second (D→F)
        usort($individualRows, fn (Form8949ReportRow $a, Form8949ReportRow $b): int => $a->form8949Box <=> $b->form8949Box);

        return $individualRows;
    }

    /**
     * Build Schedule D rollup inputs from canonical transactions.
     *
     * Returns one ScheduleDRollupInput per Form 8949 box that has transactions.
     *
     * @param  CanonicalCapitalGainTransaction[]  $transactions
     * @param  WashSaleAdjustment[]  $adjustments
     * @return ScheduleDRollupInput[]
     */
    public function buildScheduleDRollup(array $transactions, array $adjustments = []): array
    {
        $adjustedIds = $this->adjustedTransactionIds($adjustments);

        /** @var array<string, array{proceeds: float, basis: float, adjustment: float, count: int}> $buckets */
        $buckets = [];

        foreach ($transactions as $txn) {
            $box = $this->normalizer->inferForm8949Box($txn) ?? 'C';
            $wsAdjustment = $adjustedIds[$txn->id] ?? null;

            $adjustmentAmount = $wsAdjustment !== null ? $wsAdjustment->disallowedLoss : $txn->washSaleDisallowed;

            if (! isset($buckets[$box])) {
                $buckets[$box] = ['proceeds' => 0.0, 'basis' => 0.0, 'adjustment' => 0.0, 'count' => 0];
            }

            $buckets[$box]['proceeds'] += $txn->proceeds;
            $buckets[$box]['basis'] += $txn->costBasis;
            $buckets[$box]['adjustment'] += $adjustmentAmount;
            $buckets[$box]['count']++;
        }

        $results = [];
        foreach ($buckets as $box => $totals) {
            $isShortTerm = in_array($box, self::SHORT_TERM_BOXES, true);
            $scheduleDLine = self::BOX_TO_SCHEDULE_D_LINE[$box] ?? '?';
            $netGain = $totals['proceeds'] - $totals['basis'] + $totals['adjustment'];

            $results[] = new ScheduleDRollupInput(
                form8949Box: $box,
                isShortTerm: $isShortTerm,
                scheduleDLine: $scheduleDLine,
                totalProceeds: $totals['proceeds'],
                totalCostBasis: $totals['basis'],
                totalAdjustment: $totals['adjustment'],
                netGainOrLoss: $netGain,
                rowCount: $totals['count'],
            );
        }

        usort($results, fn (ScheduleDRollupInput $a, ScheduleDRollupInput $b): int => $a->form8949Box <=> $b->form8949Box);

        return $results;
    }

    // -------------------------------------------------------------------------
    // Row builders
    // -------------------------------------------------------------------------

    private function buildIndividualRow(
        CanonicalCapitalGainTransaction $txn,
        string $box,
        ?WashSaleAdjustment $wsAdjustment,
    ): Form8949ReportRow {
        $isShortTerm = in_array($box, self::SHORT_TERM_BOXES, true);
        $adjustmentAmount = $wsAdjustment !== null ? $wsAdjustment->disallowedLoss : $txn->washSaleDisallowed;
        $adjustmentCode = null;
        if ($adjustmentAmount > 0) {
            $adjustmentCode = $wsAdjustment?->isCrossAccount ? 'W' : 'W';
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
        $description = "{$count} transaction(s) — see statement";

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
        }

        return $result;
    }
}
