<?php

namespace App\Services\Finance;

use App\Http\Controllers\FinanceTool\FinanceScheduleCController;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\FinPayslips;
use Illuminate\Http\Request;

class TaxPreviewDataService
{
    /**
     * Assemble all cheap-to-load data for the Tax Preview page.
     *
     * K-1 documents are NOT included — they carry large parsed_data
     * with K-3 sections and are fetched client-side on demand.
     *
     * @return array<string, mixed>
     */
    public function forYear(int $userId, int $year): array
    {
        return [
            'year' => $year,
            'availableYears' => $this->availableYears($userId),
            'payslips' => $this->payslipsForYear($userId, $year),
            'pendingReviewCount' => $this->pendingReviewCount($userId, $year),
            'reviewedW2Docs' => $this->reviewedDocs($userId, $year, FileForTaxDocument::W2_FORM_TYPES),
            'reviewed1099Docs' => $this->reviewedDocs($userId, $year, ['1099_int', '1099_div', '1099_int_c', '1099_div_c', '1099_misc']),
            'scheduleCData' => $this->scheduleCForYear($userId),
            'employmentEntities' => $this->entities($userId),
        ];
    }

    /**
     * Merge available years from payslips and Schedule C transactions.
     *
     * @return int[]
     */
    private function availableYears(int $userId): array
    {
        // Payslip years
        $payslipYears = FinPayslips::where('uid', $userId)
            ->where('pay_date', 'like', '20%')
            ->selectRaw('DISTINCT SUBSTRING(pay_date, 1, 4) as year')
            ->pluck('year')
            ->map(fn ($y) => (int) $y)
            ->toArray();

        // Tax document years
        $taxDocYears = FileForTaxDocument::where('user_id', $userId)
            ->select('tax_year')
            ->distinct()
            ->pluck('tax_year')
            ->map(fn ($y) => (int) $y)
            ->toArray();

        $years = array_unique(array_merge($payslipYears, $taxDocYears));
        rsort($years);

        // Include current year if not present
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
    private function reviewedDocs(int $userId, int $year, array $formTypes): array
    {
        return FileForTaxDocument::where('user_id', $userId)
            ->where('tax_year', $year)
            ->whereIn('form_type', $formTypes)
            ->where('is_reviewed', true)
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
     * Returns Schedule C data (all years). Year filtering is done client-side
     * since the data is used for carry-forward calculations across years.
     *
     * Note: delegates to FinanceScheduleCController which uses Auth::id() internally.
     * This works because the service is called within the auth middleware context.
     *
     * @return array<string, mixed>
     */
    private function scheduleCForYear(int $userId): array
    {
        $controller = new FinanceScheduleCController;
        $request = new Request;

        $response = app()->call([$controller, 'getSummary'], ['request' => $request]);

        // The controller returns a JsonResponse; we need the data
        $content = $response->getContent();

        return json_decode($content, true) ?? [];
    }

    /**
     * @return array<int, array{id: int, display_name: string, type: string}>
     */
    private function entities(int $userId): array
    {
        return FinEmploymentEntity::where('user_id', $userId)
            ->select(['id', 'display_name', 'type'])
            ->get()
            ->toArray();
    }
}
