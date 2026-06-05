<?php

namespace App\Services\Finance;

/**
 * Pure builder turning the frozen Opportunity Cost projection (`OpportunityCostProjection::toArray()`)
 * into a multi-tab workbook description consumed by OpportunityCostXlsxExportController.
 *
 * All money arithmetic flows through {@see MoneyMath}; rows hold plain JSON-serialisable numbers.
 *
 * @phpstan-type WorkbookRow array{line?: string, description: string, amount?: float, note?: string, isHeader?: bool, isTotal?: bool}
 * @phpstan-type WorkbookSheet array{name: string, rows: array<int, WorkbookRow>}
 */
class OpportunityCostWorkbookBuilder
{
    private const string SUMMARY = 'Summary';

    private const string PER_JOB = 'Per-Job';

    private const string CASH_FLOW = 'Cash-Flow';

    private const string ASSUMPTIONS = 'Assumptions';

    private const string VESTING = 'Equity Vesting Schedule';

    private const string DELTAS = 'Deltas-vs-Current';

    /**
     * @param  array<string, mixed>  $projection
     * @return array{filename: string, sheets: array<int, WorkbookSheet>}
     */
    public function build(array $projection, ?string $filename = null): array
    {
        $jobs = $this->jobs($projection);

        return [
            'filename' => $this->filename($filename),
            'sheets' => [
                $this->summarySheet($jobs),
                $this->perJobSheet($jobs),
                $this->cashFlowSheet($jobs),
                $this->assumptionsSheet($projection, $jobs),
                $this->vestingSheet($jobs),
                $this->deltasSheet($projection),
            ],
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $jobs
     * @return WorkbookSheet
     */
    private function summarySheet(array $jobs): array
    {
        $rows = [['description' => 'Opportunity cost summary', 'isHeader' => true]];

        $rows[] = ['description' => 'Total cash compensation', 'isHeader' => true];
        foreach ($jobs as $job) {
            $rows[] = ['description' => $this->jobName($job), 'amount' => $this->money($job, 'lifetime.totalCashComp')];
        }

        $rows[] = ['description' => 'Lifetime equity value (medium band)', 'isHeader' => true];
        foreach ($jobs as $job) {
            $rows[] = ['description' => $this->jobName($job), 'amount' => $this->money($job, 'lifetime.totalEquityValue.medium')];
        }

        $rows[] = ['description' => 'Lifetime total value (medium band)', 'isHeader' => true];
        foreach ($jobs as $job) {
            $rows[] = ['description' => $this->jobName($job), 'amount' => $this->money($job, 'lifetime.totalValue.medium'), 'isTotal' => true];
        }

        return ['name' => self::SUMMARY, 'rows' => $rows];
    }

    /**
     * @param  list<array<string, mixed>>  $jobs
     * @return WorkbookSheet
     */
    private function perJobSheet(array $jobs): array
    {
        $rows = [];

        foreach ($jobs as $job) {
            $rows[] = [
                'description' => $this->jobName($job),
                'note' => ($job['isCurrent'] ?? false) ? 'Current job' : 'Hypothetical offer',
                'isHeader' => true,
            ];
            $rows[] = ['description' => 'Total cash compensation', 'amount' => $this->money($job, 'lifetime.totalCashComp')];
            $rows[] = ['description' => 'Lifetime equity value — low', 'amount' => $this->money($job, 'lifetime.totalEquityValue.low')];
            $rows[] = ['description' => 'Lifetime equity value — medium', 'amount' => $this->money($job, 'lifetime.totalEquityValue.medium')];
            $rows[] = ['description' => 'Lifetime equity value — high', 'amount' => $this->money($job, 'lifetime.totalEquityValue.high')];
            $rows[] = ['description' => 'Lifetime total value — low', 'amount' => $this->money($job, 'lifetime.totalValue.low')];
            $rows[] = ['description' => 'Lifetime total value — medium', 'amount' => $this->money($job, 'lifetime.totalValue.medium')];
            $rows[] = ['description' => 'Lifetime total value — high', 'amount' => $this->money($job, 'lifetime.totalValue.high'), 'isTotal' => true];
        }

        return ['name' => self::PER_JOB, 'rows' => $rows];
    }

    /**
     * @param  list<array<string, mixed>>  $jobs
     * @return WorkbookSheet
     */
    private function cashFlowSheet(array $jobs): array
    {
        $rows = [];

        foreach ($jobs as $job) {
            $rows[] = ['description' => $this->jobName($job), 'isHeader' => true];
            $annualFcf = [];

            foreach ($this->rowsOf($job, 'annual') as $year) {
                $fcf = $this->numeric($year, 'freeCashFlow');
                $annualFcf[] = $fcf;
                $rows[] = [
                    'line' => $this->year($year),
                    'description' => 'Free cash flow',
                    'amount' => $fcf,
                ];
            }

            $rows[] = ['description' => 'Total free cash flow', 'amount' => MoneyMath::sum($annualFcf), 'isTotal' => true];
        }

        return ['name' => self::CASH_FLOW, 'rows' => $rows];
    }

    /**
     * @param  array<string, mixed>  $projection
     * @param  list<array<string, mixed>>  $jobs
     * @return WorkbookSheet
     */
    private function assumptionsSheet(array $projection, array $jobs): array
    {
        $currentJobId = $projection['currentJobId'] ?? null;

        $rows = [
            ['description' => 'Planning assumptions', 'isHeader' => true],
            ['description' => 'Start year', 'note' => (string) (int) ($projection['startYear'] ?? 0)],
            ['description' => 'Horizon (years)', 'note' => (string) (int) ($projection['horizonYears'] ?? 0)],
            ['description' => 'Current job', 'note' => is_string($currentJobId) && $currentJobId !== '' ? $currentJobId : 'None'],
            ['description' => 'Jobs compared', 'note' => (string) count($jobs)],
            ['description' => 'Warnings', 'isHeader' => true],
        ];

        $warnings = is_array($projection['warnings'] ?? null) ? array_values(array_filter($projection['warnings'], 'is_string')) : [];
        if ($warnings === []) {
            $rows[] = ['description' => 'None', 'note' => 'No warnings reported.'];
        } else {
            foreach ($warnings as $warning) {
                $rows[] = ['description' => 'Warning', 'note' => $warning];
            }
        }

        return ['name' => self::ASSUMPTIONS, 'rows' => $rows];
    }

    /**
     * @param  list<array<string, mixed>>  $jobs
     * @return WorkbookSheet
     */
    private function vestingSheet(array $jobs): array
    {
        $rows = [];

        foreach ($jobs as $job) {
            $rows[] = ['description' => $this->jobName($job), 'isHeader' => true];

            $rows[] = ['description' => 'Annual equity value', 'isHeader' => true];
            foreach ($this->rowsOf($job, 'annual') as $year) {
                $proceeds = $this->numeric($year, 'shareSaleProceeds');
                $exercise = $this->numeric($year, 'exerciseOutlay');
                $rows[] = [
                    'line' => $this->year($year),
                    'description' => 'Vested & liquid equity',
                    'amount' => $this->numeric($year, 'vestedLiquidEquity'),
                    'note' => 'Proceeds '.$this->dollars($proceeds).' − exercise outlay '.$this->dollars($exercise).' (net '.$this->dollars(MoneyMath::subtract($proceeds, $exercise)).')',
                ];
            }

            $rows[] = ['description' => 'Grant vesting (shares)', 'isHeader' => true];
            foreach ($this->rowsOf($job, 'vesting') as $vest) {
                $rows[] = [
                    'line' => $this->year($vest),
                    'description' => strtoupper((string) ($vest['type'] ?? '')).' · '.(string) ($vest['grantId'] ?? ''),
                    'note' => 'Vested '.$this->shares($this->numeric($vest, 'vestedShares')).' · exercisable '.$this->shares($this->numeric($vest, 'exercisableShares')),
                ];
            }
        }

        return ['name' => self::VESTING, 'rows' => $rows];
    }

    /**
     * @param  array<string, mixed>  $projection
     * @return WorkbookSheet
     */
    private function deltasSheet(array $projection): array
    {
        $rows = [['description' => 'Deltas vs current job', 'isHeader' => true]];

        $deltas = is_array($projection['deltasVsCurrent'] ?? null)
            ? array_values(array_filter($projection['deltasVsCurrent'], 'is_array'))
            : [];

        if ($deltas === []) {
            $rows[] = ['description' => 'No current job baseline', 'note' => 'Deltas are computed against an empty baseline.'];

            return ['name' => self::DELTAS, 'rows' => $rows];
        }

        foreach ($deltas as $delta) {
            $low = $this->numeric($delta, 'totalValueDelta.low');
            $high = $this->numeric($delta, 'totalValueDelta.high');
            $rows[] = [
                'description' => (string) ($delta['name'] ?? ''),
                'amount' => $this->numeric($delta, 'totalValueDelta.medium'),
                'note' => 'Cash Δ '.$this->dollars($this->numeric($delta, 'cashCompDelta')).' · low Δ '.$this->dollars($low).' · high Δ '.$this->dollars($high),
                'isTotal' => true,
            ];
        }

        return ['name' => self::DELTAS, 'rows' => $rows];
    }

    /**
     * @param  array<string, mixed>  $projection
     * @return list<array<string, mixed>>
     */
    private function jobs(array $projection): array
    {
        return is_array($projection['jobs'] ?? null)
            ? array_values(array_filter($projection['jobs'], 'is_array'))
            : [];
    }

    /**
     * @param  array<string, mixed>  $job
     * @return list<array<string, mixed>>
     */
    private function rowsOf(array $job, string $key): array
    {
        return is_array($job[$key] ?? null)
            ? array_values(array_filter($job[$key], 'is_array'))
            : [];
    }

    /**
     * @param  array<string, mixed>  $job
     */
    private function jobName(array $job): string
    {
        return (string) ($job['name'] ?? 'Job');
    }

    /**
     * @param  array<string, mixed>  $source
     */
    private function money(array $source, string $path): float
    {
        return MoneyMath::round($this->numeric($source, $path));
    }

    /**
     * @param  array<string, mixed>  $source
     */
    private function numeric(array $source, string $path): float
    {
        $value = $source;

        foreach (explode('.', $path) as $segment) {
            if (! is_array($value) || ! array_key_exists($segment, $value)) {
                return 0.0;
            }

            $value = $value[$segment];
        }

        return is_numeric($value) ? (float) $value : 0.0;
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private function year(array $row): string
    {
        return (string) (int) ($row['year'] ?? 0);
    }

    private function dollars(float $value): string
    {
        return '$'.number_format($value, 2);
    }

    private function shares(float $value): string
    {
        return rtrim(rtrim(number_format($value, 4, '.', ''), '0'), '.') ?: '0';
    }

    private function filename(?string $filename): string
    {
        $filename = trim((string) $filename);

        return $filename !== '' ? $filename : 'opportunity-cost-comparison.xlsx';
    }
}
