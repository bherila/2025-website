<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\LotMatchRun;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\DocumentIngestionService;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class LotMatchRunsTest extends TestCase
{
    public function test_lot_match_runs_schema_exists(): void
    {
        $this->assertTrue(Schema::hasTable('lot_match_runs'));
        $this->assertTrue(Schema::hasColumn('lot_match_runs', 'document_id'));
        $this->assertTrue(Schema::hasColumn('lot_match_runs', 'user_id'));
        $this->assertTrue(Schema::hasColumn('lot_match_runs', 'status'));
        $this->assertTrue(Schema::hasColumn('lot_match_runs', 'mode'));
        $this->assertTrue(Schema::hasColumn('lot_match_runs', 'result_summary'));
        $this->assertTrue(Schema::hasIndex('lot_match_runs', 'lmr_doc_status_idx'));
    }

    public function test_runs_endpoint_returns_recent_owned_runs_only(): void
    {
        $user = $this->createUser();
        $otherUser = $this->createUser();
        $account = $this->makeAccount($user->id);
        $otherAccount = $this->makeAccount($otherUser->id, 'Other Brokerage');
        $document = $this->makeBrokerDocument($user->id, $account);
        $otherDocument = $this->makeBrokerDocument($otherUser->id, $otherAccount);
        $run = LotMatchRun::create([
            'document_id' => $document->document_id,
            'user_id' => $user->id,
            'status' => LotMatchRun::STATUS_SUCCEEDED,
            'mode' => LotMatchRun::MODE_PRESERVE,
            'started_at' => now()->subMinute(),
            'finished_at' => now(),
            'result_summary' => ['counts' => ['auto_matched' => 1]],
        ]);
        LotMatchRun::create([
            'document_id' => $otherDocument->document_id,
            'user_id' => $otherUser->id,
            'status' => LotMatchRun::STATUS_SUCCEEDED,
            'mode' => LotMatchRun::MODE_PRESERVE,
        ]);

        $this->actingAs($user)
            ->getJson("/api/finance/tax-documents/{$document->id}/lot-match-runs")
            ->assertOk()
            ->assertJsonPath('tax_document_id', $document->id)
            ->assertJsonPath('document_id', $document->document_id)
            ->assertJsonPath('runs.0.id', $run->id)
            ->assertJsonCount(1, 'runs');

        $this->actingAs($user)
            ->getJson("/api/finance/tax-documents/{$otherDocument->id}/lot-match-runs")
            ->assertNotFound();
    }

    public function test_match_endpoints_record_runs_and_require_confirm_for_force_mode(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);
        $this->makeBrokerLot($account, $document);
        $this->makeAccountLot($account);

        $this->actingAs($user)
            ->postJson("/api/finance/tax-documents/{$document->id}/lots-match", ['preserve_decisions' => false])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('preserve_decisions');

        $this->actingAs($user)
            ->postJson("/api/finance/tax-documents/{$document->id}/lots-match")
            ->assertOk()
            ->assertJsonPath('counts.auto_matched', 1)
            ->assertJsonPath('match_run.status', LotMatchRun::STATUS_SUCCEEDED)
            ->assertJsonPath('match_run.mode', LotMatchRun::MODE_PRESERVE);

        $this->assertDatabaseHas('lot_match_runs', [
            'document_id' => $document->document_id,
            'user_id' => $user->id,
            'status' => LotMatchRun::STATUS_SUCCEEDED,
            'mode' => LotMatchRun::MODE_PRESERVE,
        ]);

        $this->actingAs($user)
            ->postJson("/api/finance/tax-documents/{$document->id}/lots-match/full-rebuild")
            ->assertUnprocessable();

        $this->actingAs($user)
            ->postJson("/api/finance/tax-documents/{$document->id}/lots-match/full-rebuild", ['confirm' => true])
            ->assertOk()
            ->assertJsonPath('match_run.status', LotMatchRun::STATUS_SUCCEEDED)
            ->assertJsonPath('match_run.mode', LotMatchRun::MODE_FORCE);
    }

    private function makeAccount(int $userId, string $name = 'Brokerage'): FinAccounts
    {
        return FinAccounts::withoutEvents(function () use ($userId, $name): FinAccounts {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $userId,
                'acct_name' => $name,
                'acct_number' => fake()->numerify('####'),
                'acct_last_balance' => '0',
            ]);
        });
    }

    private function makeBrokerDocument(int $userId, FinAccounts $account): FileForTaxDocument
    {
        $document = app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => 'broker-1099.pdf',
            'stored_filename' => fake()->uuid().'.pdf',
            's3_path' => "tax_docs/{$userId}/broker-1099.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $userId,
            'is_reviewed' => true,
        ]);

        TaxDocumentAccount::createLink((int) $document->id, $account->acct_id, '1099_b', 2025, aiIdentifier: '1234', aiAccountName: $account->acct_name);

        return $document;
    }

    private function makeBrokerLot(FinAccounts $account, FileForTaxDocument $document): FinAccountLot
    {
        return $this->makeLot($account, [
            'document_id' => $document->document_id,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
        ]);
    }

    private function makeAccountLot(FinAccounts $account): FinAccountLot
    {
        return $this->makeLot($account, [
            'document_id' => null,
            'lot_source' => 'analyzer',
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeLot(FinAccounts $account, array $overrides = []): FinAccountLot
    {
        return FinAccountLot::create(array_merge([
            'acct_id' => $account->acct_id,
            'symbol' => 'AAPL',
            'description' => 'Apple Inc.',
            'quantity' => 10,
            'purchase_date' => '2024-01-02',
            'cost_basis' => 1000,
            'cost_per_unit' => 100,
            'sale_date' => '2025-02-03',
            'proceeds' => 1250,
            'realized_gain_loss' => 250,
            'is_short_term' => false,
            'form_8949_box' => 'D',
            'wash_sale_disallowed' => 0,
        ], $overrides));
    }
}
