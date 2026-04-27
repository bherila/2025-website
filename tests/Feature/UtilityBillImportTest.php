<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\UtilityBillTracker\UtilityAccount;
use App\Services\FileStorageService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class UtilityBillImportTest extends TestCase
{
    private function makeAccount(User $user, string $accountType = 'Gas'): UtilityAccount
    {
        Auth::login($user);

        return UtilityAccount::create([
            'user_id' => $user->id,
            'account_name' => 'Test Account',
            'account_type' => $accountType,
            'utility_provider' => 'Test Provider',
        ]);
    }

    private function fakeGeminiSuccess(array $billData): void
    {
        Http::fake([
            'https://generativelanguage.googleapis.com/upload/v1beta/files*' => Http::response([
                'file' => ['uri' => 'files/test-utility-bill-uri'],
            ], 200),
            'https://generativelanguage.googleapis.com/v1beta/models/*:generateContent*' => Http::response([
                'candidates' => [
                    [
                        'content' => [
                            'parts' => [
                                ['text' => json_encode([$billData])],
                            ],
                        ],
                    ],
                ],
            ], 200),
            'https://generativelanguage.googleapis.com/v1beta/files/*' => Http::response([], 200),
        ]);
    }

    public function test_import_fails_without_auth(): void
    {
        $response = $this->postJson('/api/utility-bill-tracker/accounts/1/bills/import-pdf', [
            'files' => [UploadedFile::fake()->create('bill.pdf', 100)],
        ]);

        $response->assertStatus(401);
    }

    public function test_import_requires_gemini_api_key(): void
    {
        $user = User::factory()->create(['gemini_api_key' => null]);
        $account = $this->makeAccount($user);

        $response = $this->actingAs($user)->postJson("/api/utility-bill-tracker/accounts/{$account->id}/bills/import-pdf", [
            'files' => [UploadedFile::fake()->create('bill.pdf', 100, 'application/pdf')],
        ]);

        $response->assertStatus(400);
        $response->assertJson(['error' => 'Gemini API key is not set. Please set it in your account settings.']);
    }

    public function test_import_rejects_non_pdf(): void
    {
        $user = User::factory()->create(['gemini_api_key' => 'fake-key']);
        $account = $this->makeAccount($user);

        $response = $this->actingAs($user)->postJson("/api/utility-bill-tracker/accounts/{$account->id}/bills/import-pdf", [
            'files' => [UploadedFile::fake()->create('bill.txt', 100, 'text/plain')],
        ]);

        $response->assertStatus(422);
    }

    public function test_import_successfully_creates_bill(): void
    {
        $user = User::factory()->create(['gemini_api_key' => 'fake-key']);
        $account = $this->makeAccount($user);

        $this->fakeGeminiSuccess([
            'original_filename' => 'bill.pdf',
            'bill_start_date' => '2026-01-01',
            'bill_end_date' => '2026-01-31',
            'due_date' => '2026-02-15',
            'total_cost' => 89.50,
        ]);

        $this->mock(FileStorageService::class, fn ($mock) => $mock->shouldReceive('uploadContent')->andReturn(false));

        $response = $this->actingAs($user)->postJson("/api/utility-bill-tracker/accounts/{$account->id}/bills/import-pdf", [
            'files' => [UploadedFile::fake()->create('bill.pdf', 100, 'application/pdf')],
        ]);

        $response->assertOk();
        $response->assertJsonPath('success', true);
        $response->assertJsonPath('results.0.status', 'success');

        $this->assertDatabaseHas('utility_bill', [
            'utility_account_id' => $account->id,
            'total_cost' => 89.50,
            'status' => 'Unpaid',
        ]);
    }

    public function test_import_extracts_electricity_fields(): void
    {
        $user = User::factory()->create(['gemini_api_key' => 'fake-key']);
        $account = $this->makeAccount($user, 'Electricity');

        $this->fakeGeminiSuccess([
            'original_filename' => 'electric.pdf',
            'bill_start_date' => '2026-01-01',
            'bill_end_date' => '2026-01-31',
            'due_date' => '2026-02-15',
            'total_cost' => 120.00,
            'power_consumed_kwh' => 450,
            'total_generation_fees' => 60.00,
            'total_delivery_fees' => 50.00,
        ]);

        $this->mock(FileStorageService::class, fn ($mock) => $mock->shouldReceive('uploadContent')->andReturn(false));

        $response = $this->actingAs($user)->postJson("/api/utility-bill-tracker/accounts/{$account->id}/bills/import-pdf", [
            'files' => [UploadedFile::fake()->create('electric.pdf', 100, 'application/pdf')],
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('utility_bill', [
            'utility_account_id' => $account->id,
            'power_consumed_kwh' => 450,
            'total_generation_fees' => 60.00,
            'total_delivery_fees' => 50.00,
        ]);
    }

    public function test_import_handles_rate_limit(): void
    {
        $user = User::factory()->create(['gemini_api_key' => 'fake-key']);
        $account = $this->makeAccount($user);

        Http::fake([
            'https://generativelanguage.googleapis.com/upload/v1beta/files*' => Http::response([
                'file' => ['uri' => 'files/test-uri'],
            ], 200),
            'https://generativelanguage.googleapis.com/v1beta/models/*:generateContent*' => Http::response([], 429),
            'https://generativelanguage.googleapis.com/v1beta/files/*' => Http::response([], 200),
        ]);

        $response = $this->actingAs($user)->postJson("/api/utility-bill-tracker/accounts/{$account->id}/bills/import-pdf", [
            'files' => [UploadedFile::fake()->create('bill.pdf', 100, 'application/pdf')],
        ]);

        $response->assertStatus(429);
        $response->assertJson(['error' => 'API rate limit exceeded. Please wait and try again.']);
    }

    public function test_import_handles_upload_failure_gracefully(): void
    {
        $user = User::factory()->create(['gemini_api_key' => 'fake-key']);
        $account = $this->makeAccount($user);

        Http::fake([
            'https://generativelanguage.googleapis.com/upload/v1beta/files*' => Http::response([], 500),
        ]);

        $response = $this->actingAs($user)->postJson("/api/utility-bill-tracker/accounts/{$account->id}/bills/import-pdf", [
            'files' => [UploadedFile::fake()->create('bill.pdf', 100, 'application/pdf')],
        ]);

        $response->assertOk();
        $response->assertJsonPath('results.0.status', 'error');
        $this->assertDatabaseCount('utility_bill', 0);
    }
}
