<?php

namespace Tests\Feature;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Models\GenAiImportResult;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RsuGenAiImportTest extends TestCase
{
    private function makeJob(User $user, string $jobType = 'equity_award'): GenAiImportJob
    {
        return GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => $jobType,
            'file_hash' => 'hash-'.$user->id.'-'.$jobType,
            'original_filename' => 'grant.pdf',
            's3_path' => "genai-import/{$user->id}/uuid/grant.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'context_json' => json_encode(['file_count' => 1, 'default_symbol' => 'META']),
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
    private function awardPayload(array $overrides = []): array
    {
        return array_merge([
            'award_id' => 'RSU-2026',
            'grant_date' => '2026-01-15',
            'vest_date' => '2027-01-15',
            'share_count' => 100,
            'symbol' => 'META',
            'grant_price' => 415.25,
            'vest_price' => null,
        ], $overrides);
    }

    public function test_confirm_requires_auth(): void
    {
        $response = $this->postJson('/api/rsu/genai-import/1/results/1/confirm', []);

        $response->assertStatus(401);
    }

    public function test_confirm_creates_award_from_reviewed_result_and_marks_job_imported(): void
    {
        $user = User::factory()->create();
        $job = $this->makeJob($user);
        $result = $this->makeResult($job, $this->awardPayload());

        $response = $this->actingAs($user)->postJson(
            "/api/rsu/genai-import/{$job->id}/results/{$result->id}/confirm",
            $this->awardPayload(['share_count' => 125, 'vest_price' => 500.50]),
        );

        $response->assertStatus(201);
        $response->assertJsonPath('result.status', 'imported');
        $response->assertJsonPath('job_status', 'imported');

        $this->assertDatabaseHas('fin_equity_awards', [
            'uid' => (string) $user->id,
            'award_id' => 'RSU-2026',
            'grant_date' => '2026-01-15',
            'vest_date' => '2027-01-15',
            'share_count' => 125,
            'symbol' => 'META',
            'grant_price' => 415.25,
            'vest_price' => 500.50,
        ]);
    }

    public function test_confirm_rejects_other_users_job(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $job = $this->makeJob($owner);
        $result = $this->makeResult($job, $this->awardPayload());

        $response = $this->actingAs($other)->postJson(
            "/api/rsu/genai-import/{$job->id}/results/{$result->id}/confirm",
            $this->awardPayload(),
        );

        $response->assertStatus(404);
    }

    public function test_confirm_rejects_wrong_job_type(): void
    {
        $user = User::factory()->create();
        $job = $this->makeJob($user, 'finance_payslip');
        $result = $this->makeResult($job, $this->awardPayload());

        $response = $this->actingAs($user)->postJson(
            "/api/rsu/genai-import/{$job->id}/results/{$result->id}/confirm",
            $this->awardPayload(),
        );

        $response->assertStatus(404);
    }

    public function test_confirm_validates_award_payload(): void
    {
        $user = User::factory()->create();
        $job = $this->makeJob($user);
        $result = $this->makeResult($job, $this->awardPayload());

        $response = $this->actingAs($user)->postJson(
            "/api/rsu/genai-import/{$job->id}/results/{$result->id}/confirm",
            $this->awardPayload([
                'award_id' => '',
                'grant_date' => '01/15/2026',
                'share_count' => -1,
                'symbol' => 'BRK.B',
            ]),
        );

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['award_id', 'grant_date', 'share_count', 'symbol']);
        $this->assertDatabaseCount('fin_equity_awards', 0);
    }

    public function test_confirm_backfills_existing_row_without_erasing_existing_prices(): void
    {
        $user = User::factory()->create();
        $job = $this->makeJob($user);
        $result = $this->makeResult($job, $this->awardPayload([
            'grant_price' => null,
            'vest_price' => 505.25,
        ]));

        DB::table('fin_equity_awards')->insert([
            'uid' => (string) $user->id,
            'award_id' => 'RSU-2026',
            'grant_date' => '2026-01-15',
            'vest_date' => '2027-01-15',
            'share_count' => 100,
            'symbol' => 'META',
            'grant_price' => 415.25,
            'vest_price' => null,
        ]);

        $response = $this->actingAs($user)->postJson(
            "/api/rsu/genai-import/{$job->id}/results/{$result->id}/confirm",
            $this->awardPayload([
                'share_count' => 100,
                'grant_price' => null,
                'vest_price' => 505.25,
            ]),
        );

        $response->assertStatus(201);
        $this->assertDatabaseHas('fin_equity_awards', [
            'uid' => (string) $user->id,
            'award_id' => 'RSU-2026',
            'grant_price' => 415.25,
            'vest_price' => 505.25,
        ]);
        $this->assertDatabaseCount('fin_equity_awards', 1);
    }

    public function test_same_award_key_can_exist_for_different_users(): void
    {
        $owner = User::factory()->create();
        $user = User::factory()->create();
        $job = $this->makeJob($user);
        $result = $this->makeResult($job, $this->awardPayload());

        DB::table('fin_equity_awards')->insert([
            'uid' => (string) $owner->id,
            'award_id' => 'RSU-2026',
            'grant_date' => '2026-01-15',
            'vest_date' => '2027-01-15',
            'share_count' => 100,
            'symbol' => 'META',
            'grant_price' => 410.00,
            'vest_price' => null,
        ]);

        $this->actingAs($user)->postJson(
            "/api/rsu/genai-import/{$job->id}/results/{$result->id}/confirm",
            $this->awardPayload(),
        )->assertStatus(201);

        $this->assertDatabaseCount('fin_equity_awards', 2);
    }

    public function test_job_stays_parsed_until_all_results_are_reviewed(): void
    {
        $user = User::factory()->create();
        $job = $this->makeJob($user);
        $first = $this->makeResult($job, $this->awardPayload(['vest_date' => '2027-01-15']), 0);
        $second = $this->makeResult($job, $this->awardPayload(['vest_date' => '2027-04-15']), 1);

        $this->actingAs($user)->postJson(
            "/api/rsu/genai-import/{$job->id}/results/{$first->id}/confirm",
            $this->awardPayload(['vest_date' => '2027-01-15']),
        )->assertStatus(201);

        $this->assertSame('parsed', $job->refresh()->status);

        $this->actingAs($user)->postJson(
            "/api/rsu/genai-import/{$job->id}/results/{$second->id}/skip",
        )->assertOk()
            ->assertJsonPath('job_status', 'imported');

        $this->assertSame('imported', $job->refresh()->status);
        $this->assertSame('skipped', $second->refresh()->status);
        $this->assertDatabaseCount('fin_equity_awards', 1);
    }

    public function test_skip_rejects_imported_result(): void
    {
        $user = User::factory()->create();
        $job = $this->makeJob($user);
        $result = $this->makeResult($job, $this->awardPayload());
        $result->update(['status' => 'imported']);

        $response = $this->actingAs($user)->postJson(
            "/api/rsu/genai-import/{$job->id}/results/{$result->id}/skip",
        );

        $response->assertStatus(409)
            ->assertJson(['error' => 'This result has already been imported.']);
    }
}
