<?php

namespace Tests\Feature;

use App\Http\Controllers\UtilityBillTracker\UtilityBillLinkingController;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinPayslips;
use App\Models\FinanceTool\FinRsuLink;
use App\Models\FinanceTool\FinRsuVestSettlement;
use App\Models\User;
use App\Models\UtilityBillTracker\UtilityAccount;
use App\Models\UtilityBillTracker\UtilityBill;
use App\Services\Finance\Rsu\RsuVestPriceBackfillService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Access-control follow-ups to PR #961: closes gaps where finance feature
 * permissions were missing or too narrow, and where related data was exposed
 * to users lacking the appropriate read permission.
 */
class FeatureAccessFollowupTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();

        // Consume user ID 1 (always admin) so subsequent users are non-admin
        // and must pass the feature-permission gate.
        User::factory()->create(['user_role' => 'admin']);
    }

    private function makeUser(): User
    {
        return User::factory()->create(['user_role' => 'user']);
    }

    private function makeAccount(User $user): FinAccounts
    {
        return FinAccounts::withoutEvents(fn () => FinAccounts::query()->create([
            'acct_owner' => $user->id,
            'acct_name' => 'Brokerage',
            'acct_number' => '123456789',
        ]));
    }

    private function makeTransaction(FinAccounts $account, array $overrides = []): FinAccountLineItems
    {
        return FinAccountLineItems::query()->create(array_merge([
            't_account' => $account->acct_id,
            't_date' => '2026-06-01',
            't_amt' => 100.00,
            't_description' => 'SECRET PAYEE',
            't_type' => 'Buy',
            't_symbol' => 'META',
            't_qty' => 5,
            't_price' => 20.00,
        ], $overrides));
    }

    // Item 1: tax-document APIs gated by finance feature permissions.

    public function test_tax_document_read_api_requires_tax_documents_view(): void
    {
        $denied = $this->makeUser();
        $this->actingAs($denied)->getJson('/api/finance/tax-documents')->assertForbidden();

        $allowed = $this->grantFeatures($this->makeUser(), ['finance.tax-documents.view']);
        $this->actingAs($allowed)->getJson('/api/finance/tax-documents')->assertOk();
    }

    public function test_tax_document_mutation_api_requires_tax_documents_manage(): void
    {
        $viewer = $this->grantFeatures($this->makeUser(), ['finance.tax-documents.view']);
        $this->actingAs($viewer)->deleteJson('/api/finance/tax-documents/999')->assertForbidden();

        $manager = $this->grantFeatures($this->makeUser(), ['finance.tax-documents.manage']);
        // 404 (not 403) proves the gate passed; the document simply does not exist.
        $this->actingAs($manager)->deleteJson('/api/finance/tax-documents/999')->assertNotFound();
    }

    // Item 2: RSU price backfill requires manage, not view.

    public function test_rsu_backfill_vest_prices_requires_rsu_manage(): void
    {
        $viewer = $this->grantFeatures($this->makeUser(), ['finance.rsu.view']);
        $this->actingAs($viewer)->postJson('/api/rsu/backfill-vest-prices')->assertForbidden();

        $manager = $this->grantFeatures($this->makeUser(), ['finance.rsu.manage']);
        $this->actingAs($manager)->postJson('/api/rsu/backfill-vest-prices')->assertOk();
    }

    // Item 3: GenAI request-upload requires job_type.

    public function test_genai_request_upload_requires_job_type(): void
    {
        $user = $this->grantFeatures($this->makeUser(), ['finance.transactions.import']);

        $this->actingAs($user)->postJson('/api/genai/import/request-upload', [
            'filename' => 'transactions.csv',
            'content_type' => 'text/csv',
            'file_size' => 128,
        ])->assertStatus(422)->assertJsonValidationErrors(['job_type']);
    }

    public function test_genai_request_upload_without_permission_is_forbidden_even_with_job_type(): void
    {
        $user = $this->makeUser();

        $this->actingAs($user)->postJson('/api/genai/import/request-upload', [
            'filename' => 'transactions.csv',
            'content_type' => 'text/csv',
            'file_size' => 128,
            'job_type' => 'finance_transactions',
        ])->assertForbidden();
    }

    // Item 4: utility-bill link candidates redact transaction details.
    //
    // The matcher's amount filter (`whereRaw('ABS(t_amt) BETWEEN ? AND ?')`)
    // binds PHP floats which SQLite ranks above numeric values, so the matcher
    // never returns rows under the in-memory test DB (it works on MySQL). The
    // redaction itself is unit-tested directly against the mapper below so the
    // gate logic is covered deterministically; the route also enforces the
    // utility-bills.view permission.

    public function test_utility_bill_linkable_requires_utility_bills_view(): void
    {
        [$account, $bill] = $this->utilityBill($this->makeUser());

        $denied = $this->makeUser();
        $this->actingAs($denied)
            ->getJson("/api/utility-bill-tracker/accounts/{$account->id}/bills/{$bill->id}/linkable")
            ->assertForbidden();
    }

    public function test_utility_bill_linkable_redacts_transactions_without_transactions_view(): void
    {
        $controller = app(UtilityBillLinkingController::class);

        $viewer = $this->grantFeatures($this->makeUser(), ['utility-bills.view']);
        $this->actingAs($viewer);
        $redacted = $controller->mapLinkableTransaction($this->fakeLineItem(), false);
        $this->assertNull($redacted['t_description']);
        $this->assertNull($redacted['t_amt']);
        $this->assertNull($redacted['t_type']);
        $this->assertSame(42, $redacted['t_id']);

        $exposed = $controller->mapLinkableTransaction($this->fakeLineItem(), true);
        $this->assertSame('SECRET PAYEE', $exposed['t_description']);
        $this->assertSame(-150.0, $exposed['t_amt']);
    }

    private function fakeLineItem(): FinAccountLineItems
    {
        $item = new FinAccountLineItems([
            't_account' => 7,
            't_date' => '2026-06-15',
            't_description' => 'SECRET PAYEE',
            't_amt' => -150.0,
            't_type' => 'Debit',
        ]);
        $item->t_id = 42;

        return $item;
    }

    /** @return array{0: UtilityAccount, 1: UtilityBill} */
    private function utilityBill(User $user): array
    {
        $this->actingAs($user);
        $utilityAccount = UtilityAccount::create([
            'user_id' => $user->id,
            'account_name' => 'Power Co',
            'account_type' => 'General',
        ]);
        $bill = UtilityBill::query()->create([
            'utility_account_id' => $utilityAccount->id,
            'bill_start_date' => '2026-05-01',
            'bill_end_date' => '2026-06-01',
            'due_date' => '2026-06-20',
            'total_cost' => 150.00,
            'status' => 'unpaid',
        ]);

        return [$utilityAccount, $bill];
    }

    // Item 5: lot opening-transaction search redacts transaction details.

    public function test_lot_search_redacts_transactions_without_transactions_view(): void
    {
        $user = $this->grantFeatures($this->makeUser(), ['finance.lots.view']);
        $account = $this->makeAccount($user);
        $this->makeTransaction($account);

        $response = $this->actingAs($user)
            ->postJson('/api/finance/lots/search-opening', ['symbol' => 'META', 'type' => 'buy'])
            ->assertOk();

        $tx = $response->json('transactions.0');
        $this->assertNotNull($tx);
        $this->assertNull($tx['t_description']);
        $this->assertNull($tx['t_amt']);
        $this->assertNull($tx['t_type']);
        $this->assertSame('META', $tx['t_symbol']);
    }

    public function test_lot_search_exposes_transactions_with_transactions_view(): void
    {
        $user = $this->grantFeatures($this->makeUser(), ['finance.lots.view', 'finance.transactions.view']);
        $account = $this->makeAccount($user);
        $this->makeTransaction($account);

        $response = $this->actingAs($user)
            ->postJson('/api/finance/lots/search-opening', ['symbol' => 'META', 'type' => 'buy'])
            ->assertOk();

        $tx = $response->json('transactions.0');
        $this->assertNotNull($tx);
        $this->assertSame('SECRET PAYEE', $tx['t_description']);
    }

    // Item 6: RSU settlement links/candidates redact linked source data.

    public function test_rsu_settlement_candidates_redact_source_data_without_permissions(): void
    {
        $user = $this->grantFeatures($this->makeUser(), ['finance.rsu.view']);
        $settlement = $this->settlementWithCandidates($user);

        $response = $this->actingAs($user)
            ->getJson("/api/rsu/settlements/{$settlement->id}/candidates")
            ->assertOk();

        $this->assertSame([], $response->json('transactions'));
        $this->assertSame([], $response->json('payslips'));
    }

    public function test_rsu_settlement_candidates_expose_source_data_with_permissions(): void
    {
        $user = $this->grantFeatures($this->makeUser(), [
            'finance.rsu.view',
            'finance.transactions.view',
            'finance.payslips.view',
        ]);
        $settlement = $this->settlementWithCandidates($user);

        $response = $this->actingAs($user)
            ->getJson("/api/rsu/settlements/{$settlement->id}/candidates")
            ->assertOk();

        $this->assertNotEmpty($response->json('transactions'));
        $this->assertNotEmpty($response->json('payslips'));
    }

    public function test_rsu_settlement_links_redact_transaction_without_transactions_view(): void
    {
        $user = $this->grantFeatures($this->makeUser(), ['finance.rsu.view']);
        $settlement = $this->settlementWithCandidates($user);
        $account = FinAccounts::query()->where('acct_owner', $user->id)->firstOrFail();
        $transaction = FinAccountLineItems::query()->where('t_account', $account->acct_id)->firstOrFail();

        FinRsuLink::query()->create([
            'uid' => $user->id,
            'settlement_id' => $settlement->id,
            'link_type' => 'share_deposit',
            'transaction_id' => $transaction->t_id,
            'status' => 'confirmed',
        ]);

        $response = $this->actingAs($user)
            ->getJson("/api/rsu/settlements/{$settlement->id}/links")
            ->assertOk();

        $this->assertArrayNotHasKey('transaction', $response->json('0'));
    }

    private function settlementWithCandidates(User $user): FinRsuVestSettlement
    {
        $account = $this->makeAccount($user);
        $this->makeTransaction($account, [
            't_date' => '2026-06-01',
            't_symbol' => 'META',
            't_price' => 100.00,
        ]);
        $this->actingAs($user);
        FinPayslips::query()->create([
            'uid' => $user->id,
            'pay_date' => '2026-06-15',
            'earnings_rsu' => 1000,
        ]);

        return FinRsuVestSettlement::query()->create([
            'uid' => $user->id,
            'vest_date' => '2026-06-01',
            'symbol' => 'META',
            'gross_shares' => 10,
            'gross_income' => 1000,
            'vest_price' => 100.00,
            'status' => 'confirmed',
        ]);
    }

    // Item 7: lots-view users can load all-line-items without transactions.view.

    public function test_lots_view_all_line_items_redacts_transaction_detail(): void
    {
        $user = $this->grantFeatures($this->makeUser(), ['finance.lots.view']);
        $account = $this->makeAccount($user);
        // A non-security cash transaction must not reach a lots-only user at all.
        $this->makeTransaction($account, ['t_symbol' => null, 't_description' => 'PAYCHECK', 't_type' => 'Credit']);
        $this->makeTransaction($account, ['t_description' => 'SECRET PAYEE', 't_comment' => 'memo']);

        $items = $this->actingAs($user)->getJson('/api/finance/all-line-items')->assertOk()->json();

        $this->assertCount(1, $items, 'lots-only users should only receive security trade rows');
        $tx = $items[0];
        // Trade economics required by the lot/wash-sale engine are preserved.
        $this->assertSame('META', $tx['t_symbol']);
        $this->assertSame('Buy', $tx['t_type']);
        $this->assertSame(100.0, (float) $tx['t_amt']);
        // Ledger detail is redacted.
        $this->assertNull($tx['t_description']);
        $this->assertNull($tx['t_comment']);
        $this->assertArrayNotHasKey('tags', $tx);
    }

    public function test_transactions_view_all_line_items_exposes_full_detail(): void
    {
        $user = $this->grantFeatures($this->makeUser(), ['finance.transactions.view']);
        $account = $this->makeAccount($user);
        $this->makeTransaction($account, ['t_symbol' => null, 't_description' => 'PAYCHECK', 't_type' => 'Credit']);

        $items = $this->actingAs($user)->getJson('/api/finance/all-line-items')->assertOk()->json();

        $this->assertCount(1, $items);
        $this->assertSame('PAYCHECK', $items[0]['t_description']);
    }

    public function test_all_line_items_denied_without_lots_or_transactions_view(): void
    {
        $user = $this->grantFeatures($this->makeUser(), ['finance.tax-preview.view']);

        $this->actingAs($user)->getJson('/api/finance/all-line-items')->assertForbidden();
    }

    // Item 2b: the read-only lot-reconciliation health endpoint backs a widget
    // the tax-preview dashboard always mounts, so tax-preview viewers must keep
    // access to it even though the rest of the route group moved to tax-documents.

    public function test_lot_reconciliation_year_allows_tax_preview_viewer(): void
    {
        $viewer = $this->grantFeatures($this->makeUser(), ['finance.tax-preview.view']);
        $this->actingAs($viewer)->getJson('/api/finance/tax-years/2026/lot-reconciliation')->assertOk();
    }

    public function test_lot_reconciliation_year_allows_tax_documents_viewer(): void
    {
        $viewer = $this->grantFeatures($this->makeUser(), ['finance.tax-documents.view']);
        $this->actingAs($viewer)->getJson('/api/finance/tax-years/2026/lot-reconciliation')->assertOk();
    }

    public function test_lot_reconciliation_year_denied_without_either_permission(): void
    {
        $denied = $this->grantFeatures($this->makeUser(), ['finance.rsu.view']);
        $this->actingAs($denied)->getJson('/api/finance/tax-years/2026/lot-reconciliation')->assertForbidden();
    }

    // Item 2c: GET /api/rsu must not run the persisting vest-price backfill for
    // view-only users; only finance.rsu.manage triggers it.

    public function test_rsu_data_view_does_not_backfill_vest_prices(): void
    {
        $viewer = $this->grantFeatures($this->makeUser(), ['finance.rsu.view']);
        $mock = $this->mock(RsuVestPriceBackfillService::class);
        $mock->shouldNotReceive('backfillMissingVestPrices');

        $this->actingAs($viewer)->getJson('/api/rsu')->assertOk();
    }

    public function test_rsu_data_manage_runs_backfill(): void
    {
        $manager = $this->grantFeatures($this->makeUser(), ['finance.rsu.manage']);
        $mock = $this->mock(RsuVestPriceBackfillService::class);
        $mock->shouldReceive('backfillMissingVestPrices')->once();

        $this->actingAs($manager)->getJson('/api/rsu')->assertOk();
    }

    // Item 5b: utility-bill list/show responses redact linked-transaction
    // detail for users without finance.transactions.view.

    public function test_utility_bill_list_redacts_linked_transaction_without_transactions_view(): void
    {
        $user = $this->grantFeatures($this->makeUser(), ['utility-bills.view']);
        [$account, $bill] = $this->utilityBill($user);
        $txAccount = $this->makeAccount($user);
        $transaction = $this->makeTransaction($txAccount, ['t_description' => 'SECRET PAYEE', 't_amt' => 150.00]);
        $bill->update(['t_id' => $transaction->t_id]);

        $bills = $this->actingAs($user)
            ->getJson("/api/utility-bill-tracker/accounts/{$account->id}/bills")
            ->assertOk()
            ->json();

        $this->assertNotNull($bills[0]['linked_transaction']);
        $this->assertNull($bills[0]['linked_transaction']['t_description']);
        $this->assertNull($bills[0]['linked_transaction']['t_amt']);
    }

    public function test_utility_bill_list_exposes_linked_transaction_with_transactions_view(): void
    {
        $user = $this->grantFeatures($this->makeUser(), ['utility-bills.view', 'finance.transactions.view']);
        [$account, $bill] = $this->utilityBill($user);
        $txAccount = $this->makeAccount($user);
        $transaction = $this->makeTransaction($txAccount, ['t_description' => 'SECRET PAYEE', 't_amt' => 150.00]);
        $bill->update(['t_id' => $transaction->t_id]);

        $bills = $this->actingAs($user)
            ->getJson("/api/utility-bill-tracker/accounts/{$account->id}/bills")
            ->assertOk()
            ->json();

        $this->assertSame('SECRET PAYEE', $bills[0]['linked_transaction']['t_description']);
    }

    // Item 8: tag CRUD aligned with finance.rules.manage.

    public function test_tag_crud_requires_rules_manage(): void
    {
        $txManager = $this->grantFeatures($this->makeUser(), ['finance.transactions.manage']);
        $this->actingAs($txManager)->postJson('/api/finance/tags', ['tag_label' => 'Groceries', 'tag_color' => '#fff'])->assertForbidden();

        $rulesManager = $this->grantFeatures($this->makeUser(), ['finance.rules.manage']);
        $this->actingAs($rulesManager)->postJson('/api/finance/tags', ['tag_label' => 'Groceries', 'tag_color' => '#fff'])
            ->assertSuccessful();
    }
}
