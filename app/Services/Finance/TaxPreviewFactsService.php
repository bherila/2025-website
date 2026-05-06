<?php

namespace App\Services\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\UserDeduction;
use App\Models\User;
use App\Services\Finance\CapitalGains\CapitalGainsTaxReportService;
use App\Services\Finance\CapitalGains\Form8949ReportRow;
use App\Services\Finance\CapitalGains\ScheduleDRollupInput;
use App\Services\Finance\CapitalGains\WashSaleAdjustment;
use App\Services\Finance\TaxPreviewFacts\Builders\Form1116FactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\Form4952FactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\Form8949FactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\Form8960FactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\Form8995FactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\Schedule1FactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\ScheduleAFactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\ScheduleBFactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\ScheduleCFactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\ScheduleDFactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\ScheduleEFactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\ScheduleFFactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\ScheduleSEFactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Data\Form8960Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Form8995Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Schedule1Facts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleBFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleCFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleDFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleSEFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;
use App\Services\Finance\TaxPreviewFacts\Data\TaxPreviewFacts;
use Carbon\CarbonImmutable;
use InvalidArgumentException;

class TaxPreviewFactsService
{
    private const array SUPPORTED_SLICES = ['all', 'schedule1', 'scheduleB', 'scheduleC', 'scheduleF', 'scheduleSE', 'form4952', 'scheduleA', 'scheduleE', 'scheduleD', 'form8949', 'form1116', 'form8960', 'form8995'];

    public function __construct(
        private readonly CapitalGainsTaxReportService $capitalGainsTaxReportService,
        private readonly Schedule1FactsBuilder $schedule1FactsBuilder,
        private readonly ScheduleBFactsBuilder $scheduleBFactsBuilder,
        private readonly ScheduleCFactsBuilder $scheduleCFactsBuilder,
        private readonly Form4952FactsBuilder $form4952FactsBuilder,
        private readonly ScheduleAFactsBuilder $scheduleAFactsBuilder,
        private readonly ScheduleEFactsBuilder $scheduleEFactsBuilder,
        private readonly ScheduleFFactsBuilder $scheduleFFactsBuilder,
        private readonly ScheduleSEFactsBuilder $scheduleSEFactsBuilder,
        private readonly ScheduleDFactsBuilder $scheduleDFactsBuilder,
        private readonly Form8949FactsBuilder $form8949FactsBuilder,
        private readonly Form1116FactsBuilder $form1116FactsBuilder,
        private readonly Form8960FactsBuilder $form8960FactsBuilder,
        private readonly Form8995FactsBuilder $form8995FactsBuilder,
    ) {}

    /**
     * @return array<string>
     */
    public static function supportedSlices(): array
    {
        return self::SUPPORTED_SLICES;
    }

    public function factsForYear(int $userId, int $year): TaxPreviewFacts
    {
        $documents = $this->documentsForYear($userId, $year);

        return $this->factsFromDocuments(
            $year,
            $documents,
            $this->shortDividendItemizedDeduction($userId, $year),
            $this->marginInterestSources($userId, $year),
            $userId,
            $this->userDeductionsForYear($userId, $year),
        );
    }

