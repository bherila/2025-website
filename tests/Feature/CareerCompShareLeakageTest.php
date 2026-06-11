<?php

namespace Tests\Feature;

use App\Models\CareerComparison;
use App\Models\CareerJob;
use App\Models\User;
use App\Services\Planning\CareerComp\CareerCompCalculator;
use App\Services\Planning\CareerComp\CareerCompInputs;
use App\Services\Planning\CareerComp\ComparisonShareRedactor;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Tests\TestCase;

class CareerCompShareLeakageTest extends TestCase
{
    private const string CURRENT_SALARY = '424242';

    private const string CURRENT_NAME = 'Confidential Current';

    private const string CURRENT_RSU_SYMBOL = 'HUSH';

    private const string SIDE_CURRENT_SALARY = '131313';

    private const string SIDE_CURRENT_NAME = 'Confidential Side Current';

    public function test_exclusive_share_html_omits_current_job_for_non_owner(): void
    {
        $this->withoutVite();
        $comparison = $this->persistExclusiveComparison(User::factory()->create());

        $response = $this->get("/financial-planning/career-comparison/s/{$comparison->short_code}");

        $response->assertOk();
        $content = (string) $response->getContent();
        $this->assertStringNotContainsString(self::CURRENT_SALARY, $content);
        $this->assertStringNotContainsString(self::CURRENT_NAME, $content);
        $this->assertStringNotContainsString(self::CURRENT_RSU_SYMBOL, $content);
        $this->assertStringNotContainsString(self::SIDE_CURRENT_SALARY, $content);
        $this->assertStringNotContainsString(self::SIDE_CURRENT_NAME, $content);
        $this->assertStringContainsString('"currentJob":null', $content);
        $this->assertStringContainsString('"currentJobs":[]', $content);
        $this->assertStringContainsString('"currentJobId":null', $content);
        $this->assertStringContainsString('"currentJobIds":[]', $content);
        $this->assertStringContainsString('Public Offer', $content);
    }

    public function test_owner_still_sees_current_job_on_their_exclusive_share(): void
    {
        $this->withoutVite();
        $owner = User::factory()->create();
        $comparison = $this->persistExclusiveComparison($owner);

        $response = $this->actingAs($owner)->get("/financial-planning/career-comparison/s/{$comparison->short_code}");

        $response->assertOk();
        $this->assertStringContainsString(self::CURRENT_SALARY, (string) $response->getContent());
        $this->assertStringContainsString(self::CURRENT_RSU_SYMBOL, (string) $response->getContent());
        $this->assertStringContainsString(self::SIDE_CURRENT_SALARY, (string) $response->getContent());
    }

    public function test_exclusive_share_xlsx_export_omits_current_job(): void
    {
        $inputs = $this->scenarioInputs();
        $projection = app(CareerCompCalculator::class)->project(CareerCompInputs::fromArray($inputs))->toArray();
        $redacted = app(ComparisonShareRedactor::class)->redact($inputs, $projection, ['current', 'current-side']);

        $response = $this->postJson('/api/financial-planning/career-comparison/export-xlsx', [
            'inputs' => $redacted['inputs'],
        ]);

        $response->assertOk();
        $cells = $this->workbookCellStrings((string) $response->getContent());
        $blob = implode("\n", $cells);
        $this->assertStringNotContainsString(self::CURRENT_SALARY, $blob);
        $this->assertStringNotContainsString(self::CURRENT_NAME, $blob);
        $this->assertStringNotContainsString(self::CURRENT_RSU_SYMBOL, $blob);
        $this->assertStringNotContainsString(self::SIDE_CURRENT_SALARY, $blob);
        $this->assertStringNotContainsString(self::SIDE_CURRENT_NAME, $blob);
        $this->assertStringContainsString('Public Offer', $blob);
    }

