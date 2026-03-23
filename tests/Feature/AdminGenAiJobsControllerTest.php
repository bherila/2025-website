<?php

namespace Tests\Feature;

use App\GenAiProcessor\Models\GenAiImportJob;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminGenAiJobsControllerTest extends TestCase
{
    use RefreshDatabase;

    // ================================================================
    // index tests
    // ================================================================

    public function test_index_requires_authentication(): void
    {
        $response = $this->getJson('/api/admin/genai-jobs');
        $response->assertUnauthorized();
    }

    public function test_index_requires_admin_role(): void
    {
        // Create admin first so user doesn't get ID 1 (which always has admin)
        $this->createAdminUser();
        $user = $this->createUser();

        $response = $this->actingAs($user)->getJson('/api/admin/genai-jobs');
        $response->assertForbidden();
    }

    public function test_index_returns_paginated_jobs_for_admin(): void
    {
        $admin = $this->createAdminUser();
        $user = $this->createUser();

        GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'hash1',
            'original_filename' => 'statement.pdf',
            's3_path' => "genai-import/{$user->id}/statement.pdf",
            'file_size_bytes' => 1024,
            'status' => 'parsed',
        ]);

        GenAiImportJob::create([
            'user_id' => $admin->id,
            'job_type' => 'utility_bill',
            'file_hash' => 'hash2',
            'original_filename' => 'bill.pdf',
            's3_path' => "genai-import/{$admin->id}/bill.pdf",
            'file_size_bytes' => 2048,
            'status' => 'pending',
        ]);

        $response = $this->actingAs($admin)->getJson('/api/admin/genai-jobs');
        $response->assertOk();
        $response->assertJsonStructure([
            'data',
            'current_page',
            'last_page',
            'per_page',
            'total',
        ]);

        // Admin sees ALL users' jobs (2 total)
        $this->assertCount(2, $response->json('data'));
    }

    public function test_index_returns_jobs_ordered_most_recent_first(): void
    {
        $admin = $this->createAdminUser();

        // Older job - use DB directly to bypass Eloquent timestamp handling
        $olderId = \Illuminate\Support\Facades\DB::table('genai_import_jobs')->insertGetId([
            'user_id' => $admin->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'hash_older',
            'original_filename' => 'old.pdf',
            's3_path' => "genai-import/{$admin->id}/old.pdf",
            'file_size_bytes' => 1000,
            'status' => 'imported',
            'retry_count' => 0,
            'created_at' => now()->subHour()->toDateTimeString(),
            'updated_at' => now()->subHour()->toDateTimeString(),
        ]);

        // Newer job
        $newerId = \Illuminate\Support\Facades\DB::table('genai_import_jobs')->insertGetId([
            'user_id' => $admin->id,
            'job_type' => 'utility_bill',
            'file_hash' => 'hash_newer',
            'original_filename' => 'new.pdf',
            's3_path' => "genai-import/{$admin->id}/new.pdf",
            'file_size_bytes' => 2000,
            'status' => 'pending',
            'retry_count' => 0,
            'created_at' => now()->toDateTimeString(),
            'updated_at' => now()->toDateTimeString(),
        ]);

        $response = $this->actingAs($admin)->getJson('/api/admin/genai-jobs');
        $response->assertOk();

        $ids = collect($response->json('data'))->pluck('id')->toArray();
        // Newer job should appear first (lower index)
        $this->assertLessThan(
            array_search($olderId, $ids),
            array_search($newerId, $ids)
        );
    }

    public function test_index_includes_user_details(): void
    {
        $admin = $this->createAdminUser();
        $user = $this->createUser(['name' => 'Test Person', 'email' => 'testperson@example.com']);

        GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'finance_payslip',
            'file_hash' => 'somehash',
            'original_filename' => 'payslip.pdf',
            's3_path' => "genai-import/{$user->id}/payslip.pdf",
            'file_size_bytes' => 512,
            'status' => 'pending',
        ]);

        $response = $this->actingAs($admin)->getJson('/api/admin/genai-jobs');
        $response->assertOk();

        $job = $response->json('data.0');
        $this->assertNotNull($job['user']);
        $this->assertEquals('Test Person', $job['user']['name']);
        $this->assertEquals('testperson@example.com', $job['user']['email']);
    }

    // ================================================================
    // show tests
    // ================================================================

    public function test_show_requires_authentication(): void
    {
        $response = $this->getJson('/api/admin/genai-jobs/1');
        $response->assertUnauthorized();
    }

    public function test_show_requires_admin_role(): void
    {
        // Create admin first so user doesn't get ID 1 (which always has admin)
        $admin = $this->createAdminUser();
        $user = $this->createUser();

        $job = GenAiImportJob::create([
            'user_id' => $admin->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'abc',
            'original_filename' => 'test.pdf',
            's3_path' => "genai-import/{$admin->id}/test.pdf",
            'file_size_bytes' => 100,
            'status' => 'pending',
        ]);

        $response = $this->actingAs($user)->getJson("/api/admin/genai-jobs/{$job->id}");
        $response->assertForbidden();
    }

    public function test_show_returns_job_with_results(): void
    {
        $admin = $this->createAdminUser();
        $user = $this->createUser();

        $job = GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'testhash',
            'original_filename' => 'statements.pdf',
            's3_path' => "genai-import/{$user->id}/statements.pdf",
            'file_size_bytes' => 10240,
            'status' => 'parsed',
            'context_json' => '{"accounts":[{"name":"Checking","last4":"1234"}]}',
        ]);

        $response = $this->actingAs($admin)->getJson("/api/admin/genai-jobs/{$job->id}");
        $response->assertOk();
        $response->assertJsonPath('id', $job->id);
        $response->assertJsonPath('original_filename', 'statements.pdf');
        $response->assertJsonPath('context_json', '{"accounts":[{"name":"Checking","last4":"1234"}]}');
    }

    public function test_show_returns_404_for_nonexistent_job(): void
    {
        $admin = $this->createAdminUser();

        $response = $this->actingAs($admin)->getJson('/api/admin/genai-jobs/99999');
        $response->assertStatus(404);
    }

    public function test_admin_can_view_any_users_job(): void
    {
        $admin = $this->createAdminUser();
        $user = $this->createUser();

        $job = GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'utility_bill',
            'file_hash' => 'billhash',
            'original_filename' => 'utility.pdf',
            's3_path' => "genai-import/{$user->id}/utility.pdf",
            'file_size_bytes' => 500,
            'status' => 'failed',
            'error_message' => 'Gemini error: bad request',
        ]);

        $response = $this->actingAs($admin)->getJson("/api/admin/genai-jobs/{$job->id}");
        $response->assertOk();
        $response->assertJsonPath('error_message', 'Gemini error: bad request');
    }
}
