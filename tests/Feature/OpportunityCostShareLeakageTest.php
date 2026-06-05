<?php

namespace Tests\Feature;

use App\Models\CareerJob;
use App\Models\OpportunityCostComparison;
use App\Models\User;
use App\Services\Planning\OpportunityCost\ComparisonShareRedactor;
use App\Services\Planning\OpportunityCost\OpportunityCostCalculator;
use App\Services\Planning\OpportunityCost\OpportunityCostInputs;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Tests\TestCase;

class OpportunityCostShareLeakageTest extends TestCase
{
    private const string CURRENT_SALARY = '424242';

    private const string CURRENT_NAME = 'Confidential Current';

    public function test_exclusive_share_html_omits_current_job_for_non_owner(): void
    {
        $this->withoutVite();
        $comparison = $this->persistExclusiveComparison(User::factory()->create());

        $response = $this->get("/financial-planning/opportunity-cost/s/{$comparison->short_code}");

        $response->assertOk();
        $content = (string) $response->getContent();
        $this->assertStringNotContainsString(self::CURRENT_SALARY, $content);
        $this->assertStringNotContainsString(self::CURRENT_NAME, $content);
        $this->assertStringContainsString('"currentJob":null', $content);
        $this->assertStringContainsString('"currentJobId":null', $content);
        $this->assertStringContainsString('Public Offer', $content);
    }

    public function test_owner_still_sees_current_job_on_their_exclusive_share(): void
    {
        $this->withoutVite();
        $owner = User::factory()->create();
        $comparison = $this->persistExclusiveComparison($owner);

        $response = $this->actingAs($owner)->get("/financial-planning/opportunity-cost/s/{$comparison->short_code}");

        $response->assertOk();
        $this->assertStringContainsString(self::CURRENT_SALARY, (string) $response->getContent());
    }

    public function test_exclusive_share_xlsx_export_omits_current_job(): void
    {
        $inputs = $this->scenarioInputs();
        $projection = app(OpportunityCostCalculator::class)->project(OpportunityCostInputs::fromArray($inputs))->toArray();
        $redacted = app(ComparisonShareRedactor::class)->redact($inputs, $projection, 'current');

        $response = $this->postJson('/api/financial-planning/opportunity-cost/export-xlsx', [
            'inputs' => $redacted['inputs'],
        ]);

        $response->assertOk();
        $cells = $this->workbookCellStrings((string) $response->getContent());
        $blob = implode("\n", $cells);
        $this->assertStringNotContainsString(self::CURRENT_SALARY, $blob);
        $this->assertStringNotContainsString(self::CURRENT_NAME, $blob);
        $this->assertStringContainsString('Public Offer', $blob);
    }

    /**
     * @return array<string, mixed>
     */
    private function scenarioInputs(): array
    {
        $inputs = OpportunityCostInputs::defaults();
        $inputs['currentJob']['name'] = self::CURRENT_NAME;
        $inputs['currentJob']['comp']['baseSalary'] = (float) self::CURRENT_SALARY;
        // Decreasing growth bands force a calculator warning that embeds the current job name,
        // so the leakage assertions exercise warning redaction, not just job/series removal.
        $inputs['currentJob']['growthBands'] = ['lowPct' => 10.0, 'mediumPct' => 5.0, 'highPct' => 0.0];
        $inputs['hypotheticalJobs'][0]['name'] = 'Public Offer';
        $inputs['hypotheticalJobs'][0]['comp']['baseSalary'] = 191919.0;

        return $inputs;
    }

    private function persistExclusiveComparison(User $owner): OpportunityCostComparison
    {
        $inputs = OpportunityCostInputs::fromArray($this->scenarioInputs());
        $projection = app(OpportunityCostCalculator::class)->project($inputs)->toArray();
        $currentJob = $inputs->currentJob();
        $hypothetical = $inputs->hypotheticalJobs()[0];

        $current = CareerJob::factory()->create([
            'user_id' => $owner->id,
            'kind' => 'current',
            'name' => $currentJob?->name(),
            'spec_json' => $currentJob?->toArray(),
        ]);
        $offer = CareerJob::factory()->create([
            'user_id' => $owner->id,
            'kind' => 'hypothetical',
            'name' => $hypothetical->name(),
            'spec_json' => $hypothetical->toArray(),
        ]);

        return OpportunityCostComparison::factory()->create([
            'user_id' => $owner->id,
            'current_job_id' => $current->id,
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
        $tempPath = tempnam(sys_get_temp_dir(), 'oc-leak-test');
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
