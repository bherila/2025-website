<?php

namespace Tests\Feature\Finance;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class FinancePrivateFundsReconcileCommandTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private string $root;

    private string $mapPath;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('s3');
        $this->user = User::factory()->create();
        putenv("FINANCE_CLI_USER_ID={$this->user->id}");
        $this->root = storage_path('framework/testing/private-funds-'.uniqid());
        $this->mapPath = $this->root.'/map.json';

        File::ensureDirectoryExists($this->root);
        foreach (array_keys($this->folderMap()) as $folder) {
            File::ensureDirectoryExists($this->root.'/'.$folder);
        }
        File::put($this->mapPath, (string) json_encode($this->folderMap()));
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->root);
        putenv('FINANCE_CLI_USER_ID=');

        parent::tearDown();
    }

    public function test_dry_run_reports_changes_without_writing(): void
    {
        $this->insertAccount('fund a legacy');
        $this->writeDocument('folder-a/2025.09.30 fund-a statement.pdf', '%PDF dry run');

        $this->artisan('finance:private-funds:reconcile', [
            '--root' => $this->root,
            '--map' => $this->mapPath,
        ])
            ->assertExitCode(0)
            ->expectsOutputToContain('Mode: dry-run')
            ->expectsOutputToContain('would_rename')
            ->expectsOutputToContain('would_import');

        $this->assertDatabaseHas('fin_accounts', [
            'acct_owner' => (string) $this->user->id,
            'acct_name' => 'fund a legacy',
        ]);
        $this->assertDatabaseMissing('fin_accounts', [
            'acct_owner' => (string) $this->user->id,
            'acct_name' => 'fund-a',
        ]);
        $this->assertDatabaseCount('fin_documents', 0);
    }

    public function test_apply_renames_accounts_creates_missing_accounts_imports_and_uploads_documents(): void
    {
        $this->insertAccount('fund a legacy');
        $this->insertAccount('fund b legacy');

        $this->writeDocument('folder-a/2025.09.30 fund-a statement.pdf', '%PDF fund-a statement');
        $this->writeDocument('folder-b/schedule k-1 - fund-b - 2024.12.31.pdf', '%PDF fund-b k1');
        $this->writeDocument('folder-c/subscription agreement - fund-c - 2025.12.02.docx', 'docx fund-c subscription');

        $this->artisan('finance:private-funds:reconcile', [
            '--root' => $this->root,
            '--map' => $this->mapPath,
            '--user' => $this->user->id,
            '--apply' => true,
        ])
            ->assertExitCode(0)
            ->expectsOutputToContain('Mode: apply')
            ->expectsOutputToContain('renamed')
            ->expectsOutputToContain('created')
            ->expectsOutputToContain('imported');

        foreach (['fund-a', 'fund-b', 'fund-c'] as $name) {
            $this->assertDatabaseHas('fin_accounts', [
                'acct_owner' => (string) $this->user->id,
                'acct_name' => $name,
            ]);
        }

        $fundAAccountId = (int) DB::table('fin_accounts')
            ->where('acct_owner', (string) $this->user->id)
            ->where('acct_name', 'fund-a')
            ->value('acct_id');

        $fundADocument = DB::table('fin_documents')
            ->where('user_id', $this->user->id)
            ->where('original_filename', '2025.09.30 fund-a statement.pdf')
            ->first();

        $this->assertNotNull($fundADocument);
        $this->assertSame('statement', $fundADocument->document_kind);
        $this->assertSame('statement', $fundADocument->document_type);
        $this->assertSame('2025-09-30', substr((string) $fundADocument->document_date, 0, 10));
        Storage::disk('s3')->assertExists($fundADocument->s3_path);

        $statement = DB::table('fin_statements')
            ->where('document_id', $fundADocument->id)
            ->where('acct_id', $fundAAccountId)
            ->first();

        $this->assertNotNull($statement);
        $this->assertSame('2025-09-30', substr((string) $statement->statement_closing_date, 0, 10));

        $fundBK1 = DB::table('fin_documents')
            ->where('user_id', $this->user->id)
            ->where('original_filename', 'schedule k-1 - fund-b - 2024.12.31.pdf')
            ->first();

        $this->assertNotNull($fundBK1);
        $this->assertSame('tax_form', $fundBK1->document_kind);
        $this->assertSame('schedule_k1', $fundBK1->document_type);
        $this->assertDatabaseHas('fin_tax_documents', [
            'document_id' => $fundBK1->id,
            'form_type' => 'k1',
            'tax_year' => 2024,
        ]);

        $fundCDoc = DB::table('fin_documents')
            ->where('user_id', $this->user->id)
            ->where('original_filename', 'subscription agreement - fund-c - 2025.12.02.docx')
            ->first();

        $this->assertNotNull($fundCDoc);
        $this->assertSame('manual', $fundCDoc->document_kind);
        $this->assertSame('subscription_agreement', $fundCDoc->document_type);
        Storage::disk('s3')->assertExists($fundCDoc->s3_path);

        $documentCount = DB::table('fin_documents')->count();
        $statementCount = DB::table('fin_statements')->count();
        $taxDocumentCount = DB::table('fin_tax_documents')->count();

        $this->artisan('finance:private-funds:reconcile', [
            '--root' => $this->root,
            '--map' => $this->mapPath,
            '--user' => $this->user->id,
            '--apply' => true,
            '--format' => 'json',
        ])->assertExitCode(0);

        $this->assertSame($documentCount, DB::table('fin_documents')->count());
        $this->assertSame($statementCount, DB::table('fin_statements')->count());
        $this->assertSame($taxDocumentCount, DB::table('fin_tax_documents')->count());
    }

    public function test_missing_map_option_fails(): void
    {
        putenv('FINANCE_PRIVATE_FUNDS_MAP=');

        $this->artisan('finance:private-funds:reconcile', [
            '--root' => $this->root,
        ])
            ->assertExitCode(1)
            ->expectsOutputToContain('Folder map is required');
    }

    public function test_invalid_filename_dates_are_left_unparsed(): void
    {
        $this->writeDocument('folder-a/2025.02.31 fund-a statement.pdf', '%PDF invalid date');

        $this->artisan('finance:private-funds:reconcile', [
            '--root' => $this->root,
            '--map' => $this->mapPath,
        ])
            ->assertExitCode(0)
            ->expectsOutputToContain('unparsed');

        $this->assertDatabaseCount('fin_documents', 0);
    }

    public function test_month_only_statement_dates_use_month_end(): void
    {
        $this->writeDocument('folder-a/2025.09 fund-a statement.pdf', '%PDF month statement');

        $this->artisan('finance:private-funds:reconcile', [
            '--root' => $this->root,
            '--map' => $this->mapPath,
            '--user' => $this->user->id,
            '--apply' => true,
        ])->assertExitCode(0);

        $document = DB::table('fin_documents')
            ->where('user_id', $this->user->id)
            ->where('original_filename', '2025.09 fund-a statement.pdf')
            ->first();

        $this->assertNotNull($document);
        $this->assertSame('2025-09-30', substr((string) $document->document_date, 0, 10));
        $this->assertSame('2025-09-30', substr((string) $document->period_end, 0, 10));

        $statement = DB::table('fin_statements')
            ->where('document_id', $document->id)
            ->first();

        $this->assertNotNull($statement);
        $this->assertSame('2025-09-30', substr((string) $statement->statement_closing_date, 0, 10));
    }

    public function test_existing_documents_refresh_derived_dates(): void
    {
        $relativePath = 'folder-b/schedule k-1 - fund-b - 2024.12.31.pdf';
        $this->writeDocument($relativePath, '%PDF existing k1');
        $hash = hash_file('sha256', $this->root.'/'.$relativePath);

        $documentId = DB::table('fin_documents')->insertGetId([
            'user_id' => $this->user->id,
            'document_kind' => 'tax_form',
            'document_type' => null,
            'document_date' => null,
            'tax_year' => null,
            'period_end' => null,
            'original_filename' => 'old.pdf',
            'stored_filename' => 'old.pdf',
            's3_path' => 'old.pdf',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1,
            'file_hash' => $hash,
            'uploaded_by_user_id' => $this->user->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->artisan('finance:private-funds:reconcile', [
            '--root' => $this->root,
            '--map' => $this->mapPath,
            '--user' => $this->user->id,
            '--apply' => true,
        ])->assertExitCode(0);

        $document = DB::table('fin_documents')->where('id', $documentId)->first();

        $this->assertSame('schedule_k1', $document->document_type);
        $this->assertSame('2024-12-31', substr((string) $document->document_date, 0, 10));
        $this->assertSame(2024, (int) $document->tax_year);
        $this->assertSame('2024-12-31', substr((string) $document->period_end, 0, 10));
    }

    private function insertAccount(string $name): void
    {
        DB::table('fin_accounts')->insert([
            'acct_owner' => (string) $this->user->id,
            'acct_name' => $name,
            'acct_last_balance' => '0',
            'acct_sort_order' => 0,
            'acct_is_debt' => 0,
            'acct_is_retirement' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function writeDocument(string $relativePath, string $contents): void
    {
        $path = $this->root.'/'.$relativePath;
        File::ensureDirectoryExists(dirname($path));
        File::put($path, $contents);
    }

    /**
     * Generic folder-to-account map used to drive the command in tests. Real
     * fund/account names never live in the repo; see confidential-no-fund-names.
     *
     * @return array<string, array{account: string, aliases: list<string>, date_prefixed?: bool}>
     */
    private function folderMap(): array
    {
        return [
            'folder-a' => [
                'account' => 'fund-a',
                'aliases' => ['fund-a', 'fund a legacy'],
                'date_prefixed' => true,
            ],
            'folder-b' => [
                'account' => 'fund-b',
                'aliases' => ['fund-b', 'fund b legacy'],
            ],
            'folder-c' => [
                'account' => 'fund-c',
                'aliases' => ['fund-c'],
            ],
        ];
    }
}
