<?php

namespace Tests\Feature;

use App\GenAiProcessor\Models\GenAiDailyQuota;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Services\GenAiJobDispatcherService;
use Tests\TestCase;

class GenAiJobDispatcherServiceTest extends TestCase
{
    // ================================================================
    // claimQuota tests
    // ================================================================

    public function test_claim_quota_succeeds_when_under_limit(): void
    {
        $user = $this->createUser();
        $service = new GenAiJobDispatcherService;

        // Default limit is 500
        $result = $service->claimQuota($user->id);
        $this->assertTrue($result);

        // Check the quota was incremented
        $today = now()->utc()->toDateString();
        $quota = GenAiDailyQuota::find($today);
        $this->assertNotNull($quota);
        $this->assertEquals(1, $quota->request_count);
    }

    public function test_claim_quota_fails_when_limit_reached(): void
    {
        $user = $this->createUser();
        $service = new GenAiJobDispatcherService;

        $today = now()->utc()->toDateString();

        // Set quota to the site-wide limit (500)
        GenAiDailyQuota::create([
            'usage_date' => $today,
            'request_count' => 500,
        ]);

        $result = $service->claimQuota($user->id);
        $this->assertFalse($result);
    }

    public function test_claim_quota_fails_when_per_user_limit_reached(): void
    {
        // Set a per-user limit of 2
        $user = $this->createUser(['genai_daily_quota_limit' => 2]);
        $service = new GenAiJobDispatcherService;

        $today = now()->utc()->toDateString();

        // Simulate 2 completed jobs today for this user
        GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'abc123',
            'original_filename' => 'test.pdf',
            's3_path' => 'genai-import/1/test.pdf',
            'file_size_bytes' => 1000,
            'status' => 'parsed',
        ]);
        GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'def456',
            'original_filename' => 'test2.pdf',
            's3_path' => 'genai-import/1/test2.pdf',
            'file_size_bytes' => 1000,
            'status' => 'parsed',
        ]);

        $result = $service->claimQuota($user->id, $user);
        $this->assertFalse($result);
    }

    public function test_claim_quota_increments_count(): void
    {
        $user = $this->createUser();
        $service = new GenAiJobDispatcherService;

        $today = now()->utc()->toDateString();

        GenAiDailyQuota::create([
            'usage_date' => $today,
            'request_count' => 5,
        ]);

        $result = $service->claimQuota($user->id);
        $this->assertTrue($result);

        $quota = GenAiDailyQuota::find($today);
        $this->assertEquals(6, $quota->request_count);
    }

    // ================================================================
    // validateContext tests
    // ================================================================

    public function test_validate_context_allows_null(): void
    {
        $service = new GenAiJobDispatcherService;
        $this->assertTrue($service->validateContext('finance_transactions', null));
    }

    public function test_validate_context_rejects_unexpected_keys(): void
    {
        $service = new GenAiJobDispatcherService;

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('/Unexpected context keys/');
        $service->validateContext('finance_transactions', ['malicious_key' => 'value']);
    }

    public function test_validate_context_accepts_valid_finance_context(): void
    {
        $service = new GenAiJobDispatcherService;

        $result = $service->validateContext('finance_transactions', [
            'accounts' => [
                ['name' => 'Savings', 'last4' => '1234'],
            ],
        ]);
        $this->assertTrue($result);
    }

    public function test_validate_context_rejects_invalid_account_last4(): void
    {
        $service = new GenAiJobDispatcherService;

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Account last4 must be at most 4 characters');
        $service->validateContext('finance_transactions', [
            'accounts' => [
                ['name' => 'Savings', 'last4' => '12345'],
            ],
        ]);
    }

    public function test_validate_context_accepts_valid_payslip_context(): void
    {
        $service = new GenAiJobDispatcherService;

        $result = $service->validateContext('finance_payslip', [
            'employment_entity_id' => 1,
            'file_count' => 3,
        ]);
        $this->assertTrue($result);
    }

    public function test_validate_context_accepts_valid_utility_context(): void
    {
        $service = new GenAiJobDispatcherService;

        $result = $service->validateContext('utility_bill', [
            'account_type' => 'Electricity',
            'utility_account_id' => 5,
        ]);
        $this->assertTrue($result);
    }

    public function test_validate_context_rejects_unknown_job_type(): void
    {
        $service = new GenAiJobDispatcherService;

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Unknown job type');
        $service->validateContext('unknown_type', ['key' => 'value']);
    }

    // ================================================================
    // buildPrompt tests
    // ================================================================

    public function test_build_prompt_for_finance_transactions(): void
    {
        $service = new GenAiJobDispatcherService;

        $prompt = $service->buildPrompt('finance_transactions', []);
        $this->assertStringContainsString('"accounts"', $prompt);
        $this->assertStringContainsString('Always return an `accounts` array', $prompt);
        $this->assertStringContainsString('transactions', $prompt);
        $this->assertStringContainsString('lots', $prompt);
        $this->assertStringNotContainsString('single-account', $prompt);
    }

    public function test_build_prompt_for_finance_transactions_with_accounts(): void
    {
        $service = new GenAiJobDispatcherService;

        $prompt = $service->buildPrompt('finance_transactions', [
            'accounts' => [
                ['name' => 'My Savings', 'last4' => '1234'],
            ],
        ]);
        $this->assertStringContainsString('Known user accounts', $prompt);
        $this->assertStringContainsString('My Savings: last 4 digits 1234', $prompt);
        $this->assertStringContainsString('Always return an `accounts` array', $prompt);
    }

    public function test_build_prompt_for_payslip(): void
    {
        $service = new GenAiJobDispatcherService;

        $prompt = $service->buildPrompt('finance_payslip', ['file_count' => 2]);
        $this->assertStringContainsString('payslip', $prompt);
        $this->assertStringContainsString('period_start', $prompt);
        $this->assertStringContainsString('earnings_gross', $prompt);
    }

    public function test_build_prompt_for_utility_bill(): void
    {
        $service = new GenAiJobDispatcherService;

        $prompt = $service->buildPrompt('utility_bill', ['account_type' => 'Electricity']);
        $this->assertStringContainsString('utility bill', $prompt);
        $this->assertStringContainsString('power_consumed_kwh', $prompt);
    }

    public function test_build_prompt_for_utility_bill_non_electric(): void
    {
        $service = new GenAiJobDispatcherService;

        $prompt = $service->buildPrompt('utility_bill', ['account_type' => 'Water']);
        $this->assertStringContainsString('utility bill', $prompt);
        $this->assertStringNotContainsString('power_consumed_kwh', $prompt);
    }

    public function test_build_prompt_rejects_unknown_job_type(): void
    {
        $service = new GenAiJobDispatcherService;

        $this->expectException(\InvalidArgumentException::class);
        $service->buildPrompt('unknown_type', []);
    }
}
