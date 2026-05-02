<?php

namespace Tests\Feature\Finance;

use App\Console\Commands\Finance\FinanceTaxImportCommand;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class FinanceTaxCommandsTest extends TestCase
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
        FinanceTaxImportCommand::$testStdinOverride = null;
        putenv('FINANCE_CLI_USER_ID');
        parent::tearDown();
    }

    private function makeTaxDoc(string $formType, int $year = 2024, array $parsedData = [], array $overrides = []): FileForTaxDocument
    {
        return FileForTaxDocument::create(array_merge([
            'user_id' => $this->user->id,
            'form_type' => $formType,
            'tax_year' => $year,
            'original_filename' => "{$formType}-{$year}.pdf",
            'stored_filename' => "{$formType}_{$year}_stored.pdf",
            'file_size_bytes' => 0,
            'file_hash' => uniqid("{$formType}_{$year}_"),
            'genai_status' => 'parsed',
            'parsed_data' => $parsedData ?: null,
        ], $overrides));
    }

    // -------------------------------------------------------------------------
    // finance:tax-docs
    // -------------------------------------------------------------------------

    public function test_tax_docs_requires_year(): void
    {
        $this->artisan('finance:tax-docs')
            ->assertExitCode(1)
            ->expectsOutputToContain('--year is required');
    }

    public function test_tax_docs_rejects_invalid_year(): void
    {
        $this->artisan('finance:tax-docs', ['--year' => '99'])
            ->assertExitCode(1);
    }

    public function test_tax_docs_lists_documents_for_year(): void
    {
        $this->makeTaxDoc('w2', 2024);
        $this->makeTaxDoc('w2', 2023); // different year, should not appear

        $this->artisan('finance:tax-docs', ['--year' => '2024'])
            ->assertExitCode(0)
            ->expectsOutputToContain('w2');
    }

    public function test_tax_docs_shows_no_results_for_empty_year(): void
    {
        $this->artisan('finance:tax-docs', ['--year' => '2099'])
            ->assertExitCode(0);
    }

    public function test_tax_docs_json_output_contains_fields(): void
    {
        // JSON writes the entire payload in one $this->line() call, so only one
        // expectsOutputToContain can match per doWrite invocation.
        $doc = $this->makeTaxDoc('1099_int', 2024);

        $this->artisan('finance:tax-docs', ['--year' => '2024', '--format' => 'json'])
            ->assertExitCode(0)
            ->expectsOutputToContain('"form_type"');
    }

    public function test_tax_docs_filters_by_account(): void
    {
        $account = FinAccounts::withoutEvents(function () {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $this->user->id,
                'acct_name' => 'Test Brokerage',
            ]);
        });

        $doc = $this->makeTaxDoc('k1', 2024);
        TaxDocumentAccount::create([
            'tax_document_id' => $doc->id,
            'account_id' => $account->acct_id,
            'form_type' => 'k1',
            'tax_year' => 2024,
            'is_reviewed' => false,
        ]);

        // Only the k1 with the specific account should appear
        $this->artisan('finance:tax-docs', ['--year' => '2024', '--account' => (string) $account->acct_id])
            ->assertExitCode(0)
            ->expectsOutputToContain('k1');
    }

    public function test_tax_docs_does_not_show_other_users_documents(): void
    {
        $otherUser = User::factory()->create();
        FileForTaxDocument::create([
            'user_id' => $otherUser->id,
            'form_type' => 'w2',
            'tax_year' => 2024,
            'original_filename' => 'other-w2.pdf',
            'stored_filename' => 'other_w2_stored.pdf',
            'file_size_bytes' => 0,
            'file_hash' => uniqid('other_'),
        ]);

        $this->artisan('finance:tax-docs', ['--year' => '2024', '--format' => 'json'])
            ->assertExitCode(0)
            ->expectsOutputToContain('[]');
    }

    // -------------------------------------------------------------------------
    // finance:k1-codes
    // -------------------------------------------------------------------------

    public function test_k1_codes_lists_resolved_box_11s_character_from_notes(): void
    {
        $account = FinAccounts::withoutEvents(function () {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $this->user->id,
                'acct_name' => 'Delphi Plus',
            ]);
        });

        $doc = $this->makeTaxDoc('k1', 2025, [
            'schemaVersion' => '2026.1',
            'formType' => '1065',
            'fields' => [
                'A' => ['value' => '85-3677952'],
                'B' => ['value' => "AQR TA DELPHI PLUS FUND, LLC\nGREENWICH, CT"],
            ],
            'codes' => [
                '11' => [
                    ['code' => 's', 'value' => '-101298', 'notes' => 'Non-portfolio capital gain (loss) – Net short-term capital loss.'],
                    ['code' => ' S ', 'value' => '70035', 'notes' => 'Non-portfolio capital gain (loss) – Net long-term capital gain.'],
                ],
            ],
        ]);
        TaxDocumentAccount::createLink($doc->id, $account->acct_id, 'k1', 2025);

        $exitCode = Artisan::call('finance:k1-codes', [
            '--year' => '2025',
            '--account' => (string) $account->acct_id,
            '--box' => '11',
            '--code' => 'S',
            '--format' => 'json',
        ]);
        $output = Artisan::output();

        $this->assertSame(0, $exitCode);
        $this->assertStringContainsString('"character": "short"', $output);
        $this->assertStringContainsString('"character_source": "notes"', $output);
        $this->assertStringContainsString('Schedule D line 12', $output);
    }

    // -------------------------------------------------------------------------
    // finance:tax-render
    // -------------------------------------------------------------------------

    public function test_tax_render_requires_year(): void
    {
        $this->artisan('finance:tax-render')
            ->assertExitCode(1)
            ->expectsOutputToContain('--year is required');
    }

    public function test_tax_render_rejects_invalid_year(): void
    {
        $this->artisan('finance:tax-render', ['--year' => 'abc'])
            ->assertExitCode(1);
    }

    public function test_tax_render_shows_message_when_no_parsed_data(): void
    {
        $this->artisan('finance:tax-render', ['--year' => '2099'])
            ->assertExitCode(0)
            ->expectsOutputToContain('No tax documents');
    }

    public function test_tax_render_renders_w2(): void
    {
        $this->makeTaxDoc('w2', 2024, [
            'box1_wages' => 50000.00,
            'box2_fed_tax' => 8000.00,
            'employer_name' => 'Acme Corp',
            'employer_ein' => '12-3456789',
            'employee_name' => 'John Doe',
            'employee_ssn_last4' => '1234',
        ]);

        $this->artisan('finance:tax-render', ['--year' => '2024'])
            ->assertExitCode(0)
            ->expectsOutputToContain('W2')
            ->expectsOutputToContain('Acme Corp')
            ->expectsOutputToContain('50,000.00');
    }

    public function test_tax_render_renders_1099_int(): void
    {
        $this->makeTaxDoc('1099_int', 2024, [
            'box1_interest' => 1234.56,
            'payer_name' => 'Big Bank',
            'payer_tin' => '99-1234567',
            'account_number' => 'XXXX1234',
        ]);

        $this->artisan('finance:tax-render', ['--year' => '2024'])
            ->assertExitCode(0)
            ->expectsOutputToContain('1099-INT')
            ->expectsOutputToContain('Big Bank')
            ->expectsOutputToContain('1,234.56');
    }

    public function test_tax_render_renders_k1_legacy_format(): void
    {
        $this->makeTaxDoc('k1', 2024, [
            'form_source' => 1065,
            'entity_name' => 'Legacy Partners LLC',
            'partner_name' => 'John Doe',
            'box1_ordinary_income' => 500,
            'box10_other_deductions' => 200,
        ]);

        $this->artisan('finance:tax-render', ['--year' => '2024'])
            ->assertExitCode(0)
            ->expectsOutputToContain('K1');
    }

    public function test_tax_render_renders_k1_structured_format(): void
    {
        $this->makeTaxDoc('k1', 2024, [
            'schemaVersion' => '2026.1',
            'formType' => '1065',
            'fields' => [
                'A' => ['value' => 'XX-1234567'],
                'B' => ['value' => 'Structured Fund LLC'],
            ],
            'codes' => [
                '11' => [
                    ['code' => 'C', 'value' => '32545', 'notes' => 'Section 1256'],
                ],
            ],
            'k3' => ['sections' => []],
            'warnings' => ['Box 11ZZ: ordinary losses.'],
            'extraction' => ['model' => 'gemini', 'version' => '2026.1'],
        ]);

        $this->artisan('finance:tax-render', ['--year' => '2024'])
            ->assertExitCode(0)
            ->expectsOutputToContain('2026.1')
            ->expectsOutputToContain('Structured Fund LLC')
            ->expectsOutputToContain('32545');
    }

    public function test_tax_render_filters_by_form_type(): void
    {
        $this->makeTaxDoc('w2', 2024, ['box1_wages' => 50000, 'employer_name' => 'Acme']);
        $this->makeTaxDoc('1099_int', 2024, ['box1_interest' => 100, 'payer_name' => 'Bank']);

        $this->artisan('finance:tax-render', ['--year' => '2024', '--form' => 'w2'])
            ->assertExitCode(0)
            ->expectsOutputToContain('W2');
    }

    public function test_tax_render_json_output(): void
    {
        // JSON writes the entire payload in one $this->line() call, so only one
        // expectsOutputToContain can match per doWrite invocation.
        $this->makeTaxDoc('1099_int', 2024, ['box1_interest' => 100]);

        $this->artisan('finance:tax-render', ['--year' => '2024', '--format' => 'json'])
            ->assertExitCode(0)
            ->expectsOutputToContain('"form_type"');
    }

    // -------------------------------------------------------------------------
    // finance:tax-import
    // -------------------------------------------------------------------------

    public function test_tax_import_schema_flag(): void
    {
        $this->artisan('finance:tax-import', ['--schema' => true])
            ->assertExitCode(0)
            ->expectsOutputToContain('documents');
    }

    public function test_tax_import_requires_year(): void
    {
        FinanceTaxImportCommand::$testStdinOverride = ['documents' => []];

        $this->artisan('finance:tax-import')
            ->assertExitCode(1)
            ->expectsOutputToContain('--year is required');
    }

    public function test_tax_import_inserts_document(): void
    {
        FinanceTaxImportCommand::$testStdinOverride = [
            'documents' => [
                [
                    'form_type' => 'w2',
                    'parsed_data' => ['box1_wages' => 50000],
                    'original_filename' => 'w2-2024.pdf',
                ],
            ],
        ];

        $this->artisan('finance:tax-import', ['--year' => '2024'])
            ->assertExitCode(0)
            ->expectsOutputToContain('inserted');

        $this->assertDatabaseHas('fin_tax_documents', [
            'user_id' => $this->user->id,
            'form_type' => 'w2',
            'tax_year' => 2024,
        ]);
    }

    public function test_tax_import_dry_run_does_not_write(): void
    {
        FinanceTaxImportCommand::$testStdinOverride = [
            'documents' => [
                [
                    'form_type' => '1099_int',
                    'parsed_data' => ['box1_interest' => 100],
                ],
            ],
        ];

        $this->artisan('finance:tax-import', ['--year' => '2024', '--dry-run' => true])
            ->assertExitCode(0)
            ->expectsOutputToContain('would_insert');

        $this->assertDatabaseMissing('fin_tax_documents', [
            'user_id' => $this->user->id,
            'form_type' => '1099_int',
        ]);
    }

    public function test_tax_import_rejects_invalid_form_type(): void
    {
        FinanceTaxImportCommand::$testStdinOverride = [
            'documents' => [
                [
                    'form_type' => 'not_a_real_form',
                    'parsed_data' => ['foo' => 'bar'],
                ],
            ],
        ];

        $this->artisan('finance:tax-import', ['--year' => '2024'])
            ->assertExitCode(1)
            ->expectsOutputToContain('invalid or missing form_type');
    }

    public function test_tax_import_rejects_missing_parsed_data(): void
    {
        FinanceTaxImportCommand::$testStdinOverride = [
            'documents' => [
                ['form_type' => 'w2'],
            ],
        ];

        $this->artisan('finance:tax-import', ['--year' => '2024'])
            ->assertExitCode(1)
            ->expectsOutputToContain('parsed_data');
    }

    public function test_tax_import_with_account_links(): void
    {
        FinanceTaxImportCommand::$testStdinOverride = [
            'documents' => [
                [
                    'form_type' => 'k1',
                    'parsed_data' => ['schemaVersion' => '1.0', 'fields' => [], 'codes' => [], 'k3' => ['sections' => []]],
                    'account_links' => [
                        ['account_id' => null, 'form_type' => 'k1', 'tax_year' => 2024],
                    ],
                ],
            ],
        ];

        $this->artisan('finance:tax-import', ['--year' => '2024'])
            ->assertExitCode(0);

        $doc = FileForTaxDocument::where('user_id', $this->user->id)
            ->where('form_type', 'k1')
            ->first();

        $this->assertNotNull($doc);
        $this->assertDatabaseHas('fin_tax_document_accounts', [
            'tax_document_id' => $doc->id,
            'form_type' => 'k1',
            'tax_year' => 2024,
        ]);
    }
}
