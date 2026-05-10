<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class FinLotReconciliationSchemaTest extends TestCase
{
    public function test_source_migration_round_trips_and_backfills_existing_lots(): void
    {
        $migration = require database_path('migrations/2026_05_10_200602_add_source_to_fin_account_lots_table.php');

        $migration->down();
        $this->assertFalse(Schema::hasColumn('fin_account_lots', 'source'));

        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $taxDocument = $this->makeTaxDocument($user->id);
        $brokerLot = $this->makeLot($account, [
            'tax_document_id' => $taxDocument->id,
            'lot_source' => '1099b',
        ]);
        $accountLot = $this->makeLot($account, [
            'symbol' => 'MSFT',
            'tax_document_id' => null,
            'lot_source' => 'analyzer',
        ]);

        $migration->up();

        $this->assertTrue(Schema::hasColumn('fin_account_lots', 'source'));
        $this->assertTrue(Schema::hasIndex('fin_account_lots', 'fin_account_lots_source_idx'));
        $this->assertSame(
            FinAccountLot::SOURCE_BROKER_1099B,
            DB::table('fin_account_lots')->where('lot_id', $brokerLot->lot_id)->value('source'),
        );
        $this->assertSame(
            FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            DB::table('fin_account_lots')->where('lot_id', $accountLot->lot_id)->value('source'),
        );

        $migration->down();
        $this->assertFalse(Schema::hasColumn('fin_account_lots', 'source'));

        $migration->up();
        $this->assertTrue(Schema::hasColumn('fin_account_lots', 'source'));
    }

    public function test_reconciliation_link_migration_round_trips_on_sqlite(): void
    {
        $migration = require database_path('migrations/2026_05_10_200602_create_fin_lot_reconciliation_links_table.php');

        $migration->down();
        $this->assertFalse(Schema::hasTable('fin_lot_reconciliation_links'));

        $migration->up();

        $this->assertTrue(Schema::hasTable('fin_lot_reconciliation_links'));
        $this->assertTrue(Schema::hasColumn('fin_lot_reconciliation_links', 'tax_document_id'));
        $this->assertTrue(Schema::hasColumn('fin_lot_reconciliation_links', 'broker_lot_id'));
        $this->assertTrue(Schema::hasColumn('fin_lot_reconciliation_links', 'account_lot_id'));
        $this->assertTrue(Schema::hasColumn('fin_lot_reconciliation_links', 'match_reason'));
        $this->assertTrue(Schema::hasIndex('fin_lot_reconciliation_links', 'fin_lot_recon_lot_pair_unique'));
    }

    public function test_model_constants_and_source_scope_cover_schema_values(): void
    {
        $this->assertSame([
            'broker_1099b',
            'account_derived',
            'manual',
            'synthetic_adjustment',
        ], FinAccountLot::SOURCE_VALUES);
        $this->assertSame([
            'auto_matched',
            'needs_review',
            'accepted_broker',
            'accepted_account_override',
            'ignored_duplicate',
            'unlinked',
            'broker_only',
            'account_only',
        ], FinLotReconciliationLink::STATES);

        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $taxDocument = $this->makeTaxDocument($user->id);
        $brokerLot = $this->makeLot($account, [
            'tax_document_id' => $taxDocument->id,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
        ]);
        $this->makeLot($account, [
            'symbol' => 'MSFT',
            'source' => FinAccountLot::SOURCE_MANUAL,
        ]);

        $this->assertSame(
            [$brokerLot->lot_id],
            FinAccountLot::whereSource(FinAccountLot::SOURCE_BROKER_1099B)->pluck('lot_id')->all(),
        );
    }

    public function test_reconciliation_link_factory_and_relationships_work(): void
    {
        $link = FinLotReconciliationLink::factory()->create();

        $loaded = FinLotReconciliationLink::with([
            'taxDocument',
            'brokerLot',
            'accountLot',
            'acceptedByUser',
        ])->findOrFail($link->id);

        $this->assertInstanceOf(FileForTaxDocument::class, $loaded->taxDocument);
        $this->assertInstanceOf(FinAccountLot::class, $loaded->brokerLot);
        $this->assertInstanceOf(FinAccountLot::class, $loaded->accountLot);
        $this->assertInstanceOf(User::class, $loaded->acceptedByUser);
        $this->assertSame('factory_fixture', $loaded->match_reason['reason_code']);
    }

    public function test_lot_pair_unique_constraint_is_enforced(): void
    {
        $link = FinLotReconciliationLink::factory()->create();

        $this->expectException(QueryException::class);

        FinLotReconciliationLink::create([
            'tax_document_id' => $link->tax_document_id,
            'broker_lot_id' => $link->broker_lot_id,
            'account_lot_id' => $link->account_lot_id,
            'state' => FinLotReconciliationLink::STATE_AUTO_MATCHED,
            'match_reason' => $link->match_reason,
            'accepted_by_user_id' => $link->accepted_by_user_id,
            'accepted_at' => now(),
        ]);
    }

    public function test_reconciliation_status_cache_mirrors_latest_link_state_invariant(): void
    {
        $link = FinLotReconciliationLink::factory()->create([
            'state' => FinLotReconciliationLink::STATE_ACCEPTED_BROKER,
        ]);

        $brokerLot = $link->brokerLot;
        $brokerLot->update([
            'reconciliation_status' => $link->state,
        ]);

        $latestLink = FinLotReconciliationLink::where('broker_lot_id', $brokerLot->lot_id)
            ->latest('id')
            ->firstOrFail();

        $this->assertContains($latestLink->state, FinLotReconciliationLink::STATES);
        $this->assertSame($latestLink->state, $brokerLot->fresh()->reconciliation_status);
    }

    private function makeAccount(int $userId): FinAccounts
    {
        return FinAccounts::withoutEvents(function () use ($userId): FinAccounts {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $userId,
                'acct_name' => 'Brokerage',
                'acct_last_balance' => '0',
            ]);
        });
    }

    private function makeTaxDocument(int $userId): FileForTaxDocument
    {
        return FileForTaxDocument::create([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => 'broker-1099.pdf',
            'stored_filename' => 'broker-1099.pdf',
            's3_path' => "tax_docs/{$userId}/broker-1099.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => str_repeat('a', 64),
            'uploaded_by_user_id' => $userId,
            'is_reviewed' => true,
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
            'lot_source' => 'analyzer',
        ], $overrides));
    }
}
