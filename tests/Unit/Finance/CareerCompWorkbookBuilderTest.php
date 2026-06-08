<?php

namespace Tests\Unit\Finance;

use App\Services\Finance\CareerCompWorkbookBuilder;
use App\Services\Finance\MoneyMath;
use PHPUnit\Framework\TestCase;

class CareerCompWorkbookBuilderTest extends TestCase
{
    public function test_builds_the_tabs_in_order(): void
    {
        $workbook = $this->build($this->goldenProjection());

        $names = array_map(fn (array $sheet): string => $sheet['name'], $workbook['sheets']);

        $this->assertSame(
            ['Summary', 'Per-Job', 'Cash-Flow', 'Liquidity', 'After-Tax Liquidity', 'Assumptions', 'Equity Vesting Schedule', 'Deltas-vs-Current', 'Equity Tax Summary', 'Equity Tax Annual', 'Equity Tax Sources'],
            $names,
        );
    }

    public function test_assumptions_sheet_lists_multiple_current_job_ids(): void
    {
        $projection = $this->goldenProjection();
        $projection['currentJobId'] = 'current-baseline';
        $projection['currentJobIds'] = ['current-main', 'current-side'];
        $projection['jobs'][0]['id'] = 'current-baseline';
        $projection['jobs'][0]['name'] = 'Current jobs';
        $projection['jobs'][0]['componentJobIds'] = ['current-main', 'current-side'];

        $rows = $this->sheet($this->build($projection), 'Assumptions')['rows'];
        $currentJobsRows = array_values(array_filter($rows, fn (array $row): bool => ($row['description'] ?? null) === 'Current jobs'));

        $this->assertSame('current-main, current-side', $currentJobsRows[0]['note'] ?? null);
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

    public function test_liquidity_sheets_use_year_rows_and_numeric_job_band_values(): void
    {
        $projection = $this->goldenProjection();
        $workbook = $this->build($projection);
        $liquidity = $this->sheet($workbook, 'Liquidity');
        $afterTaxLiquidity = $this->sheet($workbook, 'After-Tax Liquidity');
        $expectedColumnCount = 1 + (count($projection['jobs']) * 3);

        $this->assertSame($expectedColumnCount, count($liquidity['columns']));
        $this->assertSame($expectedColumnCount, count($afterTaxLiquidity['columns']));
        $this->assertSame('Year', $liquidity['columns'][0]);
        $this->assertSame('Current role Low', $liquidity['columns'][1]);
        $this->assertSame((string) $projection['startYear'], $liquidity['rows'][0]['line']);
        $this->assertSame((string) $projection['startYear'], $afterTaxLiquidity['rows'][0]['line']);

        $this->assertSame($projection['jobs'][0]['liquidity']['low'][0]['cumulativeValue'], $liquidity['rows'][0]['values'][0]);
        $this->assertIsFloat($liquidity['rows'][0]['values'][0]);
        $this->assertIsFloat($afterTaxLiquidity['rows'][0]['values'][0]);
    }

    public function test_after_tax_liquidity_sheet_reports_unavailable_when_after_tax_data_is_missing(): void
    {
        $projection = $this->goldenProjection();
        foreach ($projection['jobs'] as $index => $job) {
            unset($job['afterTax']);
            $projection['jobs'][$index] = $job;
        }

        $afterTaxLiquidity = $this->sheet($this->build($projection), 'After-Tax Liquidity');

        $this->assertArrayNotHasKey('columns', $afterTaxLiquidity);
        $this->assertSame('After-tax liquidity unavailable', $afterTaxLiquidity['rows'][0]['description']);
        $this->assertSame('Recalculate the scenario to populate after-tax projection fields.', $afterTaxLiquidity['rows'][0]['note']);
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

    public function test_equity_tax_summary_matches_after_tax_lifetime_values(): void
    {
        $projection = $this->goldenProjection();
        $rows = $this->sheet($this->build($projection), 'Equity Tax Summary')['rows'];

        $privateOffer = $projection['jobs'][1];
        $matchingRows = array_values(array_filter($rows, fn (array $row): bool => ($row['description'] ?? null) === 'After-tax total value — medium'));

        $this->assertCount(count($projection['jobs']), $matchingRows);
        $this->assertSame($privateOffer['afterTax']['lifetime']['totalValue']['medium'], $matchingRows[1]['amount']);
        $this->assertStringContainsString('Medium after-tax LTV Δ vs current', $matchingRows[1]['note']);
    }

    public function test_equity_tax_annual_sheet_includes_iso_amt_and_tax_rows(): void
    {
        $projection = $this->goldenProjection();
        $rows = $this->sheet($this->build($projection), 'Equity Tax Annual')['rows'];

        $isoRows = array_values(array_filter($rows, fn (array $row): bool => ($row['description'] ?? null) === 'ISO AMT preference'));
        $amtRows = array_values(array_filter($rows, fn (array $row): bool => ($row['description'] ?? null) === 'Estimated AMT'));
        $totalTaxRows = array_values(array_filter($rows, fn (array $row): bool => ($row['description'] ?? null) === 'Total estimated federal/AMT tax'));

        $this->assertNotEmpty($isoRows);
        $this->assertContains(80000.0, array_map(fn (array $row): float => $row['amount'], $isoRows));
        $this->assertNotEmpty($amtRows);
        $this->assertNotEmpty($totalTaxRows);
        $this->assertTrue($totalTaxRows[0]['isTotal']);
    }

    public function test_equity_tax_sheets_include_nso_and_83b_source_rows_when_present(): void
    {
        $projection = $this->projectionWithNsoAnd83b();
        $workbook = $this->build($projection);
        $annualRows = $this->sheet($workbook, 'Equity Tax Annual')['rows'];
        $sourceRows = $this->sheet($workbook, 'Equity Tax Sources')['rows'];

        $this->assertNotEmpty(array_filter($annualRows, fn (array $row): bool => ($row['description'] ?? null) === 'NSO ordinary income' && $row['amount'] === 25000.0));
        $this->assertNotEmpty(array_filter($annualRows, fn (array $row): bool => ($row['description'] ?? null) === '83(b) election source amount' && $row['amount'] === 12000.0));
        $this->assertNotEmpty(array_filter($sourceRows, fn (array $row): bool => ($row['description'] ?? null) === 'NSO ordinary income' && $row['amount'] === 25000.0));
        $this->assertNotEmpty(array_filter($sourceRows, fn (array $row): bool => ($row['description'] ?? null) === '83(b) election' && $row['amount'] === 12000.0));
    }

    public function test_filename_defaults_and_honours_override(): void
    {
        $this->assertSame('career-comparison.xlsx', $this->build($this->goldenProjection())['filename']);
        $this->assertSame('offer.xlsx', $this->build($this->goldenProjection(), 'offer.xlsx')['filename']);
    }

    /**
     * @param  array<string, mixed>  $projection
     * @return array{filename: string, sheets: array<int, array{name: string, rows: array<int, array<string, mixed>>, columns?: list<string>}>}
     */
    private function build(array $projection, ?string $filename = null): array
    {
        return (new CareerCompWorkbookBuilder)->build($projection, $filename);
    }

    /**
     * @param  array{sheets: array<int, array{name: string, rows: array<int, array<string, mixed>>, columns?: list<string>}>}  $workbook
     * @return array{name: string, rows: array<int, array<string, mixed>>, columns?: list<string>}
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
        $path = __DIR__.'/../../Fixtures/career-comparison/golden-projection.json';

        return json_decode((string) file_get_contents($path), true);
    }

    /**
     * @return array<string, mixed>
     */
    private function projectionWithNsoAnd83b(): array
    {
        $projection = $this->goldenProjection();
        $job = $projection['jobs'][0];
        $job['afterTax']['annual'][0]['nsoOrdinaryIncome'] = 25000.0;
        $job['afterTax']['annual'][0]['sourceIds'][] = 'cc-current-2026-nso-equity_comp_nso_ordinary_income';
        $job['afterTax']['annual'][0]['sourceIds'][] = 'cc-current-2026-nso-equity_comp_83b_election';
        $job['afterTax']['lifetime']['nsoOrdinaryIncome'] = 25000.0;
        $job['afterTax']['sources'][] = [
            'id' => 'cc-current-2026-nso-equity_comp_nso_ordinary_income',
            'label' => 'Current role nso equity compensation',
            'amount' => 25000.0,
            'sourceType' => 'equity_comp_nso_ordinary_income',
            'routing' => 'form_1040_nso_ordinary_income',
        ];
        $job['afterTax']['sources'][] = [
            'id' => 'cc-current-2026-nso-equity_comp_83b_election',
            'label' => 'Current role 83(b) election',
            'amount' => 12000.0,
            'sourceType' => 'equity_comp_83b_election',
            'routing' => 'equity_comp_83b_election',
        ];
        $projection['jobs'][0] = $job;

        return $projection;
    }
}
