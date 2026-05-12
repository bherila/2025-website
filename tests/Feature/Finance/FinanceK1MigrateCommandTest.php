<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\User;
use App\Services\Finance\DocumentIngestionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinanceK1MigrateCommandTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        putenv("FINANCE_CLI_USER_ID={$this->user->id}");
    }

    protected function tearDown(): void
    {
        putenv('FINANCE_CLI_USER_ID');
        parent::tearDown();
    }

    private function makeLegacyK1(array $overrides = []): FileForTaxDocument
    {
        return app(DocumentIngestionService::class)->createTaxFormDetail(array_merge([
            'user_id' => $this->user->id,
            'form_type' => 'k1',
            'tax_year' => 2023,
            'original_filename' => 'k1.pdf',
            'stored_filename' => 'k1_stored.pdf',
            's3_path' => "tax_docs/{$this->user->id}/k1_stored.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 0,
            'file_hash' => hash('sha256', uniqid('test_hash_', true)),
            'parsed_data' => [
                'entity_name' => 'Acme Partners LLC',
                'partner_name' => 'John Doe',
                'box1_ordinary_income' => 500,
                'box10_other_deductions' => 200,
                'other_coded_items' => [
                    ['code' => '13AE', 'amount' => 1049, 'description' => 'Investment Interest'],
                ],
            ],
        ], $overrides));
    }

    public function test_migrates_legacy_records(): void
    {
        $doc = $this->makeLegacyK1();

        // Per-record line comes before the summary, so expectations must match in output order.
        $this->artisan('finance:k1-migrate')
            ->assertExitCode(0)
            ->expectsOutputToContain('Acme Partners LLC')
            ->expectsOutputToContain('Migrated: 1 record(s)');

        $doc->refresh();
        $this->assertSame('1.0', $doc->getRawOriginal('parsed_data') !== null
            ? json_decode($doc->getRawOriginal('parsed_data'), true)['schemaVersion'] ?? null
            : null);
    }

    public function test_skips_already_canonical_records(): void
    {
        app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $this->user->id,
            'form_type' => 'k1',
            'tax_year' => 2023,
            'original_filename' => 'k1.pdf',
            'stored_filename' => 'k1_stored.pdf',
            's3_path' => "tax_docs/{$this->user->id}/k1_stored.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 0,
            'file_hash' => hash('sha256', 'canonical_hash'),
            'parsed_data' => [
                'schemaVersion' => '2026.1',
                'fields' => ['1' => ['value' => '500']],
                'codes' => [],
                'k3' => ['sections' => []],
            ],
        ]);

        $this->artisan('finance:k1-migrate')
            ->assertExitCode(0)
            ->expectsOutputToContain('Migrated: 0 record(s)')
            ->expectsOutputToContain('Skipped (already canonical): 1');
    }

    public function test_dry_run_does_not_write_to_database(): void
    {
        $doc = $this->makeLegacyK1();
        $originalData = $doc->getRawOriginal('parsed_data');

        // Per-record line (with [dry-run] tag) comes before the summary.
        $this->artisan('finance:k1-migrate', ['--dry-run' => true])
            ->assertExitCode(0)
            ->expectsOutputToContain('[dry-run]')
            ->expectsOutputToContain('Would migrate: 1 record(s)');

        $doc->refresh();
        $this->assertSame($originalData, $doc->getRawOriginal('parsed_data'));
    }

    public function test_skips_non_k1_documents(): void
    {
        app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $this->user->id,
            'form_type' => 'w2',
            'tax_year' => 2023,
            'original_filename' => 'w2.pdf',
            'stored_filename' => 'w2_stored.pdf',
            's3_path' => "tax_docs/{$this->user->id}/w2_stored.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 0,
            'file_hash' => hash('sha256', 'w2_hash'),
            'parsed_data' => ['box1' => 50000],
        ]);

        $this->artisan('finance:k1-migrate')
            ->assertExitCode(0)
            ->expectsOutputToContain('Migrated: 0 record(s)');
    }

    public function test_migration_is_idempotent(): void
    {
        $doc = $this->makeLegacyK1();

        $this->artisan('finance:k1-migrate')->assertExitCode(0);
        $this->artisan('finance:k1-migrate')
            ->assertExitCode(0)
            ->expectsOutputToContain('Migrated: 0 record(s)')
            ->expectsOutputToContain('Skipped (already canonical): 1');

        $doc->refresh();
        $this->assertSame('1.0', json_decode($doc->getRawOriginal('parsed_data'), true)['schemaVersion'] ?? null);
    }

    public function test_model_accessor_normalises_legacy_data_on_read(): void
    {
        $doc = $this->makeLegacyK1(['parsed_data' => [
            'entity_name' => 'Acme Partners LLC',
            'box1_ordinary_income' => 500,
        ]]);

        // Reload to bypass any cached state
        $fresh = FileForTaxDocument::find($doc->id);
        $data = $fresh->parsed_data;

        $this->assertSame('1.0', $data['schemaVersion']);
        $this->assertArrayHasKey('fields', $data);
        $this->assertArrayHasKey('codes', $data);
    }

    public function test_only_migrates_records_belonging_to_configured_user(): void
    {
        $otherUser = User::factory()->create();
        app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $otherUser->id,
            'form_type' => 'k1',
            'tax_year' => 2023,
            'original_filename' => 'k1_other.pdf',
            'stored_filename' => 'k1_other_stored.pdf',
            's3_path' => "tax_docs/{$otherUser->id}/k1_other_stored.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 0,
            'file_hash' => hash('sha256', 'other_hash'),
            'parsed_data' => ['entity_name' => 'Other LLC', 'box1_ordinary_income' => 100],
        ]);

        $this->artisan('finance:k1-migrate')
            ->assertExitCode(0)
            ->expectsOutputToContain('Migrated: 0 record(s)');
    }
}
