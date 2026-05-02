<?php

namespace Tests\Feature;

use App\GenAiProcessor\Jobs\ParseImportJob;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Services\GenAiJobDispatcherService;
use App\Models\User;
use App\Models\UserAiConfiguration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ParseImportJobInvalidApiKeyTest extends TestCase
{
    use RefreshDatabase;

    public function test_bedrock_invalid_api_key_error_marks_configuration_invalid(): void
    {
        Mail::fake();
        Storage::fake('s3');
        Http::fake([
            'bedrock-runtime.us-east-1.amazonaws.com/model/*/converse' => Http::response([
                'Message' => 'Invalid API Key format: Must start with pre-defined prefix',
            ], 400),
        ]);

        $user = User::factory()->create(['gemini_api_key' => null]);
        $config = UserAiConfiguration::factory()->active()->for($user)->bedrock()->create([
            'api_key' => 'bad-key',
        ]);
        $s3Path = "genai-import/{$user->id}/test.pdf";
        Storage::disk('s3')->put($s3Path, 'pdf bytes');
        $job = GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'finance_transactions',
            'file_hash' => str_repeat('a', 64),
            'original_filename' => 'test.pdf',
            's3_path' => $s3Path,
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 9,
            'status' => 'pending',
        ]);

        (new ParseImportJob($job->id))->handle(new GenAiJobDispatcherService);

        $job->refresh();
        $config->refresh();

        $this->assertSame('failed', $job->status);
        $this->assertStringContainsString('Invalid API Key format', $job->error_message);
        $this->assertSame(GenAiImportJob::MAX_RETRIES, $job->retry_count);
        $this->assertTrue($config->hasInvalidApiKey());
        $this->assertStringContainsString('Invalid API Key format', $config->api_key_invalid_reason);
        $this->assertNull($user->fresh()->resolvedAiClient());
    }

    public function test_job_does_not_use_configuration_already_marked_invalid(): void
    {
        Storage::fake('s3');
        Http::fake();

        $user = User::factory()->create(['gemini_api_key' => null]);
        $config = UserAiConfiguration::factory()->active()->for($user)->bedrock()->create([
            'api_key' => 'bad-key',
        ]);
        $config->markApiKeyInvalid('Invalid API Key format');
        $s3Path = "genai-import/{$user->id}/test.pdf";
        Storage::disk('s3')->put($s3Path, 'pdf bytes');
        $job = GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'finance_transactions',
            'file_hash' => str_repeat('b', 64),
            'original_filename' => 'test.pdf',
            's3_path' => $s3Path,
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 9,
            'status' => 'pending',
        ]);

        (new ParseImportJob($job->id))->handle(new GenAiJobDispatcherService);

        $this->assertSame('failed', $job->fresh()->status);
        $this->assertSame(
            'Your AI configuration "'.$config->name.'" has an invalid API key. Please update it in Settings.',
            $job->fresh()->error_message
        );
        Http::assertNothingSent();
    }
}
