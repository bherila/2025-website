<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Services\Finance\DocumentIngestionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinanceTaxReconcileCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_tax_reconcile_command_passes_for_matching_fixture(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_int',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Synthetic Bank', 'box1_interest' => 10.25],
        ]);
        $fixture = $this->fixturePath('matching.json', [
            'year' => 2025,
            'lines' => [
                ['form' => 'Schedule B', 'line' => '2', 'path' => 'scheduleB.interestTotal', 'expected' => 10.25, 'precision' => 2],
            ],
        ]);

        $this->artisan('finance:tax-reconcile', [
            '--user' => $user->id,
            '--year' => 2025,
            '--fixture' => $fixture,
            '--format' => 'json',
        ])
            ->assertExitCode(0)
            ->expectsOutputToContain('"status": "pass"');
    }

    public function test_tax_reconcile_command_fails_for_mismatched_fixture(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_int',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Synthetic Bank', 'box1_interest' => 10.25],
        ]);
        $fixture = $this->fixturePath('mismatch.json', [
            'year' => 2025,
            'lines' => [
                ['form' => 'Schedule B', 'line' => '2', 'path' => 'scheduleB.interestTotal', 'expected' => 11.25, 'precision' => 2],
            ],
        ]);

        $this->artisan('finance:tax-reconcile', [
            '--user' => $user->id,
            '--year' => 2025,
            '--fixture' => $fixture,
            '--format' => 'json',
        ])
            ->assertExitCode(1)
            ->expectsOutputToContain('"status": "fail"');
    }

    public function test_tax_reconcile_command_rejects_missing_user(): void
    {
        $fixture = $this->fixturePath('matching.json', [
            'year' => 2025,
            'lines' => [
                ['form' => 'Schedule B', 'line' => '2', 'path' => 'scheduleB.interestTotal', 'expected' => 10.25, 'precision' => 2],
            ],
        ]);

        $this->artisan('finance:tax-reconcile', [
            '--user' => 999999,
            '--year' => 2025,
            '--fixture' => $fixture,
        ])
            ->assertExitCode(1)
            ->expectsOutputToContain('User ID 999999 not found');
    }

    public function test_tax_reconcile_command_rejects_fixture_without_valid_lines(): void
    {
        $user = $this->createUser();
        $fixture = $this->fixturePath('empty.json', [
            'year' => 2025,
            'lines' => [],
        ]);

        $this->artisan('finance:tax-reconcile', [
            '--user' => $user->id,
            '--year' => 2025,
            '--fixture' => $fixture,
        ])
            ->assertExitCode(1)
            ->expectsOutputToContain('Tax reconciliation fixture must contain at least one valid line');
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function fixturePath(string $filename, array $payload): string
    {
        $directory = storage_path('framework/testing/tax-reconcile');
        if (! is_dir($directory)) {
            mkdir($directory, 0775, true);
        }

        $path = "{$directory}/{$filename}";
        file_put_contents($path, json_encode($payload, JSON_PRETTY_PRINT));

        return $path;
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createTaxDocument(int $userId, array $overrides): FileForTaxDocument
    {
        return app(DocumentIngestionService::class)->createTaxFormDetail(array_merge([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => '1099_int',
            'original_filename' => 'tax-doc.pdf',
            'stored_filename' => 'tax-doc.pdf',
            's3_path' => '',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 0,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $userId,
            'is_reviewed' => false,
        ], $overrides));
    }
}
