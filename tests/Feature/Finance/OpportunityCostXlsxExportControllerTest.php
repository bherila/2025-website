<?php

namespace Tests\Feature\Finance;

use App\Services\Planning\OpportunityCost\OpportunityCostInputs;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Tests\TestCase;

class OpportunityCostXlsxExportControllerTest extends TestCase
{
    public function test_anonymous_user_can_export_a_valid_workbook(): void
    {
        $response = $this->postJson('/api/financial-planning/opportunity-cost/export-xlsx', [
            'inputs' => OpportunityCostInputs::defaults(),
            'filename' => 'opportunity-cost-comparison.xlsx',
        ]);

        $response->assertOk();
        $response->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        $this->assertStringContainsString('attachment;', (string) $response->headers->get('content-disposition'));
        $this->assertNotEmpty($response->getContent());

        $tempPath = tempnam(sys_get_temp_dir(), 'oc-export-test');
        file_put_contents($tempPath, $response->getContent());
        $spreadsheet = IOFactory::load($tempPath);
        @unlink($tempPath);

        $sheetNames = [];
        foreach ($spreadsheet->getAllSheets() as $sheet) {
            $sheetNames[] = $sheet->getTitle();
        }

        $this->assertSame(
            ['Summary', 'Per-Job', 'Cash-Flow', 'Assumptions', 'Equity Vesting Schedule', 'Deltas-vs-Current', 'Equity Tax Summary', 'Equity Tax Annual', 'Equity Tax Sources'],
            $sheetNames,
        );
        $this->assertSame('Line', $spreadsheet->getSheetByName('Summary')?->getCell('A1')->getValue());
    }

    public function test_oversized_planning_horizon_is_rejected(): void
    {
        $inputs = OpportunityCostInputs::defaults();
        $inputs['horizonYears'] = 99;

        $response = $this->postJson('/api/financial-planning/opportunity-cost/export-xlsx', [
            'inputs' => $inputs,
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['inputs.horizonYears']);
    }

    public function test_too_many_hypothetical_jobs_are_rejected(): void
    {
        $inputs = OpportunityCostInputs::defaults();
        $template = $inputs['hypotheticalJobs'][0];
        $inputs['hypotheticalJobs'] = [];
        for ($i = 0; $i < 11; $i++) {
            $job = $template;
            $job['id'] = "hyp-{$i}";
            $inputs['hypotheticalJobs'][] = $job;
        }

        $response = $this->postJson('/api/financial-planning/opportunity-cost/export-xlsx', [
            'inputs' => $inputs,
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['inputs.hypotheticalJobs']);
    }
}
