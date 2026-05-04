<?php

namespace App\Services\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Services\Finance\CapitalGains\CapitalGainsTaxReportService;
use App\Services\Finance\CapitalGains\Form8949ReportRow;
use App\Services\Finance\CapitalGains\ScheduleDRollupInput;
use App\Services\Finance\CapitalGains\WashSaleAdjustment;
use App\Services\Finance\TaxPreviewFacts\Builders\Form4952FactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\Form8949FactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\Schedule1FactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\ScheduleBFactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\ScheduleDFactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxPreviewFacts;
use Carbon\CarbonImmutable;

class TaxPreviewFactsService
{
    public function __construct(
        private readonly CapitalGainsTaxReportService $capitalGainsTaxReportService,
        private readonly Schedule1FactsBuilder $schedule1FactsBuilder,
        private readonly ScheduleBFactsBuilder $scheduleBFactsBuilder,
        private readonly Form4952FactsBuilder $form4952FactsBuilder,
        private readonly ScheduleDFactsBuilder $scheduleDFactsBuilder,
        private readonly Form8949FactsBuilder $form8949FactsBuilder,
    ) {}

    /**
     * @return array<string>
     */
    public static function supportedSlices(): array
    {
        return ['all', 'schedule1', 'scheduleB', 'form4952', 'scheduleD', 'form8949'];
    }

    public function factsForYear(int $userId, int $year): TaxPreviewFacts
    {
        $documents = FileForTaxDocument::where('user_id', $userId)
            ->where('tax_year', $year)
            ->whereIn('form_type', FileForTaxDocument::ACCOUNT_FORM_TYPES)
            ->with([
                'employmentEntity:id,display_name',
                'account:acct_id,acct_name,acct_number',
                'accountLinks.account:acct_id,acct_name,acct_number',
            ])
            ->orderBy('created_at', 'desc')
            ->get();

        return $this->factsFromDocuments(
            $year,
            $documents,
            $this->shortDividendItemizedDeduction($userId, $year),
            $this->marginInterestSources($userId, $year),
            $userId,
        );
    }

