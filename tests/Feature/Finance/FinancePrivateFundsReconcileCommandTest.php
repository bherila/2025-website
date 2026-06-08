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

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('s3');
        $this->user = User::factory()->create();
        putenv("FINANCE_CLI_USER_ID={$this->user->id}");
        $this->root = storage_path('framework/testing/private-funds-'.uniqid());

        foreach ($this->folders() as $folder) {
            File::ensureDirectoryExists($this->root.'/'.$folder);
        }
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->root);
        putenv('FINANCE_CLI_USER_ID=');

        parent::tearDown();
    }

    public function test_dry_run_reports_changes_without_writing(): void
    {
        $this->insertAccount('delphi plus');
        $this->writeDocument('aqr/2025.09.30 aqr statement.pdf', '%PDF dry run');

        $this->artisan('finance:private-funds:reconcile', [
            '--root' => $this->root,
        ])
            ->assertExitCode(0)
            ->expectsOutputToContain('Mode: dry-run')
            ->expectsOutputToContain('would_rename')
            ->expectsOutputToContain('would_import');

        $this->assertDatabaseHas('fin_accounts', [
            'acct_owner' => (string) $this->user->id,
            'acct_name' => 'delphi plus',
        ]);
        $this->assertDatabaseMissing('fin_accounts', [
            'acct_owner' => (string) $this->user->id,
            'acct_name' => 'aqr',
        ]);
        $this->assertDatabaseCount('fin_documents', 0);
    }

    public function test_apply_renames_accounts_creates_missing_accounts_imports_and_uploads_documents(): void
    {
        $this->insertAccount('delphi plus');
        $this->insertAccount('tau ventures ca');
        $this->insertAccount('pioneer fund af 24');
        $this->insertAccount('pioneer fund af 25');

        $this->writeDocument('aqr/2025.09.30 aqr statement.pdf', '%PDF aqr statement');
        $this->writeDocument('tau/schedule k-1 - tau - 2024.12.31.pdf', '%PDF tau k1');
        $this->writeDocument('pioneer prime (not countersigned)/subscription agreement - pioneer prime - 2025.12.02.docx', 'docx prime subscription');

        $this->artisan('finance:private-funds:reconcile', [
            '--root' => $this->root,
            '--user' => $this->user->id,
            '--apply' => true,
        ])
            ->assertExitCode(0)
            ->expectsOutputToContain('Mode: apply')
            ->expectsOutputToContain('renamed')
            ->expectsOutputToContain('created')
            ->expectsOutputToContain('imported');

        foreach (['aqr', 'tau', 'pioneer af24', 'pioneer af25', 'pioneer af26', 'pioneer iv', 'pioneer prime'] as $name) {
            $this->assertDatabaseHas('fin_accounts', [
                'acct_owner' => (string) $this->user->id,
                'acct_name' => $name,
            ]);
        }

        $aqrAccountId = (int) DB::table('fin_accounts')
            ->where('acct_owner', (string) $this->user->id)
            ->where('acct_name', 'aqr')
            ->value('acct_id');

        $aqrDocument = DB::table('fin_documents')
            ->where('user_id', $this->user->id)
            ->where('original_filename', '2025.09.30 aqr statement.pdf')
            ->first();

        $this->assertNotNull($aqrDocument);
        $this->assertSame('statement', $aqrDocument->document_kind);
        $this->assertSame('statement', $aqrDocument->document_type);
        $this->assertSame('2025-09-30', substr((string) $aqrDocument->document_date, 0, 10));
        Storage::disk('s3')->assertExists($aqrDocument->s3_path);

        $statement = DB::table('fin_statements')
            ->where('document_id', $aqrDocument->id)
            ->where('acct_id', $aqrAccountId)
            ->first();

        $this->assertNotNull($statement);
        $this->assertSame('2025-09-30', substr((string) $statement->statement_closing_date, 0, 10));

        $tauK1 = DB::table('fin_documents')
            ->where('user_id', $this->user->id)
            ->where('original_filename', 'schedule k-1 - tau - 2024.12.31.pdf')
            ->first();

        $this->assertNotNull($tauK1);
        $this->assertSame('tax_form', $tauK1->document_kind);
        $this->assertSame('schedule_k1', $tauK1->document_type);
        $this->assertDatabaseHas('fin_tax_documents', [
            'document_id' => $tauK1->id,
            'form_type' => 'k1',
            'tax_year' => 2024,
        ]);

        $primeDoc = DB::table('fin_documents')
            ->where('user_id', $this->user->id)
            ->where('original_filename', 'subscription agreement - pioneer prime - 2025.12.02.docx')
            ->first();

        $this->assertNotNull($primeDoc);
        $this->assertSame('manual', $primeDoc->document_kind);
        $this->assertSame('subscription_agreement', $primeDoc->document_type);
        Storage::disk('s3')->assertExists($primeDoc->s3_path);

        $documentCount = DB::table('fin_documents')->count();
        $statementCount = DB::table('fin_statements')->count();
        $taxDocumentCount = DB::table('fin_tax_documents')->count();

        $this->artisan('finance:private-funds:reconcile', [
            '--root' => $this->root,
            '--user' => $this->user->id,
            '--apply' => true,
            '--format' => 'json',
        ])->assertExitCode(0);

        $this->assertSame($documentCount, DB::table('fin_documents')->count());
        $this->assertSame($statementCount, DB::table('fin_statements')->count());
        $this->assertSame($taxDocumentCount, DB::table('fin_tax_documents')->count());
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

    /** @return list<string> */
    private function folders(): array
    {
        return [
            'aqr',
            'tau',
            'pioneer af24',
            'pioneer af25',
            'pioneer af26',
            'pioneer iv (not countersigned)',
            'pioneer prime (not countersigned)',
        ];
    }
}
