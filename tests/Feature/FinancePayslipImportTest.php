<?php

namespace Tests\Feature;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Models\GenAiImportResult;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\FinPayslips;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinancePayslipImportTest extends TestCase
{
    use RefreshDatabase;

    private function createEmploymentEntity(int $userId, string $displayName = 'Acme Corp'): FinEmploymentEntity
    {
        return FinEmploymentEntity::withoutEvents(function () use ($userId, $displayName) {
            return FinEmploymentEntity::forceCreate([
                'user_id' => $userId,
                'display_name' => $displayName,
                'type' => 'w2',
                'is_current' => true,
                'start_date' => '2020-01-01',
            ]);
        });
    }

    private function makeJob(User $user, ?int $employmentEntityId = null): GenAiImportJob
    {
        return GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'finance_payslip',
            'file_hash' => 'hash-'.$user->id.'-'.$employmentEntityId,
            'original_filename' => 'payslip.pdf',
            's3_path' => "genai-import/{$user->id}/uuid/payslip.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'context_json' => json_encode(array_filter([
                'employment_entity_id' => $employmentEntityId,
                'file_count' => 1,
            ], static fn ($value) => $value !== null)),
            'status' => 'parsed',
        ]);
    }

    private function makeResult(GenAiImportJob $job, array $payload, int $index = 0): GenAiImportResult
    {
        return GenAiImportResult::create([
            'job_id' => $job->id,
            'result_index' => $index,
            'result_json' => json_encode($payload),
            'status' => 'pending_review',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function payslipPayload(array $overrides = []): array
    {
        return array_merge([
            'period_start' => '2026-01-01',
            'period_end' => '2026-01-15',
            'pay_date' => '2026-01-20',
            'earnings_gross' => 5000,
            'earnings_net_pay' => 4000,
            'ps_fed_tax' => 600,
            'ps_comment' => 'Imported from AI review',
        ], $overrides);
    }

    public function test_confirm_requires_auth(): void
    {
        $response = $this->postJson('/api/payslips/genai-import/1/results/1/confirm', []);

        $response->assertStatus(401);
    }

    public function test_confirm_creates_payslip_from_result_and_marks_job_imported(): void
    {
        $user = User::factory()->create();
        $entity = $this->createEmploymentEntity($user->id);
        $job = $this->makeJob($user, $entity->id);
        $result = $this->makeResult($job, $this->payslipPayload());

        $response = $this->actingAs($user)->postJson(
            "/api/payslips/genai-import/{$job->id}/results/{$result->id}/confirm",
            ['ps_comment' => 'Reviewed before import'],
        );

        $response->assertStatus(201);
        $response->assertJsonPath('result.status', 'imported');
        $response->assertJsonPath('job_status', 'imported');

        $this->assertDatabaseHas('fin_payslip', [
            'uid' => $user->id,
            'period_start' => '2026-01-01',
            'period_end' => '2026-01-15',
            'pay_date' => '2026-01-20',
            'earnings_gross' => 5000,
            'earnings_net_pay' => 4000,
            'employment_entity_id' => $entity->id,
            'ps_is_estimated' => true,
            'ps_comment' => 'Reviewed before import',
        ]);
    }

    public function test_confirm_rejects_other_users_job(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $job = $this->makeJob($owner);
        $result = $this->makeResult($job, $this->payslipPayload());

        $response = $this->actingAs($other)->postJson(
            "/api/payslips/genai-import/{$job->id}/results/{$result->id}/confirm",
            $this->payslipPayload(),
        );

        $response->assertStatus(404);
    }

    public function test_confirm_rejects_already_imported_result(): void
    {
        $user = User::factory()->create();
        $job = $this->makeJob($user);
        $result = $this->makeResult($job, $this->payslipPayload());
        $result->update(['status' => 'imported']);

        $response = $this->actingAs($user)->postJson(
            "/api/payslips/genai-import/{$job->id}/results/{$result->id}/confirm",
            $this->payslipPayload(),
        );

        $response->assertStatus(409)
            ->assertJson(['error' => 'This result has already been imported.']);
    }

    public function test_confirm_validates_employment_entity_id_ownership(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $foreignEntity = $this->createEmploymentEntity($other->id, 'Foreign Job');
        $job = $this->makeJob($user);
        $result = $this->makeResult($job, $this->payslipPayload());

        $response = $this->actingAs($user)->postJson(
            "/api/payslips/genai-import/{$job->id}/results/{$result->id}/confirm",
            ['employment_entity_id' => $foreignEntity->id],
        );

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['employment_entity_id']);
        $this->assertDatabaseCount('fin_payslip', 0);
    }

    public function test_job_stays_parsed_until_all_results_are_reviewed(): void
    {
        $user = User::factory()->create();
        $job = $this->makeJob($user);
        $first = $this->makeResult($job, $this->payslipPayload([
            'period_start' => '2026-01-01',
            'period_end' => '2026-01-15',
            'pay_date' => '2026-01-20',
        ]), 0);
        $second = $this->makeResult($job, $this->payslipPayload([
            'period_start' => '2026-01-16',
            'period_end' => '2026-01-31',
            'pay_date' => '2026-02-05',
        ]), 1);

        $this->actingAs($user)->postJson(
            "/api/payslips/genai-import/{$job->id}/results/{$first->id}/confirm",
            [],
        )->assertStatus(201);

        $this->assertEquals('parsed', $job->refresh()->status);
        $this->assertEquals(1, FinPayslips::count());

        $this->actingAs($user)->postJson(
            "/api/payslips/genai-import/{$job->id}/results/{$second->id}/skip"
        )->assertOk()
            ->assertJsonPath('job_status', 'imported');

        $this->assertEquals('imported', $job->refresh()->status);
        $this->assertEquals('skipped', $second->refresh()->status);
        $this->assertEquals(1, FinPayslips::count());
    }

    public function test_skip_marks_result_skipped_without_creating_payslip(): void
    {
        $user = User::factory()->create();
        $job = $this->makeJob($user);
        $result = $this->makeResult($job, $this->payslipPayload());

        $response = $this->actingAs($user)->postJson(
            "/api/payslips/genai-import/{$job->id}/results/{$result->id}/skip"
        );

        $response->assertOk();
        $response->assertJsonPath('result.status', 'skipped');
        $response->assertJsonPath('job_status', 'imported');
        $this->assertDatabaseCount('fin_payslip', 0);
    }
}
