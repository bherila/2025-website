<?php

namespace Tests\Feature;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Models\GenAiImportResult;
use App\Models\UserAiConfiguration;
use Tests\TestCase;

class GenAiImportModelsTest extends TestCase
{
    private function createTestJob(array $attributes = []): GenAiImportJob
    {
        $user = $this->createUser();

        return GenAiImportJob::create(array_merge([
            'user_id' => $user->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'test_hash_'.uniqid(),
            'original_filename' => 'test.pdf',
            's3_path' => 'genai-import/1/test.pdf',
            'file_size_bytes' => 1024,
            'status' => 'pending',
        ], $attributes));
    }

    // ================================================================
    // GenAiImportJob tests
    // ================================================================

    public function test_job_can_be_created(): void
    {
        $job = $this->createTestJob();
        $this->assertDatabaseHas('genai_import_jobs', ['id' => $job->id]);
    }

    public function test_job_belongs_to_user(): void
    {
        $job = $this->createTestJob();
        $this->assertNotNull($job->user);
    }

    public function test_job_has_many_results(): void
    {
        $job = $this->createTestJob(['status' => 'parsed']);

        GenAiImportResult::create([
            'job_id' => $job->id,
            'result_index' => 0,
            'result_json' => '{"test": true}',
        ]);

        GenAiImportResult::create([
            'job_id' => $job->id,
            'result_index' => 1,
            'result_json' => '{"test": false}',
        ]);

        $this->assertCount(2, $job->results);
    }

    public function test_job_can_retry(): void
    {
        $job = $this->createTestJob(['status' => 'failed', 'retry_count' => 0]);
        $this->assertTrue($job->canRetry());

        $job2 = $this->createTestJob(['status' => 'failed', 'retry_count' => 3]);
        $this->assertFalse($job2->canRetry());

        $job3 = $this->createTestJob(['status' => 'parsed', 'retry_count' => 0]);
        $this->assertFalse($job3->canRetry());
    }

    public function test_job_status_transitions(): void
    {
        $job = $this->createTestJob();

        $job->markProcessing();
        $this->assertEquals('processing', $job->status);

        $job->markParsed();
        $this->assertEquals('parsed', $job->status);
        $this->assertNotNull($job->parsed_at);
    }

    public function test_job_mark_failed(): void
    {
        $job = $this->createTestJob();
        $job->markFailed('Test error');

        $this->assertEquals('failed', $job->status);
        $this->assertEquals('Test error', $job->error_message);
        $this->assertEquals(1, $job->retry_count);
    }

    public function test_job_mark_queued_tomorrow(): void
    {
        $job = $this->createTestJob();
        $job->markQueuedTomorrow();

        $this->assertEquals('queued_tomorrow', $job->status);
        $this->assertNotNull($job->scheduled_for);
    }

    public function test_job_get_context_array(): void
    {
        $context = ['accounts' => [['name' => 'Test', 'last4' => '1234']]];
        $job = $this->createTestJob(['context_json' => json_encode($context)]);

        $this->assertEquals($context, $job->getContextArray());
    }

    public function test_job_get_context_array_returns_empty_for_null(): void
    {
        $job = $this->createTestJob(['context_json' => null]);
        $this->assertEquals([], $job->getContextArray());
    }

    public function test_job_cascade_deletes_results(): void
    {
        $job = $this->createTestJob(['status' => 'parsed']);

        $result = GenAiImportResult::create([
            'job_id' => $job->id,
            'result_index' => 0,
            'result_json' => '{"test": true}',
        ]);

        $job->delete();

        $this->assertDatabaseMissing('genai_import_results', ['id' => $result->id]);
    }

    // ================================================================
    // GenAiImportResult tests
    // ================================================================

    public function test_result_belongs_to_job(): void
    {
        $job = $this->createTestJob(['status' => 'parsed']);

        $result = GenAiImportResult::create([
            'job_id' => $job->id,
            'result_index' => 0,
            'result_json' => '{"test": true}',
        ]);

        $this->assertNotNull($result->job);
        $this->assertEquals($job->id, $result->job->id);
    }

    public function test_result_get_result_array(): void
    {
        $job = $this->createTestJob(['status' => 'parsed']);

        $result = GenAiImportResult::create([
            'job_id' => $job->id,
            'result_index' => 0,
            'result_json' => '{"key": "value"}',
        ]);

        $this->assertEquals(['key' => 'value'], $result->getResultArray());
    }

    public function test_result_mark_imported(): void
    {
        $job = $this->createTestJob(['status' => 'parsed']);

        $result = GenAiImportResult::create([
            'job_id' => $job->id,
            'result_index' => 0,
            'result_json' => '{"test": true}',
        ]);

        $result->markImported();

        $this->assertEquals('imported', $result->status);
        $this->assertNotNull($result->imported_at);
    }

    public function test_result_mark_skipped(): void
    {
        $job = $this->createTestJob(['status' => 'parsed']);

        $result = GenAiImportResult::create([
            'job_id' => $job->id,
            'result_index' => 0,
            'result_json' => '{"test": true}',
        ]);

        $result->markSkipped();

        $this->assertEquals('skipped', $result->status);
    }

    // ================================================================
    // Token usage persistence tests
    // ================================================================

    public function test_token_counts_are_persisted_on_job(): void
    {
        $job = $this->createTestJob();

        $job->update(['input_tokens' => 1200, 'output_tokens' => 350]);

        $this->assertDatabaseHas('genai_import_jobs', [
            'id' => $job->id,
            'input_tokens' => 1200,
            'output_tokens' => 350,
        ]);
        $fresh = $job->fresh();
        $this->assertSame(1200, $fresh->input_tokens);
        $this->assertSame(350, $fresh->output_tokens);
    }

    public function test_input_tokens_can_be_persisted_without_output_tokens(): void
    {
        $job = $this->createTestJob();

        $job->update(['input_tokens' => 800]);

        $fresh = $job->fresh();
        $this->assertSame(800, $fresh->input_tokens);
        $this->assertNull($fresh->output_tokens);
    }

    public function test_output_tokens_can_be_persisted_without_input_tokens(): void
    {
        $job = $this->createTestJob();

        $job->update(['output_tokens' => 99]);

        $fresh = $job->fresh();
        $this->assertNull($fresh->input_tokens);
        $this->assertSame(99, $fresh->output_tokens);
    }

    public function test_ai_configuration_id_is_persisted_on_job(): void
    {
        $user = $this->createUser();
        $config = UserAiConfiguration::factory()->for($user)->gemini()->create();

        $job = $this->createTestJob(['user_id' => $user->id]);
        $job->update(['ai_configuration_id' => $config->id]);

        $this->assertDatabaseHas('genai_import_jobs', [
            'id' => $job->id,
            'ai_configuration_id' => $config->id,
        ]);
    }
}