    /**
     * @param  iterable<FileForTaxDocument>  $documents
     * @param  TaxFactSource[]  $marginInterestSources
     */
    public function factsFromDocuments(
        int $year,
        iterable $documents,
        float $shortDividendDeduction = 0.0,
        array $marginInterestSources = [],
        ?int $userId = null,
    ): TaxPreviewFacts {
        $k1Docs = [];
        $docs1099 = [];

        foreach ($documents as $document) {
            if ($this->formType($document) === 'k1') {
                $k1Docs[] = $document;
            } else {
                $docs1099[] = $document;
            }
        }

        $scheduleB = $this->scheduleBFactsBuilder->build($k1Docs, $docs1099);
        $capitalGainsReport = $userId !== null
            ? $this->capitalGainsTaxReportService->reportForUserYear($userId, $year)
            : $this->emptyCapitalGainsReport($year);

        return new TaxPreviewFacts(
            year: $year,
            schedule1: $this->schedule1FactsBuilder->build($k1Docs, $docs1099),
            scheduleB: $scheduleB,
            form4952: $this->form4952FactsBuilder->build($k1Docs, $docs1099, $scheduleB, $shortDividendDeduction, $marginInterestSources),
            scheduleD: $this->scheduleDFactsBuilder->build($k1Docs, $docs1099, $capitalGainsReport['scheduleDRollup']),
            form8949: $this->form8949FactsBuilder->build($capitalGainsReport),
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function arrayForYear(int $userId, int $year, string $slice = 'all'): array
    {
        $facts = $this->factsForYear($userId, $year)->toArray();

        return $this->sliceArray($facts, $slice);
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return array<string, mixed>
     */
    public function sliceArray(array $facts, string $slice): array
    {
        return match ($slice) {
            'schedule1' => [
                'year' => $facts['year'],
                'schedule1' => $facts['schedule1'],
            ],
            'scheduleB' => [
                'year' => $facts['year'],
                'scheduleB' => $facts['scheduleB'],
            ],
            'form4952' => [
                'year' => $facts['year'],
                'form4952' => $facts['form4952'],
            ],
            'scheduleD' => [
                'year' => $facts['year'],
                'scheduleD' => $facts['scheduleD'],
            ],
            'form8949' => [
                'year' => $facts['year'],
                'form8949' => $facts['form8949'],
            ],
            default => $facts,
        };
    }

    /**
     * @return array{taxYear:int,reportingMode:string,transactions:array<int,mixed>,adjustments:array<int,WashSaleAdjustment>,rows:array<int,Form8949ReportRow>,scheduleDRollup:array<int,ScheduleDRollupInput>}
     */
    private function emptyCapitalGainsReport(int $year): array
    {
        return [
            'taxYear' => $year,
            'reportingMode' => 'form_8949_transactions',
            'transactions' => [],
            'adjustments' => [],
            'rows' => [],
            'scheduleDRollup' => [],
        ];
    }

    private function formType(FileForTaxDocument $doc): string
    {
        return (string) $doc->getAttribute('form_type');
    }

    private function shortDividendItemizedDeduction(int $userId, int $year): float
    {
        $accountIds = FinAccounts::withoutGlobalScopes()
            ->where('acct_owner', $userId)
            ->pluck('acct_id')
            ->map(static fn (mixed $accountId): int => (int) $accountId)
            ->all();

        if ($accountIds === []) {
            return 0.0;
        }

        $transactions = FinAccountLineItems::whereIn('t_account', $accountIds)
            ->whereBetween('t_date', ["{$year}-01-01", "{$year}-12-31"])
            ->orderBy('t_account')
            ->orderBy('t_date')
            ->get()
            ->groupBy('t_account');

        $total = 0.0;

        foreach ($transactions as $accountTransactions) {
            foreach ($accountTransactions as $transaction) {
                if (! $this->isShortDividend($transaction)) {
                    continue;
                }

                $shortOpenDate = $this->shortOpenDate($accountTransactions->all(), $transaction);
                if ($shortOpenDate === null) {
                    continue;
                }

                $dividendDate = CarbonImmutable::parse((string) $transaction->t_date);
                $daysHeld = $shortOpenDate->diffInDays($dividendDate, false);
                if ($daysHeld > 45) {
                    $total += abs((float) $transaction->t_amt);
                }
            }
        }

        return $this->roundMoney($total);
    }

    /**
     * @return TaxFactSource[]
     */
    private function marginInterestSources(int $userId, int $year): array
    {
        $accounts = FinAccounts::withoutGlobalScopes()
            ->where('acct_owner', $userId)
            ->get(['acct_id', 'acct_name'])
            ->keyBy('acct_id');

        if ($accounts->isEmpty()) {
            return [];
        }

        $rows = FinAccountLineItems::whereIn('t_account', $accounts->keys()->all())
            ->whereBetween('t_date', ["{$year}-01-01", "{$year}-12-31"])
            ->where('t_amt', '<', 0)
            ->where(function ($query): void {
                $query->where('t_type', 'Margin Interest')
                    ->orWhere('t_comment', 'like', '%MARGIN INTEREST%');
            })
            ->get(['t_account', 't_amt'])
            ->groupBy('t_account');

        $sources = [];
        foreach ($rows as $accountId => $transactions) {
            $amount = $this->roundMoney($transactions->sum(static fn (FinAccountLineItems $transaction): float => (float) $transaction->t_amt));
            if ($amount === 0.0) {
                continue;
            }

            $account = $accounts->get($accountId);
            $accountName = $account instanceof FinAccounts ? $account->acct_name : "Account {$accountId}";
            $sources[] = new TaxFactSource(
                id: "account-{$accountId}-margin-interest",
                label: "{$accountName} — Margin interest paid",
                amount: $amount,
                sourceType: 'brokerage_margin_interest',
                accountId: (int) $accountId,
                routing: 'form_4952_line_1',
                routingReason: 'Brokerage margin-interest transactions are investment interest expense for Form 4952 Part I.',
                isReviewed: true,
            );
        }

        return $sources;
    }

    private function isShortDividend(FinAccountLineItems $transaction): bool
    {
        if ($transaction->t_type !== 'Dividend' || (float) $transaction->t_amt >= 0.0) {
            return false;
        }

        $description = strtoupper(trim((string) $transaction->t_description.' '.(string) $transaction->t_comment));

        return str_contains($description, 'SHORT')
            || str_contains($description, 'CHARGED')
            || str_contains($description, 'SHORT SALE');
    }

    /**
     * @param  FinAccountLineItems[]  $transactions
     */
    private function shortOpenDate(array $transactions, FinAccountLineItems $dividend): ?CarbonImmutable
    {
        $symbol = (string) $dividend->t_symbol;
        if ($symbol === '') {
            return null;
        }

        $dividendDate = (string) $dividend->t_date;
        $openDate = null;

        foreach ($transactions as $transaction) {
            if ((string) $transaction->t_symbol !== $symbol
                || $transaction->t_type !== 'Sell Short'
                || (string) $transaction->t_date > $dividendDate) {
                continue;
            }

            if ($openDate === null || (string) $transaction->t_date > $openDate) {
                $openDate = (string) $transaction->t_date;
            }
        }

        return $openDate !== null ? CarbonImmutable::parse($openDate) : null;
    }

    private function roundMoney(float $value): float
    {
        return round($value, 2);
    }
}