    /**
     * @param  iterable<FileForTaxDocument>  $documents
     * @param  TaxFactSource[]  $marginInterestSources
     * @param  UserDeduction[]  $userDeductions
     */
    public function factsFromDocuments(
        int $year,
        iterable $documents,
        float $shortDividendDeduction = 0.0,
        array $marginInterestSources = [],
        ?int $userId = null,
        array $userDeductions = [],
        ?float $magi = null,
    ): TaxPreviewFacts {
        $k1Docs = [];
        $docs1099 = [];
        $w2Docs = [];

        foreach ($documents as $document) {
            if ($this->formType($document) === 'k1') {
                $k1Docs[] = $document;
            } elseif (in_array($this->formType($document), FileForTaxDocument::W2_FORM_TYPES, true)) {
                $w2Docs[] = $document;
            } else {
                $docs1099[] = $document;
            }
        }

        $scheduleB = $this->scheduleBFactsBuilder->build($k1Docs, $docs1099);
        $form4952 = $this->form4952FactsBuilder->build($k1Docs, $docs1099, $scheduleB, $shortDividendDeduction, $marginInterestSources);
        $scheduleE = $this->scheduleEFactsBuilder->build($k1Docs, $docs1099);
        $scheduleC = $userId !== null ? $this->scheduleCFactsBuilder->build($userId, $year) : ScheduleCFacts::empty();
        $scheduleF = $this->scheduleFFactsBuilder->build($userDeductions);
        $isMarried = $this->isMarried($userId, $year);
        $scheduleSE = $this->scheduleSEFactsBuilder->build($k1Docs, $w2Docs, $scheduleC, $scheduleF, $year, $userId, $isMarried);
        if ($userId === null && $this->containsCapitalGainsDocuments($docs1099)) {
            throw new InvalidArgumentException('A user id is required to compute capital-gains tax preview facts from 1099-B or broker 1099 documents.');
        }

        $capitalGainsReport = $userId !== null
            ? $this->capitalGainsTaxReportService->reportForUserYear($userId, $year)
            : $this->emptyCapitalGainsReport($year);
        $scheduleD = $this->scheduleDFactsBuilder->build($k1Docs, $docs1099, $capitalGainsReport['scheduleDRollup']);
        $schedule1 = $this->schedule1FactsBuilder->build($k1Docs, $docs1099, $scheduleC, $scheduleSE, $scheduleF);
        $estimatedMagi = $magi ?? ($userId !== null ? $this->estimatedMagi($w2Docs, $docs1099, $scheduleB, $schedule1, $scheduleD) : null);
        $taxableIncomeBeforeQbi = $this->taxableIncomeBeforeQbi($estimatedMagi ?? 0.0, $year, $isMarried);

        return new TaxPreviewFacts(
            year: $year,
            scheduleC: $scheduleC,
            scheduleF: $scheduleF,
            scheduleSE: $scheduleSE,
            schedule1: $schedule1,
            scheduleB: $scheduleB,
            form4952: $form4952,
            scheduleA: $this->scheduleAFactsBuilder->build($k1Docs, $w2Docs, $userDeductions, $form4952, $year, $estimatedMagi),
            scheduleE: $scheduleE,
            scheduleD: $scheduleD,
            form8949: $this->form8949FactsBuilder->build($capitalGainsReport),
            form1116: $this->form1116FactsBuilder->build($k1Docs, $docs1099),
            form8960: $this->form8960FactsBuilder->build($scheduleB, $scheduleE, $scheduleD, $form4952, $estimatedMagi, $userId, $year),
            form8995: $this->form8995FactsBuilder->build($k1Docs, $scheduleC, $scheduleE, $scheduleSE, $scheduleD, $taxableIncomeBeforeQbi, $year, $isMarried),
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function arrayForYear(int $userId, int $year, string $slice = 'all'): array
    {
        if ($slice === 'all') {
            return $this->factsForYear($userId, $year)->toArray();
        }

        $documents = $this->documentsForYear($userId, $year);
        [$k1Docs, $docs1099, $w2Docs] = $this->partitionDocuments($documents);

        return match ($slice) {
            'schedule1' => [
                'year' => $year,
                'schedule1' => $this->schedule1FactsForSlice($k1Docs, $docs1099, $w2Docs, $userId, $year)->toArray(),
            ],
            'scheduleB' => [
                'year' => $year,
                'scheduleB' => $this->scheduleBFactsBuilder->build($k1Docs, $docs1099)->toArray(),
            ],
            'scheduleC' => [
                'year' => $year,
                'scheduleC' => $this->scheduleCFactsBuilder->build($userId, $year)->toArray(),
            ],
            'scheduleF' => [
                'year' => $year,
                'scheduleF' => $this->scheduleFFactsBuilder->build($this->userDeductionsForYear($userId, $year))->toArray(),
            ],
            'scheduleSE' => [
                'year' => $year,
                'scheduleSE' => $this->scheduleSEFactsForSlice($k1Docs, $w2Docs, $userId, $year)->toArray(),
            ],
            'form4952' => [
                'year' => $year,
                'form4952' => $this->form4952FactsBuilder->build(
                    $k1Docs,
                    $docs1099,
                    $this->scheduleBFactsBuilder->build($k1Docs, $docs1099),
                    $this->shortDividendItemizedDeduction($userId, $year),
                    $this->marginInterestSources($userId, $year),
                )->toArray(),
            ],
            'scheduleA' => [
                'year' => $year,
                'scheduleA' => $this->scheduleAFactsBuilder->build(
                    $k1Docs,
                    $w2Docs,
                    $this->userDeductionsForYear($userId, $year),
                    $this->form4952FactsBuilder->build(
                        $k1Docs,
                        $docs1099,
                        $this->scheduleBFactsBuilder->build($k1Docs, $docs1099),
                        $this->shortDividendItemizedDeduction($userId, $year),
                        $this->marginInterestSources($userId, $year),
                    ),
                    $year,
                    $this->estimatedMagiForSlice($k1Docs, $docs1099, $w2Docs, $userId, $year),
                )->toArray(),
            ],
            'scheduleE' => [
                'year' => $year,
                'scheduleE' => $this->scheduleEFactsBuilder->build($k1Docs, $docs1099)->toArray(),
            ],
            'scheduleD' => [
                'year' => $year,
                'scheduleD' => $this->scheduleDFactsBuilder->build($k1Docs, $docs1099, $this->capitalGainsTaxReportService->reportForUserYear($userId, $year)['scheduleDRollup'])->toArray(),
            ],
            'form8949' => [
                'year' => $year,
                'form8949' => $this->form8949FactsBuilder->build($this->capitalGainsTaxReportService->reportForUserYear($userId, $year))->toArray(),
            ],
            'form1116' => [
                'year' => $year,
                'form1116' => $this->form1116FactsBuilder->build($k1Docs, $docs1099)->toArray(),
            ],
            'form8960' => [
                'year' => $year,
                'form8960' => $this->form8960FactsForSlice($k1Docs, $docs1099, $w2Docs, $userId, $year)->toArray(),
            ],
            'form8995' => [
                'year' => $year,
                'form8995' => $this->form8995FactsForSlice($k1Docs, $docs1099, $w2Docs, $userId, $year)->toArray(),
            ],
            default => $this->factsForYear($userId, $year)->toArray(),
        };
    }

    /**
     * @return iterable<FileForTaxDocument>
     */
    private function documentsForYear(int $userId, int $year): iterable
    {
        return FileForTaxDocument::where('user_id', $userId)
            ->where('tax_year', $year)
            ->whereIn('form_type', array_values(array_unique(array_merge(FileForTaxDocument::ACCOUNT_FORM_TYPES, FileForTaxDocument::W2_FORM_TYPES))))
            ->with([
                'employmentEntity:id,display_name',
                'account:acct_id,acct_name,acct_number',
                'accountLinks.account:acct_id,acct_name,acct_number',
            ])
            ->orderBy('created_at', 'desc')
            ->get();
    }

    /**
     * @param  iterable<FileForTaxDocument>  $documents
     * @return array{0:FileForTaxDocument[],1:FileForTaxDocument[],2:FileForTaxDocument[]}
     */
    private function partitionDocuments(iterable $documents): array
    {
        $k1Docs = [];
        $docs1099 = [];
        $w2Docs = [];

        foreach ($documents as $document) {
            if ($this->formType($document) === 'k1') {
                $k1Docs[] = $document;
            } elseif (in_array($this->formType($document), FileForTaxDocument::W2_FORM_TYPES, true)) {
                $w2Docs[] = $document;
            } else {
                $docs1099[] = $document;
            }
        }

        return [$k1Docs, $docs1099, $w2Docs];
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
            'scheduleC' => [
                'year' => $facts['year'],
                'scheduleC' => $facts['scheduleC'],
            ],
            'scheduleF' => [
                'year' => $facts['year'],
                'scheduleF' => $facts['scheduleF'],
            ],
            'scheduleSE' => [
                'year' => $facts['year'],
                'scheduleSE' => $facts['scheduleSE'],
            ],
            'form4952' => [
                'year' => $facts['year'],
                'form4952' => $facts['form4952'],
            ],
            'scheduleA' => [
                'year' => $facts['year'],
                'scheduleA' => $facts['scheduleA'],
            ],
            'scheduleE' => [
                'year' => $facts['year'],
                'scheduleE' => $facts['scheduleE'],
            ],
            'scheduleD' => [
                'year' => $facts['year'],
                'scheduleD' => $facts['scheduleD'],
            ],
            'form8949' => [
                'year' => $facts['year'],
                'form8949' => $facts['form8949'],
            ],
            'form1116' => [
                'year' => $facts['year'],
                'form1116' => $facts['form1116'],
            ],
            'form8960' => [
                'year' => $facts['year'],
                'form8960' => $facts['form8960'],
            ],
            'form8995' => [
                'year' => $facts['year'],
                'form8995' => $facts['form8995'],
            ],
            default => $facts,
        };
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  FileForTaxDocument[]  $docs1099
     * @param  FileForTaxDocument[]  $w2Docs
     */
    private function schedule1FactsForSlice(array $k1Docs, array $docs1099, array $w2Docs, int $userId, int $year): Schedule1Facts
    {
        $scheduleC = $this->scheduleCFactsBuilder->build($userId, $year);
        $scheduleF = $this->scheduleFFactsBuilder->build($this->userDeductionsForYear($userId, $year));
        $scheduleSE = $this->scheduleSEFactsBuilder->build($k1Docs, $w2Docs, $scheduleC, $scheduleF, $year, $userId, $this->isMarried($userId, $year));

        return $this->schedule1FactsBuilder->build($k1Docs, $docs1099, $scheduleC, $scheduleSE, $scheduleF);
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  FileForTaxDocument[]  $w2Docs
     */
    private function scheduleSEFactsForSlice(array $k1Docs, array $w2Docs, int $userId, int $year): ScheduleSEFacts
    {
        $scheduleC = $this->scheduleCFactsBuilder->build($userId, $year);
        $scheduleF = $this->scheduleFFactsBuilder->build($this->userDeductionsForYear($userId, $year));

        return $this->scheduleSEFactsBuilder->build($k1Docs, $w2Docs, $scheduleC, $scheduleF, $year, $userId, $this->isMarried($userId, $year));
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  FileForTaxDocument[]  $docs1099
     * @param  FileForTaxDocument[]  $w2Docs
     */
    private function form8960FactsForSlice(array $k1Docs, array $docs1099, array $w2Docs, int $userId, int $year): Form8960Facts
    {
        $scheduleB = $this->scheduleBFactsBuilder->build($k1Docs, $docs1099);
        $form4952 = $this->form4952FactsBuilder->build(
            $k1Docs,
            $docs1099,
            $scheduleB,
            $this->shortDividendItemizedDeduction($userId, $year),
            $this->marginInterestSources($userId, $year),
        );
        $scheduleE = $this->scheduleEFactsBuilder->build($k1Docs, $docs1099);
        $scheduleD = $this->scheduleDFactsBuilder->build($k1Docs, $docs1099, $this->capitalGainsTaxReportService->reportForUserYear($userId, $year)['scheduleDRollup']);

        $scheduleC = $this->scheduleCFactsBuilder->build($userId, $year);
        $scheduleF = $this->scheduleFFactsBuilder->build($this->userDeductionsForYear($userId, $year));
        $scheduleSE = $this->scheduleSEFactsBuilder->build($k1Docs, $w2Docs, $scheduleC, $scheduleF, $year, $userId, $this->isMarried($userId, $year));
        $schedule1 = $this->schedule1FactsBuilder->build($k1Docs, $docs1099, $scheduleC, $scheduleSE, $scheduleF);
        $magi = $this->estimatedMagi($w2Docs, $docs1099, $scheduleB, $schedule1, $scheduleD);

        return $this->form8960FactsBuilder->build($scheduleB, $scheduleE, $scheduleD, $form4952, $magi, $userId, $year);
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  FileForTaxDocument[]  $docs1099
     * @param  FileForTaxDocument[]  $w2Docs
     */
    private function form8995FactsForSlice(array $k1Docs, array $docs1099, array $w2Docs, int $userId, int $year): Form8995Facts
    {
        $scheduleB = $this->scheduleBFactsBuilder->build($k1Docs, $docs1099);
        $scheduleE = $this->scheduleEFactsBuilder->build($k1Docs, $docs1099);
        $scheduleD = $this->scheduleDFactsBuilder->build($k1Docs, $docs1099, $this->capitalGainsTaxReportService->reportForUserYear($userId, $year)['scheduleDRollup']);
        $scheduleC = $this->scheduleCFactsBuilder->build($userId, $year);
        $scheduleF = $this->scheduleFFactsBuilder->build($this->userDeductionsForYear($userId, $year));
        $isMarried = $this->isMarried($userId, $year);
        $scheduleSE = $this->scheduleSEFactsBuilder->build($k1Docs, $w2Docs, $scheduleC, $scheduleF, $year, $userId, $isMarried);
        $schedule1 = $this->schedule1FactsBuilder->build($k1Docs, $docs1099, $scheduleC, $scheduleSE, $scheduleF);
        $magi = $this->estimatedMagi($w2Docs, $docs1099, $scheduleB, $schedule1, $scheduleD);

        return $this->form8995FactsBuilder->build($k1Docs, $scheduleC, $scheduleE, $scheduleSE, $scheduleD, $this->taxableIncomeBeforeQbi($magi, $year, $isMarried), $year, $isMarried);
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  FileForTaxDocument[]  $docs1099
     * @param  FileForTaxDocument[]  $w2Docs
     */
    private function estimatedMagiForSlice(array $k1Docs, array $docs1099, array $w2Docs, int $userId, int $year): float
    {
        $scheduleB = $this->scheduleBFactsBuilder->build($k1Docs, $docs1099);
        $scheduleC = $this->scheduleCFactsBuilder->build($userId, $year);
        $scheduleF = $this->scheduleFFactsBuilder->build($this->userDeductionsForYear($userId, $year));
        $scheduleSE = $this->scheduleSEFactsBuilder->build($k1Docs, $w2Docs, $scheduleC, $scheduleF, $year, $userId, $this->isMarried($userId, $year));
        $schedule1 = $this->schedule1FactsBuilder->build($k1Docs, $docs1099, $scheduleC, $scheduleSE, $scheduleF);
        $scheduleD = $this->scheduleDFactsBuilder->build($k1Docs, $docs1099, $this->capitalGainsTaxReportService->reportForUserYear($userId, $year)['scheduleDRollup']);

        return $this->estimatedMagi($w2Docs, $docs1099, $scheduleB, $schedule1, $scheduleD);
    }

    /**
     * @param  FileForTaxDocument[]  $w2Docs
     * @param  FileForTaxDocument[]  $docs1099
     */
    private function estimatedMagi(array $w2Docs, array $docs1099, ScheduleBFacts $scheduleB, Schedule1Facts $schedule1, ScheduleDFacts $scheduleD): float
    {
        $capitalGainOrLoss = $scheduleD->line21LimitedLossOrGain !== 0.0
            ? $scheduleD->line21LimitedLossOrGain
            : $scheduleD->line16Combined;

        return $this->roundMoney(
            $this->w2Wages($w2Docs)
            + $scheduleB->interestTotal
            + $scheduleB->ordinaryDividendTotal
            + $this->retirementTaxableIncome($docs1099)
            + $capitalGainOrLoss
            + $schedule1->line3Total
            + $schedule1->line5Total
            + $schedule1->line6Total
            + $schedule1->line9TotalOtherIncome
            - $schedule1->line15Total
        );
    }

    private function taxableIncomeBeforeQbi(float $estimatedMagi, int $year, bool $isMarried): float
    {
        return max(0.0, MoneyMath::subtract($estimatedMagi, $this->standardDeduction($year, $isMarried)));
    }

    private function standardDeduction(int $year, bool $isMarried): float
    {
        $deductions = [
            2023 => ['single' => 13850.0, 'mfj' => 27700.0],
            2024 => ['single' => 14600.0, 'mfj' => 29200.0],
            2025 => ['single' => 15750.0, 'mfj' => 31500.0],
            2026 => ['single' => 16100.0, 'mfj' => 32200.0],
        ];
        $row = $deductions[$year] ?? $deductions[2026];

        return $isMarried ? $row['mfj'] : $row['single'];
    }

    /**
     * @param  FileForTaxDocument[]  $w2Docs
     */
    private function w2Wages(array $w2Docs): float
    {
        $total = 0.0;

        foreach ($w2Docs as $doc) {
            if (! is_array($doc->parsed_data)) {
                continue;
            }

            $total += $this->firstNumericValue($doc->parsed_data, ['box1_wages', 'wages_tips_other_compensation', 'wages']) ?? 0.0;
        }

        return $this->roundMoney($total);
    }

    /**
     * @param  FileForTaxDocument[]  $docs1099
     */
    private function retirementTaxableIncome(array $docs1099): float
    {
        $total = 0.0;

        foreach ($docs1099 as $doc) {
            if ($this->formType($doc) !== '1099_r' || ! is_array($doc->parsed_data)) {
                continue;
            }

            $total += $this->firstNumericValue($doc->parsed_data, ['box2a_taxable_amount', 'taxable_amount']) ?? 0.0;
        }

        return $this->roundMoney($total);
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array<int, string>  $keys
     */
    private function firstNumericValue(array $data, array $keys): ?float
    {
        foreach ($keys as $key) {
            $value = $data[$key] ?? null;
            if (is_int($value) || is_float($value)) {
                return (float) $value;
            }

            if (is_string($value) && is_numeric(str_replace([',', '$'], '', $value))) {
                return (float) str_replace([',', '$'], '', $value);
            }
        }

        return null;
    }

    private function isMarried(?int $userId, int $year): bool
    {
        if ($userId === null) {
            return false;
        }

        $user = User::query()->find($userId);
        if (! $user instanceof User) {
            return false;
        }

        $statusByYear = $user->getAttribute('marriage_status_by_year');
        if (! is_array($statusByYear)) {
            return false;
        }

        return (bool) ($statusByYear[(string) $year] ?? false);
    }

    /**
     * @return UserDeduction[]
     */
    private function userDeductionsForYear(int $userId, int $year): array
    {
        return UserDeduction::query()
            ->where('user_id', $userId)
            ->where('tax_year', $year)
            ->orderBy('id')
            ->get()
            ->all();
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

    /**
     * @param  FileForTaxDocument[]  $docs1099
     */
    private function containsCapitalGainsDocuments(array $docs1099): bool
    {
        foreach ($docs1099 as $doc) {
            if (in_array($this->formType($doc), ['1099_b', 'broker_1099'], true)) {
                return true;
            }
        }

        return false;
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

        $yearStart = "{$year}-01-01";
        $yearEnd = "{$year}-12-31";

        $transactions = FinAccountLineItems::whereIn('t_account', $accountIds)
            ->whereBetween('t_date', [($year - 1).'-01-01', $yearEnd])
            ->orderBy('t_account')
            ->orderBy('t_date')
            ->orderBy('t_id')
            ->get()
            ->groupBy('t_account');

        $total = 0.0;

        foreach ($transactions as $accountTransactions) {
            foreach ($accountTransactions as $transaction) {
                $transactionDate = (string) $transaction->t_date;
                if ($transactionDate < $yearStart || $transactionDate > $yearEnd) {
                    continue;
                }

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
                    $total = MoneyMath::sum([$total, abs((float) $transaction->t_amt)]);
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
            $amount = MoneyMath::sum($transactions->map(static fn (FinAccountLineItems $transaction): float => (float) $transaction->t_amt)->all());
            if ($amount === 0.0) {
                continue;
            }

            $account = $accounts->get($accountId);
            $accountName = $account instanceof FinAccounts ? $account->acct_name : "Account {$accountId}";
            $sources[] = new TaxFactSource(
                id: "account-{$accountId}-margin-interest",
                label: "{$accountName} — Margin interest paid",
                amount: $amount,
                sourceType: TaxFactSourceType::BrokerageMarginInterest,
                accountId: (int) $accountId,
                routing: TaxFactRouting::Form4952Line1,
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
        if ($this->hasLaterSameDayShortSaleOpen($transactions, $dividend, $symbol, $dividendDate)) {
            return null;
        }

        $openLots = [];

        foreach ($transactions as $transaction) {
            if ((string) $transaction->t_symbol !== $symbol || (string) $transaction->t_date > $dividendDate) {
                continue;
            }

            if ($this->isShortSaleOpen($transaction)) {
                $openLots[] = [
                    'date' => (string) $transaction->t_date,
                    'quantity' => $this->shortPositionQuantity($transaction),
                ];
            }

            if ($this->isShortSaleCover($transaction)) {
                $remainingCoverQuantity = $this->shortPositionQuantity($transaction);
                while ($remainingCoverQuantity > 0.0 && $openLots !== []) {
                    $openLots[0]['quantity'] -= $remainingCoverQuantity;
                    if ($openLots[0]['quantity'] > 0.0) {
                        $remainingCoverQuantity = 0.0;
                    } else {
                        $remainingCoverQuantity = abs($openLots[0]['quantity']);
                        array_shift($openLots);
                    }
                }
            }

            if ($transaction->getKey() !== null && $transaction->getKey() === $dividend->getKey()) {
                break;
            }
        }

        if ($openLots === []) {
            return null;
        }

        $dividendQuantity = abs((float) $dividend->t_qty);
        $selectedOpenLot = $dividendQuantity > 0.0 ? $openLots[0] : $openLots[array_key_last($openLots)];

        return CarbonImmutable::parse($selectedOpenLot['date']);
    }

    private function isShortSaleOpen(FinAccountLineItems $transaction): bool
    {
        return $this->normalizedTransactionValue($transaction) === 'sell short';
    }

    private function isShortSaleCover(FinAccountLineItems $transaction): bool
    {
        return in_array($this->normalizedTransactionValue($transaction), ['cover', 'buy to cover'], true);
    }

    private function shortPositionQuantity(FinAccountLineItems $transaction): float
    {
        $quantity = abs((float) $transaction->t_qty);

        return $quantity > 0.0 ? $quantity : 1.0;
    }

    private function normalizedTransactionValue(FinAccountLineItems $transaction): string
    {
        $method = strtolower(trim((string) $transaction->t_method));
        if ($method !== '') {
            return $method;
        }

        return strtolower(trim((string) $transaction->t_type));
    }

    /**
     * Same-day sequencing relies on the persisted transaction id order after the date sort.
     *
     * @param  FinAccountLineItems[]  $transactions
     */
    private function hasLaterSameDayShortSaleOpen(array $transactions, FinAccountLineItems $dividend, string $symbol, string $dividendDate): bool
    {
        $dividendKey = $dividend->getKey();
        if ($dividendKey === null) {
            return false;
        }

        foreach ($transactions as $transaction) {
            if ((string) $transaction->t_symbol !== $symbol || (string) $transaction->t_date !== $dividendDate) {
                continue;
            }

            $transactionKey = $transaction->getKey();
            if ($transactionKey !== null && $transactionKey > $dividendKey && $this->isShortSaleOpen($transaction)) {
                return true;
            }
        }

        return false;
    }

    private function roundMoney(float $value): float
    {
        return MoneyMath::round($value);
    }
}
