<?php

namespace App\Services\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\FinPayslips;

class TaxPreviewDataService
{
    public function __construct(
        private ScheduleCSummaryService $scheduleCSummaryService,
    ) {}

    /**
     * Lightweight shell data safe to preload in Blade.
     *
     * @return array{year: int, availableYears: int[]}
     */
    public function shellForYear(int $userId, int $year): array
    {
        return [
            'year' => $year,
            'availableYears' => $this->availableYears($userId),
        ];
    }

    /**
     * Full mutable Tax Preview dataset served from JSON API and owned by the React context provider.
     *
     * @return array<string, mixed>
     */
    public function datasetForYear(int $userId, int $year): array
    {
        $accounts = $this->accounts($userId);
        $scheduleCData = $this->scheduleCSummaryService->getSummary($userId);

        return [
            'year' => $year,
            'availableYears' => $this->availableYears($userId, array_map(static fn (string $scheduleCYear): int => (int) $scheduleCYear, $scheduleCData['available_years'] ?? [])),
            'payslips' => $this->payslipsForYear($userId, $year),
            'pendingReviewCount' => $this->pendingReviewCount($userId, $year),
            'w2Documents' => $this->documentsForYear($userId, $year, FileForTaxDocument::W2_FORM_TYPES),
            'accountDocuments' => $this->documentsForYear($userId, $year, ['1099_int', '1099_int_c', '1099_div', '1099_div_c', '1099_misc', 'k1']),
            'scheduleCData' => $scheduleCData,
            'employmentEntities' => $this->employmentEntities($userId),
            'accounts' => $accounts,
            'activeAccountIds' => $this->activeAccountIdsForYear($accounts, $year),
        ];
    }

    /**
     * @return int[]
     */
    /**
     * @param  int[]|null  $scheduleCYears
     * @return int[]
     */
    private function availableYears(int $userId, ?array $scheduleCYears = null): array
    {
        $payslipYears = FinPayslips::where('uid', $userId)
            ->where('pay_date', 'like', '20%')
            ->selectRaw('DISTINCT SUBSTRING(pay_date, 1, 4) as year')
            ->pluck('year')
            ->map(fn ($year) => (int) $year)
            ->toArray();

        $taxDocYears = FileForTaxDocument::where('user_id', $userId)
            ->select('tax_year')
            ->distinct()
            ->pluck('tax_year')
            ->map(fn ($year) => (int) $year)
            ->toArray();

        $scheduleCYears ??= $this->scheduleCSummaryService->availableYears($userId);

        $years = array_unique(array_merge($payslipYears, $taxDocYears, $scheduleCYears));
        rsort($years);

        $currentYear = (int) date('Y');
        if (! in_array($currentYear, $years, true)) {
            array_unshift($years, $currentYear);
        }

        return array_values($years);
    }

    /**
     * @return array<int, mixed>
     */
    private function payslipsForYear(int $userId, int $year): array
    {
        $start = "{$year}-01-01";
        $end = "{$year}-12-31";

        $data = FinPayslips::where('uid', $userId)
            ->whereBetween('pay_date', [$start, $end])
            ->orderBy('pay_date', 'asc')
            ->get();

        $data->transform(function ($payslip) {
            if (is_string($payslip->other)) {
                $payslip->other = json_decode($payslip->other, true);
            }

            return $payslip;
        });

        return $data->toArray();
    }

    private function pendingReviewCount(int $userId, int $year): int
    {
        return FileForTaxDocument::where('user_id', $userId)
            ->where('tax_year', $year)
            ->where('genai_status', 'parsed')
            ->where('is_reviewed', false)
            ->count();
    }

    /**
     * @param  string[]  $formTypes
     * @return array<int, mixed>
     */
    private function documentsForYear(int $userId, int $year, array $formTypes): array
    {
        return FileForTaxDocument::where('user_id', $userId)
            ->where('tax_year', $year)
            ->whereIn('form_type', $formTypes)
            ->with([
                'uploader:id,name',
                'employmentEntity:id,display_name',
                'account:acct_id,acct_name',
            ])
            ->orderBy('created_at', 'desc')
            ->get()
            ->toArray();
    }

    /**
     * @return array<int, mixed>
     */
    private function accounts(int $userId): array
    {
        return FinAccounts::where('acct_owner', $userId)
            ->whereNull('when_deleted')
            ->orderBy('when_closed', 'asc')
            ->orderBy('acct_sort_order', 'asc')
            ->orderBy('acct_name', 'asc')
            ->get()
            ->values()
            ->toArray();
    }

    /**
     * @param  array<int, array<string, mixed>>  $accounts
     * @return int[]
     */
    private function activeAccountIdsForYear(array $accounts, int $year): array
    {
        $accountIds = array_values(array_filter(array_map(
            static fn (array $account): ?int => isset($account['acct_id']) ? (int) $account['acct_id'] : null,
            $accounts,
        )));

        if ($accountIds === []) {
            return [];
        }

        return FinAccountLineItems::whereIn('t_account', $accountIds)
            ->whereBetween('t_date', ["{$year}-01-01", "{$year}-12-31"])
            ->distinct()
            ->pluck('t_account')
            ->map(fn ($accountId) => (int) $accountId)
            ->toArray();
    }

    /**
     * @return array<int, array{id: int, display_name: string, type: string, is_hidden: bool}>
     */
    private function employmentEntities(int $userId): array
    {
        return FinEmploymentEntity::where('user_id', $userId)
            ->select(['id', 'display_name', 'type', 'is_hidden'])
            ->get()
            ->toArray();
    }
}
