<?php

namespace Tests\Unit\OpportunityCost;

use App\Services\Planning\OpportunityCost\ComparisonShareRedactor;
use PHPUnit\Framework\TestCase;

class ComparisonShareRedactorTest extends TestCase
{
    public function test_removes_current_job_from_inputs_by_identity(): void
    {
        $inputs = [
            'currentJob' => ['id' => 'current', 'name' => 'Current role'],
            'hypotheticalJobs' => [['id' => 'hyp-1', 'name' => 'Offer']],
        ];

        $redacted = $this->redactor()->redactInputs($inputs, 'current');

        $this->assertNull($redacted['currentJob']);
        $this->assertCount(1, $redacted['hypotheticalJobs']);
    }

    public function test_does_not_remove_current_when_identity_does_not_match(): void
    {
        $inputs = ['currentJob' => ['id' => 'current', 'name' => 'Current role']];

        $redacted = $this->redactor()->redactInputs($inputs, 'some-other-id');

        $this->assertNotNull($redacted['currentJob']);
    }

    public function test_strips_current_job_series_delta_and_pointer_from_projection(): void
    {
        $projection = $this->goldenProjection();
        $this->assertSame('current', $projection['currentJobId']);
        $this->assertNotEmpty($projection['deltasVsCurrent']);

        $redacted = $this->redactor()->redactProjection($projection, 'current');

        $this->assertNull($redacted['currentJobId']);
        $this->assertSame([], $redacted['deltasVsCurrent']);
        $jobIds = array_map(fn (array $job): string => $job['id'], $redacted['jobs']);
        $this->assertNotContains('current', $jobIds);
        $this->assertContains('hyp-1', $jobIds);
    }

    public function test_inclusive_mode_is_handled_by_callers_redactor_only_removes_named_identity(): void
    {
        // The redactor is only invoked for exclusive shares; calling it with a non-present id is a no-op.
        $projection = $this->goldenProjection();

        $passthrough = $this->redactor()->redactProjection($projection, 'no-such-job');

        $jobIds = array_map(fn (array $job): string => $job['id'], $passthrough['jobs']);
        $this->assertContains('current', $jobIds);
        $this->assertContains('hyp-1', $jobIds);
    }

    public function test_combined_redact_returns_both_payloads(): void
    {
        $inputs = ['currentJob' => ['id' => 'current'], 'hypotheticalJobs' => []];
        $projection = $this->goldenProjection();

        $result = $this->redactor()->redact($inputs, $projection, 'current');

        $this->assertNull($result['inputs']['currentJob']);
        $this->assertNull($result['projection']['currentJobId']);
    }

    private function redactor(): ComparisonShareRedactor
    {
        return new ComparisonShareRedactor;
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
