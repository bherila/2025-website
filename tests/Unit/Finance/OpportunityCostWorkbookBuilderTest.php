<?php

namespace Tests\Unit\Finance;

use App\Services\Finance\MoneyMath;
use App\Services\Finance\OpportunityCostWorkbookBuilder;
use PHPUnit\Framework\TestCase;

class OpportunityCostWorkbookBuilderTest extends TestCase
{
    public function test_builds_the_six_tabs_in_order(): void
    {
        $workbook = $this->build($this->goldenProjection());

        $names = array_map(fn (array $sheet): string => $sheet['name'], $workbook['sheets']);

        $this->assertSame(
            ['Summary', 'Per-Job', 'Cash-Flow', 'Assumptions', 'Equity Vesting Schedule', 'Deltas-vs-Current'],
            $names,
        );
    }

    public function test_summary_total_value_rows_match_projection_lifetime(): void
    {
        $projection = $this->goldenProjection();
        $rows = $this->sheet($this->build($projection), 'Summary')['rows'];

        $totalRows = array_values(array_filter($rows, fn (array $row): bool => ! empty($row['isTotal'])));
        $this->assertCount(count($projection['jobs']), $totalRows);

        foreach ($projection['jobs'] as $index => $job) {
            $this->assertSame($job['name'], $totalRows[$index]['description']);
            $this->assertSame($job['lifetime']['totalValue']['medium'], $totalRows[$index]['amount']);
        }
    }

    public function test_cash_flow_total_equals_sum_of_annual_free_cash_flow(): void
    {
        $projection = $this->goldenProjection();
        $rows = $this->sheet($this->build($projection), 'Cash-Flow')['rows'];

        $totals = array_values(array_filter($rows, fn (array $row): bool => ($row['description'] ?? null) === 'Total free cash flow'));
        $this->assertCount(count($projection['jobs']), $totals);

        foreach ($projection['jobs'] as $index => $job) {
            $expected = MoneyMath::sum(array_map(fn (array $year): float => (float) $year['freeCashFlow'], $job['annual']));
            $this->assertSame($expected, $totals[$index]['amount']);
            $this->assertTrue($totals[$index]['isTotal']);
        }
    }

    public function test_vesting_sheet_consumes_projection_values_without_rederiving(): void
    {
        $projection = $this->goldenProjection();
        $rows = $this->sheet($this->build($projection), 'Equity Vesting Schedule')['rows'];

        $equityRows = array_values(array_filter($rows, fn (array $row): bool => ($row['description'] ?? null) === 'Vested & liquid equity'));
        $grantRows = array_values(array_filter($rows, fn (array $row): bool => str_contains($row['description'] ?? '', ' · ')));

        $expectedAnnual = 0;
        $expectedGrants = 0;
        $expectedEquityAmounts = [];
        foreach ($projection['jobs'] as $job) {
            $expectedAnnual += count($job['annual']);
            $expectedGrants += count($job['vesting']);
            foreach ($job['annual'] as $year) {
                $expectedEquityAmounts[] = (float) $year['vestedLiquidEquity'];
            }
        }

        $this->assertCount($expectedAnnual, $equityRows);
        $this->assertCount($expectedGrants, $grantRows);
        $this->assertSame($expectedEquityAmounts, array_map(fn (array $row): float => $row['amount'], $equityRows));
    }

    public function test_deltas_tab_matches_server_computed_deltas(): void
    {
        $projection = $this->goldenProjection();
        $rows = $this->sheet($this->build($projection), 'Deltas-vs-Current')['rows'];

        $dataRows = array_values(array_filter($rows, fn (array $row): bool => isset($row['amount'])));
        $this->assertCount(count($projection['deltasVsCurrent']), $dataRows);

        foreach ($projection['deltasVsCurrent'] as $index => $delta) {
            $this->assertSame($delta['name'], $dataRows[$index]['description']);
            $this->assertSame($delta['totalValueDelta']['medium'], $dataRows[$index]['amount']);
        }
    }

    public function test_no_current_job_renders_empty_baseline_delta_row(): void
    {
        $projection = $this->goldenProjection();
        $projection['jobs'] = array_values(array_filter($projection['jobs'], fn (array $job): bool => ! $job['isCurrent']));
        $projection['currentJobId'] = null;
        $projection['deltasVsCurrent'] = [];

        $workbook = $this->build($projection);
        $deltaRows = $this->sheet($workbook, 'Deltas-vs-Current')['rows'];
        $summaryRows = $this->sheet($workbook, 'Summary')['rows'];

        $this->assertSame('No current job baseline', $deltaRows[1]['description']);
        $this->assertNotEmpty(array_filter($summaryRows, fn (array $row): bool => ! empty($row['isTotal'])));
    }

    public function test_filename_defaults_and_honours_override(): void
    {
        $this->assertSame('opportunity-cost-comparison.xlsx', $this->build($this->goldenProjection())['filename']);
        $this->assertSame('offer.xlsx', $this->build($this->goldenProjection(), 'offer.xlsx')['filename']);
    }

    /**
     * @param  array<string, mixed>  $projection
     * @return array{filename: string, sheets: array<int, array{name: string, rows: array<int, array<string, mixed>>}>}
     */
    private function build(array $projection, ?string $filename = null): array
    {
        return (new OpportunityCostWorkbookBuilder)->build($projection, $filename);
    }

    /**
     * @param  array{sheets: array<int, array{name: string, rows: array<int, array<string, mixed>>}>}  $workbook
     * @return array{name: string, rows: array<int, array<string, mixed>>}
     */
    private function sheet(array $workbook, string $name): array
    {
        foreach ($workbook['sheets'] as $sheet) {
            if ($sheet['name'] === $name) {
                return $sheet;
            }
        }

        $this->fail("Sheet [{$name}] not found.");
    }

    /**
     * @return array<string, mixed>
     */
    private function goldenProjection(): array
    {
        $path = __DIR__.'/../../Fixtures/opportunity-cost/golden-projection.json';

        return json_decode((string) file_get_contents($path), true);
    }
}
