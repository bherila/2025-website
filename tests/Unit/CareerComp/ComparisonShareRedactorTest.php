<?php

namespace Tests\Unit\CareerComp;

use App\Services\Planning\CareerComp\ComparisonShareRedactor;
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

    public function test_drops_current_job_warnings_but_keeps_hypothetical_ones(): void
    {
        $projection = [
            'currentJobId' => 'current',
            'jobs' => [
                ['id' => 'current', 'name' => 'Confidential Current', 'vesting' => [['grantId' => 'current-iso-hire', 'type' => 'iso', 'year' => 2027]]],
                ['id' => 'hyp-1', 'name' => 'Public Offer', 'vesting' => []],
            ],
            'deltasVsCurrent' => [],
            'warnings' => [
                'Confidential Current: growth bands should increase from Low to Medium to High.',
                'Confidential Current: grant current-iso-hire cliff is longer than total vesting.',
                'Public Offer: private liquidity date is beyond the planning horizon; equity never realizes.',
            ],
        ];

        $redacted = $this->redactor()->redactProjection($projection, 'current');

        $this->assertSame(
            ['Public Offer: private liquidity date is beyond the planning horizon; equity never realizes.'],
            $redacted['warnings'],
        );
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
        $path = __DIR__.'/../../Fixtures/career-comparison/golden-projection.json';

        return json_decode((string) file_get_contents($path), true);
    }
}