    /**
     * @return array<string, mixed>
     */
    private function scenarioInputs(): array
    {
        $inputs = CareerCompInputs::defaults();
        $mainCurrent = $inputs['currentJob'];
        $mainCurrent['id'] = 'current';
        $mainCurrent['name'] = self::CURRENT_NAME;
        $mainCurrent['comp']['baseSalary'] = (float) self::CURRENT_SALARY;
        $mainCurrent['rsuGrants'] = [[
            'id' => 'confidential-current-rsu',
            'kind' => 'hire',
            'grantDate' => '2026-01-15',
            'vestingStartDate' => null,
            'shareCount' => 100,
            'sourceAwardId' => null,
            'sourceAwardRowIds' => [],
            'symbol' => self::CURRENT_RSU_SYMBOL,
            'rsuSource' => null,
            'grantValue' => null,
            'grantPrice' => 25,
            'cliffMonths' => 0,
            'vestingYears' => 4,
            'vestingFrequency' => 'quarterly',
            'vestingSchedule' => null,
            'vestingEvents' => [[
                'vestDate' => '2026-04-15',
                'shareCount' => 25,
                'vestPrice' => 25,
            ]],
        ]];
        // Decreasing growth bands force a calculator warning that embeds the current job name,
        // so the leakage assertions exercise warning redaction, not just job/series removal.
        $mainCurrent['growthBands'] = ['lowPct' => 10.0, 'mediumPct' => 5.0, 'highPct' => 0.0];
        $sideCurrent = $mainCurrent;
        $sideCurrent['id'] = 'current-side';
        $sideCurrent['name'] = self::SIDE_CURRENT_NAME;
        $sideCurrent['comp']['baseSalary'] = (float) self::SIDE_CURRENT_SALARY;
        $inputs['currentJobs'] = [$mainCurrent, $sideCurrent];
        $inputs['currentJob'] = $mainCurrent;
        $inputs['hypotheticalJobs'][0]['name'] = 'Public Offer';
        $inputs['hypotheticalJobs'][0]['comp']['baseSalary'] = 191919.0;
        $inputs['hypotheticalJobs'][0]['retainedCurrentJobIds'] = ['current-side'];

        return $inputs;
    }

    private function persistExclusiveComparison(User $owner): CareerComparison
    {
        $inputs = CareerCompInputs::fromArray($this->scenarioInputs());
        $projection = app(CareerCompCalculator::class)->project($inputs)->toArray();
        $currentJobs = $inputs->currentJobs();
        $hypothetical = $inputs->hypotheticalJobs()[0];

        $currentJobIds = [];
        foreach ($currentJobs as $currentJob) {
            $currentJobIds[] = CareerJob::factory()->create([
                'user_id' => $owner->id,
                'kind' => 'current',
                'name' => $currentJob->name(),
                'spec_json' => $currentJob->toArray(),
            ])->id;
        }
        $offer = CareerJob::factory()->create([
            'user_id' => $owner->id,
            'kind' => 'hypothetical',
            'name' => $hypothetical->name(),
            'spec_json' => $hypothetical->toArray(),
        ]);

        return CareerComparison::factory()->create([
            'user_id' => $owner->id,
            'current_job_id' => $currentJobIds[0] ?? null,
            'current_job_ids' => $currentJobIds,
            'hypothetical_job_ids' => [$offer->id],
            'share_includes_current' => false,
            'computed_json' => $projection,
        ]);
    }

    /**
     * @return list<string>
     */
    private function workbookCellStrings(string $contents): array
    {
        $tempPath = tempnam(sys_get_temp_dir(), 'cc-leak-test');
        file_put_contents($tempPath, $contents);
        $spreadsheet = IOFactory::load($tempPath);
        @unlink($tempPath);

        $values = [];
        foreach ($spreadsheet->getAllSheets() as $sheet) {
            $values[] = $sheet->getTitle();
            foreach ($sheet->toArray() as $row) {
                foreach ($row as $cell) {
                    if ($cell !== null) {
                        $values[] = (string) $cell;
                    }
                }
            }
        }

        return $values;
    }
}
