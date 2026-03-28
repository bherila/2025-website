<?php

namespace Tests\Feature;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Models\GenAiImportResult;
use App\Services\FileStorageService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class GenAiImportControllerTest extends TestCase
{
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

    public function test_request_upload_returns_signed_url_on_success(): void
    {
        $user = $this->createUser();

        $mock = $this->mock(FileStorageService::class);
        $mock->shouldReceive('getSignedUploadUrl')
            ->once()
            ->andReturn('https://s3.example.com/signed-url');

        $response = $this->actingAs($user)->postJson('/api/genai/import/request-upload', [
            'filename' => 'my statement.pdf',
            'content_type' => 'application/pdf',
            'file_size' => 101851,
        ]);

        $response->assertOk();
        $response->assertJsonStructure(['signed_url', 's3_key', 'expires_in']);
        $this->assertEquals('https://s3.example.com/signed-url', $response->json('signed_url'));
        $s3Key = $response->json('s3_key');
        // Key must start with user prefix
        $this->assertStringStartsWith("genai-import/{$user->id}/", $s3Key);
        // Key must use UUID subdirectory format: genai-import/{user_id}/{uuid}/{filename}
        $parts = explode('/', $s3Key);
        $this->assertCount(4, $parts, 'S3 key should have 4 parts: genai-import/{user_id}/{uuid}/{filename}');
        $this->assertEquals('genai-import', $parts[0]);
        $this->assertEquals((string) $user->id, $parts[1]);
        // uuid segment should be a valid UUID v4 format
        $this->assertMatchesRegularExpression(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/',
            $parts[2],
            'Third segment should be a UUID'
        );
        // Filename should be sanitized (spaces replaced with underscores)
        $this->assertEquals('my_statement.pdf', $parts[3]);
        $this->assertEquals(900, $response->json('expires_in'));
    }

    public function test_request_upload_returns_503_when_storage_not_configured(): void
    {
        $user = $this->createUser();

        $mock = $this->mock(FileStorageService::class);
        $mock->shouldReceive('getSignedUploadUrl')
            ->once()
            ->andThrow(new \RuntimeException('S3 Bucket is not configured'));

        $response = $this->actingAs($user)->postJson('/api/genai/import/request-upload', [
            'filename' => 'statement.pdf',
            'content_type' => 'application/pdf',
            'file_size' => 1024,
        ]);

        $response->assertStatus(503);
        $response->assertJsonFragment(['error' => 'Storage is not configured.']);
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

    public function test_create_job_rejects_s3_key_from_other_user(): void
    {
        $user = $this->createUser();
        $otherUser = $this->createUser();

        // Try to reference a file that belongs to another user's prefix
        $response = $this->actingAs($user)->postJson('/api/genai/import/jobs', [
            's3_key' => "genai-import/{$otherUser->id}/test.pdf",
            'original_filename' => 'test.pdf',
            'file_size_bytes' => 1024,
            'job_type' => 'finance_transactions',
        ]);
        $response->assertStatus(403);
        $response->assertJsonFragment(['error' => 'Invalid file reference.']);
    }

    public function test_create_job_accepts_own_s3_key_prefix(): void
    {
        $user = $this->createUser();

        // Use the correct user prefix — S3 checksum will fail since no real S3 is connected
        // but we verify validation passes and returns 500 (not 403)
        $response = $this->actingAs($user)->postJson('/api/genai/import/jobs', [
            's3_key' => "genai-import/{$user->id}/test.pdf",
            'original_filename' => 'test.pdf',
            'file_size_bytes' => 1024,
            'job_type' => 'finance_transactions',
        ]);
        // Should fail at S3 checksum, not at prefix validation
        $this->assertNotEquals(403, $response->status());
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

    public function test_index_excludes_imported_jobs(): void
    {
        $user = $this->createUser();

        GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'hash1',
            'original_filename' => 'pending.pdf',
            's3_path' => 'genai-import/1/pending.pdf',
            'file_size_bytes' => 1024,
            'status' => 'pending',
        ]);

        GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'hash2',
            'original_filename' => 'imported.pdf',
            's3_path' => 'genai-import/1/imported.pdf',
            'file_size_bytes' => 1024,
            'status' => 'imported',
        ]);

        $response = $this->actingAs($user)->getJson('/api/genai/import/jobs');
        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertEquals('pending.pdf', $response->json('data.0.original_filename'));
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

    public function test_destroy_triggers_s3_cleanup_via_model_event(): void
    {
        $user = $this->createUser();
        $s3Path = 'genai-import/1/uuid-123/statement.pdf';

        // Fake S3 disk before creating the job so we can put a file and assert deletion
        Storage::fake('s3');
        Storage::disk('s3')->put($s3Path, 'fake-pdf-content');

        $job = GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'hash_s3_cleanup',
            'original_filename' => 'statement.pdf',
            's3_path' => $s3Path,
            'file_size_bytes' => 2048,
            'status' => 'parsed',
        ]);

        Storage::disk('s3')->assertExists($s3Path);

        $response = $this->actingAs($user)->deleteJson("/api/genai/import/jobs/{$job->id}");
        $response->assertOk();

        $this->assertDatabaseMissing('genai_import_jobs', ['id' => $job->id]);
        // The model boot() deleting hook must have deleted the S3 file
        Storage::disk('s3')->assertMissing($s3Path);
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
