<?php

namespace Tests\Feature;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Models\GenAiImportResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class GenAiImportControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Fake the queue so dispatched jobs don't actually run
        Queue::fake();
    }

    // ================================================================
    // requestUpload tests
    // ================================================================

    public function test_request_upload_requires_authentication(): void
    {
        $response = $this->postJson('/api/genai/import/request-upload', [
            'filename' => 'test.pdf',
            'content_type' => 'application/pdf',
            'file_size' => 1024,
        ]);
        $response->assertUnauthorized();
    }

    public function test_request_upload_validates_required_fields(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->postJson('/api/genai/import/request-upload', []);
        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['filename', 'content_type', 'file_size']);
    }

    public function test_request_upload_validates_file_size_max(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->postJson('/api/genai/import/request-upload', [
            'filename' => 'test.pdf',
            'content_type' => 'application/pdf',
            'file_size' => 100000000, // > 50MB
        ]);
        $response->assertStatus(422);
        $response->assertJsonValidationErrors('file_size');
    }

    // ================================================================
    // createJob tests
    // ================================================================

    public function test_create_job_requires_authentication(): void
    {
        $response = $this->postJson('/api/genai/import/jobs', []);
        $response->assertUnauthorized();
    }

    public function test_create_job_validates_required_fields(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->postJson('/api/genai/import/jobs', []);
        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['s3_key', 'original_filename', 'file_size_bytes', 'job_type']);
    }

    public function test_create_job_validates_job_type(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->postJson('/api/genai/import/jobs', [
            's3_key' => 'genai-import/1/test.pdf',
            'original_filename' => 'test.pdf',
            'file_size_bytes' => 1024,
            'job_type' => 'invalid_type',
        ]);
        $response->assertStatus(422);
        $response->assertJsonValidationErrors('job_type');
    }

    public function test_create_job_validates_context_json_schema(): void
    {
        $user = $this->createUser();

        // Test: invalid keys in context for finance_transactions
        $response = $this->actingAs($user)->postJson('/api/genai/import/jobs', [
            's3_key' => 'genai-import/1/test.pdf',
            'original_filename' => 'test.pdf',
            'file_size_bytes' => 1024,
            'job_type' => 'finance_transactions',
            'context' => ['malicious_acct_id' => 999],
        ]);
        $response->assertStatus(422);
        $response->assertJsonFragment(['error' => 'Unexpected context keys for finance_transactions: malicious_acct_id']);
    }

    public function test_create_job_prevents_acct_id_injection(): void
    {
        $user = $this->createUser();
        $otherUser = $this->createUser();

        // Create an account owned by otherUser
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_name' => 'Other User Account',
            'acct_owner' => $otherUser->id,
        ]);

        $response = $this->actingAs($user)->postJson('/api/genai/import/jobs', [
            's3_key' => 'genai-import/1/test.pdf',
            'original_filename' => 'test.pdf',
            'file_size_bytes' => 1024,
            'job_type' => 'finance_transactions',
            'acct_id' => $acctId,
        ]);
        $response->assertStatus(403);
    }

    // ================================================================
    // index tests
    // ================================================================

    public function test_index_requires_authentication(): void
    {
        $response = $this->getJson('/api/genai/import/jobs');
        $response->assertUnauthorized();
    }

    public function test_index_returns_only_own_jobs(): void
    {
        $user1 = $this->createUser();
        $user2 = $this->createUser();

        GenAiImportJob::create([
            'user_id' => $user1->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'hash1',
            'original_filename' => 'test1.pdf',
            's3_path' => 'genai-import/1/test1.pdf',
            'file_size_bytes' => 1024,
            'status' => 'pending',
        ]);

        GenAiImportJob::create([
            'user_id' => $user2->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'hash2',
            'original_filename' => 'test2.pdf',
            's3_path' => 'genai-import/2/test2.pdf',
            'file_size_bytes' => 1024,
            'status' => 'pending',
        ]);

        $response = $this->actingAs($user1)->getJson('/api/genai/import/jobs');
        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertEquals('test1.pdf', $response->json('data.0.original_filename'));
    }

    // ================================================================
    // show tests
    // ================================================================

    public function test_show_requires_authentication(): void
    {
        $response = $this->getJson('/api/genai/import/jobs/1');
        $response->assertUnauthorized();
    }

    public function test_show_returns_404_for_nonexistent_job(): void
    {
        $user = $this->createUser();
        $response = $this->actingAs($user)->getJson('/api/genai/import/jobs/9999');
        $response->assertStatus(404);
    }

    public function test_show_returns_404_for_other_users_job(): void
    {
        $user1 = $this->createUser();
        $user2 = $this->createUser();

        $job = GenAiImportJob::create([
            'user_id' => $user2->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'hash1',
            'original_filename' => 'test.pdf',
            's3_path' => 'genai-import/2/test.pdf',
            'file_size_bytes' => 1024,
            'status' => 'pending',
        ]);

        $response = $this->actingAs($user1)->getJson("/api/genai/import/jobs/{$job->id}");
        $response->assertStatus(404);
    }

    public function test_show_returns_job_with_results(): void
    {
        $user = $this->createUser();

        $job = GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'hash1',
            'original_filename' => 'test.pdf',
            's3_path' => 'genai-import/1/test.pdf',
            'file_size_bytes' => 1024,
            'status' => 'parsed',
        ]);

        GenAiImportResult::create([
            'job_id' => $job->id,
            'result_index' => 0,
            'result_json' => '{"test": true}',
            'status' => 'pending_review',
        ]);

        $response = $this->actingAs($user)->getJson("/api/genai/import/jobs/{$job->id}");
        $response->assertOk();
        $response->assertJsonFragment(['original_filename' => 'test.pdf']);
        $this->assertCount(1, $response->json('results'));
    }

    // ================================================================
    // retry tests
    // ================================================================

    public function test_retry_requires_authentication(): void
    {
        $response = $this->postJson('/api/genai/import/jobs/1/retry');
        $response->assertUnauthorized();
    }

    public function test_retry_resets_failed_job(): void
    {
        $user = $this->createUser();

        $job = GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'hash1',
            'original_filename' => 'test.pdf',
            's3_path' => 'genai-import/1/test.pdf',
            'file_size_bytes' => 1024,
            'status' => 'failed',
            'retry_count' => 1,
            'error_message' => 'Some error',
        ]);

        $response = $this->actingAs($user)->postJson("/api/genai/import/jobs/{$job->id}/retry");
        $response->assertOk();
        $response->assertJsonFragment(['status' => 'pending']);

        $job->refresh();
        $this->assertEquals('pending', $job->status);
        $this->assertNull($job->error_message);
    }

    public function test_retry_rejects_when_max_retries_reached(): void
    {
        $user = $this->createUser();

        $job = GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'hash1',
            'original_filename' => 'test.pdf',
            's3_path' => 'genai-import/1/test.pdf',
            'file_size_bytes' => 1024,
            'status' => 'failed',
            'retry_count' => 3,
        ]);

        $response = $this->actingAs($user)->postJson("/api/genai/import/jobs/{$job->id}/retry");
        $response->assertStatus(422);
    }

    public function test_retry_rejects_non_failed_job(): void
    {
        $user = $this->createUser();

        $job = GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'hash1',
            'original_filename' => 'test.pdf',
            's3_path' => 'genai-import/1/test.pdf',
            'file_size_bytes' => 1024,
            'status' => 'parsed',
        ]);

        $response = $this->actingAs($user)->postJson("/api/genai/import/jobs/{$job->id}/retry");
        $response->assertStatus(422);
    }

    // ================================================================
    // destroy tests
    // ================================================================

    public function test_destroy_requires_authentication(): void
    {
        $response = $this->deleteJson('/api/genai/import/jobs/1');
        $response->assertUnauthorized();
    }

    public function test_destroy_deletes_job_and_results(): void
    {
        $user = $this->createUser();

        $job = GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'hash1',
            'original_filename' => 'test.pdf',
            's3_path' => 'genai-import/1/test.pdf',
            'file_size_bytes' => 1024,
            'status' => 'parsed',
        ]);

        GenAiImportResult::create([
            'job_id' => $job->id,
            'result_index' => 0,
            'result_json' => '{"test": true}',
            'status' => 'pending_review',
        ]);

        $response = $this->actingAs($user)->deleteJson("/api/genai/import/jobs/{$job->id}");
        $response->assertOk();

        $this->assertDatabaseMissing('genai_import_jobs', ['id' => $job->id]);
        $this->assertDatabaseMissing('genai_import_results', ['job_id' => $job->id]);
    }

    public function test_destroy_returns_404_for_other_users_job(): void
    {
        $user1 = $this->createUser();
        $user2 = $this->createUser();

        $job = GenAiImportJob::create([
            'user_id' => $user2->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'hash1',
            'original_filename' => 'test.pdf',
            's3_path' => 'genai-import/2/test.pdf',
            'file_size_bytes' => 1024,
            'status' => 'pending',
        ]);

        $response = $this->actingAs($user1)->deleteJson("/api/genai/import/jobs/{$job->id}");
        $response->assertStatus(404);
    }
}
