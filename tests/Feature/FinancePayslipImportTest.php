<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class FinancePayslipImportTest extends TestCase
{
    public function test_import_payslips_fails_without_auth(): void
    {
        $response = $this->postJson('/api/payslips/import', [
            'files' => [
                UploadedFile::fake()->create('payslip.pdf', 100),
            ],
        ]);

        $response->assertStatus(401);
    }

    public function test_import_payslips_requires_gemini_api_key(): void
    {
        $user = User::factory()->create(['gemini_api_key' => null]);

        $response = $this->actingAs($user)->postJson('/api/payslips/import', [
            'files' => [
                UploadedFile::fake()->create('payslip.pdf', 100),
            ],
        ]);

        $response->assertStatus(400);
        $response->assertJson(['error' => 'Gemini API key is not set.']);
    }

    public function test_import_payslips_validates_file_size(): void
    {
        $user = User::factory()->create(['gemini_api_key' => 'fake-key']);

        $response = $this->actingAs($user)->postJson('/api/payslips/import', [
            'files' => [
                UploadedFile::fake()->create('large.pdf', 7 * 1024), // 7MB
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJson(['error' => 'Total file size exceeds the limit (6MB). Please upload fewer files.']);
    }

    public function test_import_payslips_successfully_processes_gemini_response(): void
    {
        $user = User::factory()->create(['gemini_api_key' => 'fake-key']);

        Http::fake([
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent*' => Http::response([
                'candidates' => [
                    [
                        'content' => [
                            'parts' => [
                                [
                                    'text' => json_encode([
                                        [
                                            'period_start' => '2026-01-01',
                                            'period_end' => '2026-01-15',
                                            'pay_date' => '2026-01-20',
                                            'earnings_gross' => 5000,
                                            'earnings_net_pay' => 4000,
                                        ],
                                    ]),
                                ],
                            ],
                        ],
                    ],
                ],
            ], 200),
        ]);

        $response = $this->actingAs($user)->postJson('/api/payslips/import', [
            'files' => [
                UploadedFile::fake()->create('payslip.pdf', 100, 'application/pdf'),
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('success', true);
        $response->assertJsonPath('successful_imports', 1);

        $this->assertDatabaseHas('fin_payslip', [
            'uid' => $user->id,
            'period_start' => '2026-01-01',
            'period_end' => '2026-01-15',
            'pay_date' => '2026-01-20',
            'earnings_gross' => 5000,
            'earnings_net_pay' => 4000,
            'ps_is_estimated' => true,
        ]);
    }

    public function test_import_payslips_handles_gemini_api_error(): void
    {
        $user = User::factory()->create(['gemini_api_key' => 'fake-key']);

        Http::fake([
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent*' => Http::response([
                'error' => [
                    'code' => 404,
                    'message' => 'Model not found',
                ],
            ], 404),
        ]);

        $response = $this->actingAs($user)->postJson('/api/payslips/import', [
            'files' => [
                UploadedFile::fake()->create('payslip.pdf', 100, 'application/pdf'),
            ],
        ]);

        $response->assertStatus(500);
        $response->assertJson(['error' => 'Gemini API request failed.']);
    }
}
