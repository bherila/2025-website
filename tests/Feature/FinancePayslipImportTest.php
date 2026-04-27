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

    public function test_import_payslips_requires_ai_configuration(): void
    {
        $user = User::factory()->create(['gemini_api_key' => null]);

        $response = $this->actingAs($user)->postJson('/api/payslips/import', [
            'files' => [
                UploadedFile::fake()->create('payslip.pdf', 100),
            ],
        ]);

        $response->assertStatus(400);
        $response->assertJson(['error' => 'No AI configuration found. Please add one in Settings.']);
    }

    public function test_import_payslips_successfully_processes_gemini_response(): void
    {
        $user = User::factory()->create(['gemini_api_key' => 'fake-key']);

        Http::fake([
            'https://generativelanguage.googleapis.com/upload/v1beta/files*' => Http::response([
                'file' => ['uri' => 'files/test-payslip-uri'],
            ], 200),
            'https://generativelanguage.googleapis.com/v1beta/models/*:generateContent*' => Http::response([
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

    public function test_import_payslips_handles_gemini_rate_limit(): void
    {
        $user = User::factory()->create(['gemini_api_key' => 'fake-key']);

        Http::fake([
            'https://generativelanguage.googleapis.com/upload/v1beta/files*' => Http::response([
                'file' => ['uri' => 'files/test-uri'],
            ], 200),
            'https://generativelanguage.googleapis.com/v1beta/models/*:generateContent*' => Http::response([
                'error' => ['code' => 429, 'message' => 'Rate limit exceeded'],
            ], 429),
        ]);

        $response = $this->actingAs($user)->postJson('/api/payslips/import', [
            'files' => [
                UploadedFile::fake()->create('payslip.pdf', 100, 'application/pdf'),
            ],
        ]);

        $response->assertStatus(429);
        $response->assertJson(['error' => 'API rate limit exceeded. Please wait and try again.']);
    }

    public function test_import_payslips_handles_gemini_api_error(): void
    {
        $user = User::factory()->create(['gemini_api_key' => 'fake-key']);

        Http::fake([
            'https://generativelanguage.googleapis.com/upload/v1beta/files*' => Http::response([
                'file' => ['uri' => 'files/test-uri'],
            ], 200),
            'https://generativelanguage.googleapis.com/v1beta/models/*:generateContent*' => Http::response([
                'error' => ['code' => 500, 'message' => 'Internal server error'],
            ], 500),
        ]);

        $response = $this->actingAs($user)->postJson('/api/payslips/import', [
            'files' => [
                UploadedFile::fake()->create('payslip.pdf', 100, 'application/pdf'),
            ],
        ]);

        $response->assertStatus(500);
        $response->assertJson(['error' => 'An unexpected error occurred during import.']);
    }

    public function test_import_payslips_handles_multiple_payslips_in_single_file(): void
    {
        $user = User::factory()->create(['gemini_api_key' => 'fake-key']);

        Http::fake([
            'https://generativelanguage.googleapis.com/upload/v1beta/files*' => Http::response([
                'file' => ['uri' => 'files/test-multi-uri'],
            ], 200),
            'https://generativelanguage.googleapis.com/v1beta/models/*:generateContent*' => Http::response([
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
                                        [
                                            'period_start' => '2026-01-16',
                                            'period_end' => '2026-01-31',
                                            'pay_date' => '2026-02-05',
                                            'earnings_gross' => 5200,
                                            'earnings_net_pay' => 4100,
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
                UploadedFile::fake()->create('payslips-jan.pdf', 100, 'application/pdf'),
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('successful_imports', 2);
        $this->assertDatabaseCount('fin_payslip', 2);
    }
}
