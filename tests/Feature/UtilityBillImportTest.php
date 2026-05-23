<?php

namespace Tests\Feature;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Models\GenAiImportResult;
use App\Models\User;
use App\Models\UtilityBillTracker\UtilityAccount;
use App\Models\UtilityBillTracker\UtilityBill;
use App\Services\FileStorageService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\TestCase;

/**
 * Tests for the queue-based utility bill import confirm/skip endpoints.
 * The upload + parse path is exercised by GenAiImportControllerTest /
 * AdminGenAiJobsControllerTest; this suite only covers the per-feature
 * persist step that turns a parsed GenAiImportResult into a UtilityBill.
 */
class UtilityBillImportTest extends TestCase
{
    use RefreshDatabase;

    private function makeAccount(User $user, string $accountType = 'General'): UtilityAccount
    {
        Auth::login($user);

        return UtilityAccount::create([
            'user_id' => $user->id,
            'account_name' => 'Test Account',
            'account_type' => $accountType,
        ]);
    }

    private function makeJob(User $user, int $accountId, string $accountType = 'General'): GenAiImportJob
    {
        return GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'utility_bill',
            'file_hash' => 'hash-'.$accountId,
            'original_filename' => 'bill.pdf',
            's3_path' => "genai-import/{$user->id}/uuid/bill.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'context_json' => json_encode([
                'account_type' => $accountType,
                'utility_account_id' => $accountId,
                'file_count' => 1,
            ]),
            'status' => 'parsed',
        ]);
    }

    private function makeResult(GenAiImportJob $job, array $payload): GenAiImportResult
    {
        return GenAiImportResult::create([
            'job_id' => $job->id,
            'result_index' => 0,
            'result_json' => json_encode($payload),
            'status' => 'pending_review',
        ]);
    }

    private function billConfirmBody(array $overrides = []): array
    {
        return array_merge([
            'bill_start_date' => '2026-01-01',
            'bill_end_date' => '2026-01-31',
            'due_date' => '2026-02-15',
            'total_cost' => 89.50,
            'status' => 'Unpaid',
        ], $overrides);
    }

    public function test_confirm_requires_auth(): void
    {
        $response = $this->postJson(
            '/api/utility-bill-tracker/accounts/1/bills/genai-import/1/results/1/confirm',
            $this->billConfirmBody(),
        );

        $response->assertStatus(401);
    }

    public function test_confirm_creates_bill_and_marks_result_imported(): void
    {
        $user = User::factory()->create();
        $account = $this->makeAccount($user);
        $job = $this->makeJob($user, $account->id);
        $result = $this->makeResult($job, ['total_cost' => 89.50]);

        // No PDF copy — let the staged file not exist; bill should still be created without PDF fields.
        Storage::fake('s3');

        $response = $this->actingAs($user)->postJson(
            "/api/utility-bill-tracker/accounts/{$account->id}/bills/genai-import/{$job->id}/results/{$result->id}/confirm",
            $this->billConfirmBody(),
        );

        $response->assertStatus(201);
        $response->assertJsonPath('result.status', 'imported');
        $response->assertJsonPath('job_status', 'imported');

        $this->assertDatabaseHas('utility_bill', [
            'utility_account_id' => $account->id,
            'total_cost' => 89.50,
            'status' => 'Unpaid',
        ]);
    }

    public function test_confirm_copies_pdf_into_utility_bills_storage(): void
    {
        $user = User::factory()->create();
        $account = $this->makeAccount($user);
        $job = $this->makeJob($user, $account->id);
        $result = $this->makeResult($job, ['total_cost' => 50.00]);

        Storage::fake('s3');
        Storage::disk('s3')->put($job->s3_path, 'pdf-bytes');

        $this->mock(FileStorageService::class, function ($mock) {
            $mock->shouldReceive('uploadContent')
                ->once()
                ->andReturnUsing(function (string $contents, string $path): bool {
                    Storage::disk('s3')->put($path, $contents);

                    return true;
                });
        });

        $response = $this->actingAs($user)->postJson(
            "/api/utility-bill-tracker/accounts/{$account->id}/bills/genai-import/{$job->id}/results/{$result->id}/confirm",
            $this->billConfirmBody(['total_cost' => 50.00]),
        );

        $response->assertStatus(201);
        $bill = UtilityBill::query()->where('utility_account_id', $account->id)->firstOrFail();

        $this->assertNotNull($bill->pdf_s3_path);
        $this->assertStringStartsWith("utility-bills/{$account->id}/", $bill->pdf_s3_path);
        $this->assertEquals('bill.pdf', $bill->pdf_original_filename);
        $this->assertEquals(1024, $bill->pdf_file_size_bytes);
        Storage::disk('s3')->assertExists($bill->pdf_s3_path);
    }

    public function test_confirm_persists_electricity_specific_fields(): void
    {
        $user = User::factory()->create();
        $account = $this->makeAccount($user, 'Electricity');
        $job = $this->makeJob($user, $account->id, 'Electricity');
        $result = $this->makeResult($job, []);

        Storage::fake('s3');

        $response = $this->actingAs($user)->postJson(
            "/api/utility-bill-tracker/accounts/{$account->id}/bills/genai-import/{$job->id}/results/{$result->id}/confirm",
            $this->billConfirmBody([
                'total_cost' => 120.00,
                'power_consumed_kwh' => 450,
                'total_generation_fees' => 60.00,
                'total_delivery_fees' => 50.00,
            ]),
        );

        $response->assertStatus(201);
        $this->assertDatabaseHas('utility_bill', [
            'utility_account_id' => $account->id,
            'power_consumed_kwh' => 450,
            'total_generation_fees' => 60.00,
            'total_delivery_fees' => 50.00,
        ]);
    }

    public function test_confirm_rejects_already_imported_result(): void
    {
        $user = User::factory()->create();
        $account = $this->makeAccount($user);
        $job = $this->makeJob($user, $account->id);
        $result = $this->makeResult($job, []);
        $result->update(['status' => 'imported']);

        $response = $this->actingAs($user)->postJson(
            "/api/utility-bill-tracker/accounts/{$account->id}/bills/genai-import/{$job->id}/results/{$result->id}/confirm",
            $this->billConfirmBody(),
        );

        $response->assertStatus(409);
    }

    public function test_confirm_rejects_other_users_job(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $account = $this->makeAccount($other);
        // Re-auth as the rightful owner so makeJob below uses the right user_id.
        Auth::logout();
        $job = $this->makeJob($owner, $account->id);
        $result = $this->makeResult($job, []);

        // Sign in the foreign user and try to confirm the owner's job.
        $response = $this->actingAs($other)->postJson(
            "/api/utility-bill-tracker/accounts/{$account->id}/bills/genai-import/{$job->id}/results/{$result->id}/confirm",
            $this->billConfirmBody(),
        );

        $response->assertStatus(404);
    }

    public function test_confirm_rejects_when_context_account_mismatch(): void
    {
        $user = User::factory()->create();
        $account = $this->makeAccount($user);
        // Job's context references a different utility_account_id than the URL.
        $job = GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'utility_bill',
            'file_hash' => 'hash-mismatch',
            'original_filename' => 'bill.pdf',
            's3_path' => "genai-import/{$user->id}/uuid/bill.pdf",
            'file_size_bytes' => 1024,
            'context_json' => json_encode([
                'account_type' => 'General',
                'utility_account_id' => $account->id + 99,
                'file_count' => 1,
            ]),
            'status' => 'parsed',
        ]);
        $result = $this->makeResult($job, []);

        $response = $this->actingAs($user)->postJson(
            "/api/utility-bill-tracker/accounts/{$account->id}/bills/genai-import/{$job->id}/results/{$result->id}/confirm",
            $this->billConfirmBody(),
        );

        $response->assertStatus(403);
    }

    public function test_skip_marks_result_skipped_and_does_not_create_bill(): void
    {
        $user = User::factory()->create();
        $account = $this->makeAccount($user);
        $job = $this->makeJob($user, $account->id);
        $result = $this->makeResult($job, []);

        $response = $this->actingAs($user)->postJson(
            "/api/utility-bill-tracker/accounts/{$account->id}/bills/genai-import/{$job->id}/results/{$result->id}/skip"
        );

        $response->assertOk();
        $response->assertJsonPath('result.status', 'skipped');
        $response->assertJsonPath('job_status', 'imported');
        $this->assertDatabaseCount('utility_bill', 0);
    }

    public function test_skip_rejects_when_context_account_mismatch(): void
    {
        $user = User::factory()->create();
        $account = $this->makeAccount($user);
        $job = GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'utility_bill',
            'file_hash' => 'hash-skip-mismatch',
            'original_filename' => 'bill.pdf',
            's3_path' => "genai-import/{$user->id}/uuid/bill.pdf",
            'file_size_bytes' => 1024,
            'context_json' => json_encode([
                'account_type' => 'General',
                'utility_account_id' => $account->id + 99,
                'file_count' => 1,
            ]),
            'status' => 'parsed',
        ]);
        $result = $this->makeResult($job, []);

        $response = $this->actingAs($user)->postJson(
            "/api/utility-bill-tracker/accounts/{$account->id}/bills/genai-import/{$job->id}/results/{$result->id}/skip"
        );

        $response->assertStatus(403);
        $this->assertEquals('pending_review', $result->refresh()->status);
    }

    public function test_skip_rejects_already_imported_result(): void
    {
        $user = User::factory()->create();
        $account = $this->makeAccount($user);
        $job = $this->makeJob($user, $account->id);
        $result = $this->makeResult($job, []);
        $result->update(['status' => 'imported']);

        $response = $this->actingAs($user)->postJson(
            "/api/utility-bill-tracker/accounts/{$account->id}/bills/genai-import/{$job->id}/results/{$result->id}/skip"
        );

        $response->assertStatus(409);
    }

    public function test_job_stays_parsed_while_any_result_is_still_pending_review(): void
    {
        $user = User::factory()->create();
        $account = $this->makeAccount($user);
        $job = $this->makeJob($user, $account->id);
        $r1 = $this->makeResult($job, []);
        $r2 = GenAiImportResult::create([
            'job_id' => $job->id,
            'result_index' => 1,
            'result_json' => '{}',
            'status' => 'pending_review',
        ]);

        Storage::fake('s3');

        $this->actingAs($user)->postJson(
            "/api/utility-bill-tracker/accounts/{$account->id}/bills/genai-import/{$job->id}/results/{$r1->id}/confirm",
            $this->billConfirmBody(),
        )->assertStatus(201);

        $job->refresh();
        $this->assertEquals('parsed', $job->status, 'Job should stay parsed while r2 is still pending');

        $this->actingAs($user)->postJson(
            "/api/utility-bill-tracker/accounts/{$account->id}/bills/genai-import/{$job->id}/results/{$r2->id}/skip"
        )->assertOk();

        $this->assertEquals('imported', $job->refresh()->status);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }
}
