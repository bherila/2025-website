<?php

namespace Tests\Unit\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\CapitalGains\LotMatcherService;
use App\Services\Finance\DocumentIngestionService;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class LotMatcherServiceTest extends TestCase
{
    public function test_exact_match_persists_auto_matched_link(): void
    {
        [$document, $account] = $this->documentAndAccount();
        $brokerLot = $this->makeBrokerLot($account, $document);
        $accountLot = $this->makeAccountLot($account);

        $result = app(LotMatcherService::class)->runMatcherForDocument((int) $document->document_id);

        $this->assertSame(1, $result->counts[FinLotReconciliationLink::STATE_AUTO_MATCHED]);
        $this->assertDatabaseHas('fin_lot_reconciliation_links', [
            'document_id' => $document->document_id,
            'broker_lot_id' => $brokerLot->lot_id,
            'account_lot_id' => $accountLot->lot_id,
            'state' => FinLotReconciliationLink::STATE_AUTO_MATCHED,
        ]);
        $this->assertSame(FinLotReconciliationLink::STATE_AUTO_MATCHED, $brokerLot->fresh()->reconciliation_status);
        $this->assertSame(FinLotReconciliationLink::STATE_AUTO_MATCHED, $accountLot->fresh()->reconciliation_status);
    }

    public function test_fuzzy_amounts_match_records_delta(): void
    {
        [$document, $account] = $this->documentAndAccount();
        $this->makeBrokerLot($account, $document);
        $this->makeAccountLot($account, [
            'proceeds' => 1250.01,
            'cost_basis' => 900,
        ]);
        $this->makeAccountLot($account, [
            'proceeds' => 1250.01,
            'cost_basis' => 1000.01,
        ]);

        app(LotMatcherService::class)->runMatcherForDocument((int) $document->id);

        $link = FinLotReconciliationLink::query()->firstOrFail();
        $this->assertSame(FinLotReconciliationLink::STATE_AUTO_MATCHED, $link->state);
        $this->assertSame('fuzzy_amounts', $link->match_reason['reason_code']);
        $this->assertSame(0.01, round((float) $link->match_reason['deltas']['proceeds'], 2));
    }

    public function test_treatment_mismatch_does_not_auto_match(): void
    {
        [$document, $account] = $this->documentAndAccount();
        $this->makeBrokerLot($account, $document, [
            'form_8949_box' => 'A',
            'is_short_term' => true,
        ]);
        $this->makeAccountLot($account, [
            'form_8949_box' => 'D',
            'is_short_term' => false,
        ]);

        $result = app(LotMatcherService::class)->runMatcherForDocument((int) $document->id);

        $this->assertSame(0, $result->counts[FinLotReconciliationLink::STATE_AUTO_MATCHED]);
        $this->assertSame(1, $result->counts[FinLotReconciliationLink::STATE_BROKER_ONLY]);
        $this->assertSame(1, $result->counts[FinLotReconciliationLink::STATE_ACCOUNT_ONLY]);
    }

    public function test_treatment_match_required_for_fuzzy_amounts(): void
    {
        [$document, $account] = $this->documentAndAccount();
        $this->makeBrokerLot($account, $document, [
            'form_8949_box' => 'A',
            'is_short_term' => true,
        ]);
        $this->makeAccountLot($account, [
            'proceeds' => 1250.01,
            'cost_basis' => 1000.01,
            'form_8949_box' => 'D',
            'is_short_term' => false,
        ]);

        $result = app(LotMatcherService::class)->runMatcherForDocument((int) $document->id);

        $this->assertSame(0, $result->counts[FinLotReconciliationLink::STATE_AUTO_MATCHED]);
        $this->assertSame(1, $result->counts[FinLotReconciliationLink::STATE_BROKER_ONLY]);
        $this->assertSame(1, $result->counts[FinLotReconciliationLink::STATE_ACCOUNT_ONLY]);
    }

    public function test_treatment_match_required_for_date_delta(): void
    {
        [$document, $account] = $this->documentAndAccount();
        $this->makeBrokerLot($account, $document, [
            'sale_date' => '2025-02-07',
            'form_8949_box' => 'A',
            'is_short_term' => true,
        ]);
        $this->makeAccountLot($account, [
            'sale_date' => '2025-02-10',
            'form_8949_box' => 'D',
            'is_short_term' => false,
        ]);

        $result = app(LotMatcherService::class)->runMatcherForDocument((int) $document->id);

        $this->assertSame(0, $result->counts[FinLotReconciliationLink::STATE_AUTO_MATCHED]);
        $this->assertSame(1, $result->counts[FinLotReconciliationLink::STATE_BROKER_ONLY]);
        $this->assertSame(1, $result->counts[FinLotReconciliationLink::STATE_ACCOUNT_ONLY]);
    }

    public function test_date_delta_matches_one_weekday_apart(): void
    {
        [$document, $account] = $this->documentAndAccount();
        $this->makeBrokerLot($account, $document, ['sale_date' => '2025-02-07']);
        $this->makeAccountLot($account, ['sale_date' => '2025-02-10']);

        app(LotMatcherService::class)->runMatcherForDocument((int) $document->id);

        $link = FinLotReconciliationLink::query()->firstOrFail();
        $this->assertSame(FinLotReconciliationLink::STATE_AUTO_MATCHED, $link->state);
        $this->assertSame('date_delta', $link->match_reason['reason_code']);
        $this->assertSame(3, $link->match_reason['deltas']['date_days']);
    }

    public function test_date_delta_can_see_account_lots_just_outside_tax_year(): void
    {
        [$document, $account] = $this->documentAndAccount();
        $this->makeBrokerLot($account, $document, ['sale_date' => '2025-01-01']);
        $this->makeAccountLot($account, ['sale_date' => '2024-12-31']);

        app(LotMatcherService::class)->runMatcherForDocument((int) $document->id);

        $link = FinLotReconciliationLink::query()->firstOrFail();
        $this->assertSame(FinLotReconciliationLink::STATE_AUTO_MATCHED, $link->state);
        $this->assertSame('date_delta', $link->match_reason['reason_code']);
    }

    public function test_split_broker_matches_one_broker_lot_to_multiple_account_lots(): void
    {
        [$document, $account] = $this->documentAndAccount();
        $brokerLot = $this->makeBrokerLot($account, $document, [
            'quantity' => 100,
            'proceeds' => 1000,
            'cost_basis' => 600,
        ]);
        $firstAccountLot = $this->makeAccountLot($account, [
            'quantity' => 60,
            'proceeds' => 600,
            'cost_basis' => 360,
        ]);
        $secondAccountLot = $this->makeAccountLot($account, [
            'quantity' => 40,
            'proceeds' => 400,
            'cost_basis' => 240,
        ]);

        app(LotMatcherService::class)->runMatcherForDocument((int) $document->id);

        $this->assertSame(2, FinLotReconciliationLink::query()->count());
        foreach ([$firstAccountLot, $secondAccountLot] as $accountLot) {
            $this->assertDatabaseHas('fin_lot_reconciliation_links', [
                'broker_lot_id' => $brokerLot->lot_id,
                'account_lot_id' => $accountLot->lot_id,
                'state' => FinLotReconciliationLink::STATE_AUTO_MATCHED,
            ]);
        }
        $this->assertSame(['split_broker'], FinLotReconciliationLink::query()->get()->pluck('match_reason.reason_code')->unique()->values()->all());
    }

    public function test_split_account_matches_multiple_broker_lots_to_one_account_lot(): void
    {
        [$document, $account] = $this->documentAndAccount();
        $firstBrokerLot = $this->makeBrokerLot($account, $document, [
            'quantity' => 60,
            'proceeds' => 600,
            'cost_basis' => 360,
        ]);
        $secondBrokerLot = $this->makeBrokerLot($account, $document, [
            'quantity' => 40,
            'proceeds' => 400,
            'cost_basis' => 240,
        ]);
        $accountLot = $this->makeAccountLot($account, [
            'quantity' => 100,
            'proceeds' => 1000,
            'cost_basis' => 600,
        ]);

        app(LotMatcherService::class)->runMatcherForDocument((int) $document->id);

        $this->assertSame(2, FinLotReconciliationLink::query()->count());
        foreach ([$firstBrokerLot, $secondBrokerLot] as $brokerLot) {
            $this->assertDatabaseHas('fin_lot_reconciliation_links', [
                'broker_lot_id' => $brokerLot->lot_id,
                'account_lot_id' => $accountLot->lot_id,
                'state' => FinLotReconciliationLink::STATE_AUTO_MATCHED,
            ]);
        }
        $this->assertSame(['split_account'], FinLotReconciliationLink::query()->get()->pluck('match_reason.reason_code')->unique()->values()->all());
    }

    public function test_leftover_lots_become_broker_only_and_account_only(): void
    {
        [$document, $account] = $this->documentAndAccount();
        $brokerLot = $this->makeBrokerLot($account, $document, ['symbol' => 'MSFT']);
        $accountLot = $this->makeAccountLot($account, ['symbol' => 'AAPL']);

        $result = app(LotMatcherService::class)->runMatcherForDocument((int) $document->id);

        $this->assertSame(1, $result->counts[FinLotReconciliationLink::STATE_BROKER_ONLY]);
        $this->assertSame(1, $result->counts[FinLotReconciliationLink::STATE_ACCOUNT_ONLY]);
        $this->assertDatabaseHas('fin_lot_reconciliation_links', [
            'broker_lot_id' => $brokerLot->lot_id,
            'account_lot_id' => null,
            'state' => FinLotReconciliationLink::STATE_BROKER_ONLY,
        ]);
        $this->assertDatabaseHas('fin_lot_reconciliation_links', [
            'broker_lot_id' => null,
            'account_lot_id' => $accountLot->lot_id,
            'state' => FinLotReconciliationLink::STATE_ACCOUNT_ONLY,
        ]);
    }

    public function test_statement_position_lots_for_document_are_not_matched_as_broker_lots(): void
    {
        [$document, $account] = $this->documentAndAccount();
        $this->makeBrokerLot($account, $document);
        $this->makeAccountLot($account);
        $this->makeLot($account, [
            'document_id' => $document->document_id,
            'lot_origin' => FinAccountLot::ORIGIN_STATEMENT_POSITION,
            'lot_source' => 'import',
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            'sale_date' => null,
            'proceeds' => null,
        ]);

        $result = app(LotMatcherService::class)->runMatcherForDocument((int) $document->id);

        $this->assertSame(1, $result->counts[FinLotReconciliationLink::STATE_AUTO_MATCHED]);
        $this->assertSame(0, $result->counts[FinLotReconciliationLink::STATE_BROKER_ONLY]);
        $this->assertSame(0, $result->counts[FinLotReconciliationLink::STATE_ACCOUNT_ONLY]);
        $this->assertSame(1, FinLotReconciliationLink::query()->count());
    }

    public function test_matcher_is_idempotent_without_link_churn(): void
    {
        [$document, $account] = $this->documentAndAccount();
        $this->makeBrokerLot($account, $document);
        $this->makeAccountLot($account);

        app(LotMatcherService::class)->runMatcherForDocument((int) $document->id);
        $firstRows = $this->linkRows();
        app(LotMatcherService::class)->runMatcherForDocument((int) $document->id);

        $this->assertSame($firstRows, $this->linkRows());
    }

    public function test_last_matched_at_advances_without_link_churn(): void
    {
        [$document, $account] = $this->documentAndAccount();
        $this->makeBrokerLot($account, $document);
        $this->makeAccountLot($account);
        $service = app(LotMatcherService::class);

        Carbon::setTestNow(Carbon::parse('2026-05-10 10:00:00'));
        $service->runMatcherForDocument((int) $document->id);
        $firstMatchedAt = $service->lastMatchedAtForDocument((int) $document->id);
        $firstRows = $this->linkRows();

        Carbon::setTestNow(Carbon::parse('2026-05-10 10:05:00'));
        $service->runMatcherForDocument((int) $document->id);
        $secondMatchedAt = $service->lastMatchedAtForDocument((int) $document->id);
        Carbon::setTestNow();

        $this->assertNotNull($firstMatchedAt);
        $this->assertNotNull($secondMatchedAt);
        $this->assertTrue(Carbon::parse($secondMatchedAt)->greaterThan(Carbon::parse($firstMatchedAt)));
        $this->assertSame($firstRows, $this->linkRows());
    }

    public function test_preview_preserves_accepted_decisions_by_default(): void
    {
        [$document, $account] = $this->documentAndAccount();
        $this->makeBrokerLot($account, $document);
        $this->makeAccountLot($account);
        $service = app(LotMatcherService::class);
        $service->runMatcherForDocument((int) $document->id);
        $link = FinLotReconciliationLink::query()->firstOrFail();
        $service->acceptBrokerLink((int) $link->id, $this->createUser()->id);

        $preservedPreview = $service->previewMatcherForDocument((int) $document->id);
        $rebuildPreview = $service->previewMatcherForDocument((int) $document->id, preserveDecisions: false);

        $this->assertSame(0, $preservedPreview->counts[FinLotReconciliationLink::STATE_AUTO_MATCHED]);
        $this->assertSame([], $preservedPreview->proposals);
        $this->assertSame(1, $rebuildPreview->counts[FinLotReconciliationLink::STATE_AUTO_MATCHED]);
    }

    public function test_preserve_decisions_keeps_accepted_links_on_rerun(): void
    {
        [$document, $account] = $this->documentAndAccount();
        $this->makeBrokerLot($account, $document);
        $this->makeAccountLot($account);
        $service = app(LotMatcherService::class);
        $service->runMatcherForDocument((int) $document->id);
        $link = FinLotReconciliationLink::query()->firstOrFail();

        $service->acceptBrokerLink((int) $link->id, $this->createUser()->id);
        $service->runMatcherForDocument((int) $document->id);

        $this->assertSame(1, FinLotReconciliationLink::query()->count());
        $this->assertSame(FinLotReconciliationLink::STATE_ACCEPTED_BROKER, $link->fresh()->state);
    }

    public function test_mutable_auto_match_is_reevaluated_to_needs_review_when_lot_changes(): void
    {
        [$document, $account] = $this->documentAndAccount();
        $this->makeBrokerLot($account, $document);
        $accountLot = $this->makeAccountLot($account);
        $service = app(LotMatcherService::class);
        $service->runMatcherForDocument((int) $document->id);
        $accountLot->update(['cost_basis' => 900]);

        $service->runMatcherForDocument((int) $document->id);

        $link = FinLotReconciliationLink::query()->firstOrFail();
        $this->assertSame(FinLotReconciliationLink::STATE_NEEDS_REVIEW, $link->state);
        $this->assertSame(-100.0, (float) $link->match_reason['deltas']['basis']);
    }

    public function test_full_rebuild_discards_preserved_decisions(): void
    {
        [$document, $account] = $this->documentAndAccount();
        $this->makeBrokerLot($account, $document);
        $this->makeAccountLot($account);
        $service = app(LotMatcherService::class);
        $service->runMatcherForDocument((int) $document->id);
        $link = FinLotReconciliationLink::query()->firstOrFail();
        $service->acceptBrokerLink((int) $link->id, $this->createUser()->id);

        $service->runMatcherForDocument((int) $document->id, preserveDecisions: false);

        $this->assertSame(1, FinLotReconciliationLink::query()->count());
        $this->assertSame(FinLotReconciliationLink::STATE_AUTO_MATCHED, FinLotReconciliationLink::query()->firstOrFail()->state);
    }

    public function test_matcher_partitions_multiple_tax_document_accounts(): void
    {
        $user = $this->createUser();
        $firstAccount = $this->makeAccount($user->id);
        $secondAccount = $this->makeAccount($user->id);
        $document = $this->makeTaxDocument($user->id);
        TaxDocumentAccount::createLink((int) $document->id, $firstAccount->acct_id, '1099_b', 2025, isReviewed: true);
        TaxDocumentAccount::createLink((int) $document->id, $secondAccount->acct_id, '1099_b', 2025, isReviewed: true);
        $firstBrokerLot = $this->makeBrokerLot($firstAccount, $document, ['symbol' => 'AAPL']);
        $secondBrokerLot = $this->makeBrokerLot($secondAccount, $document, ['symbol' => 'MSFT']);
        $firstAccountLot = $this->makeAccountLot($firstAccount, ['symbol' => 'AAPL']);
        $secondAccountLot = $this->makeAccountLot($secondAccount, ['symbol' => 'MSFT']);

        $result = app(LotMatcherService::class)->runMatcherForDocument((int) $document->id);

        $this->assertSame(2, $result->counts[FinLotReconciliationLink::STATE_AUTO_MATCHED]);
        $this->assertDatabaseHas('fin_lot_reconciliation_links', [
            'broker_lot_id' => $firstBrokerLot->lot_id,
            'account_lot_id' => $firstAccountLot->lot_id,
        ]);
        $this->assertDatabaseHas('fin_lot_reconciliation_links', [
            'broker_lot_id' => $secondBrokerLot->lot_id,
            'account_lot_id' => $secondAccountLot->lot_id,
        ]);
    }

    /**
     * @return array{FileForTaxDocument, FinAccounts}
     */
    private function documentAndAccount(): array
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeTaxDocument($user->id);

        return [$document, $account];
    }

    private function makeAccount(int $userId): FinAccounts
    {
        return FinAccounts::withoutEvents(function () use ($userId): FinAccounts {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $userId,
                'acct_name' => fake()->unique()->company(),
                'acct_number' => fake()->unique()->numerify('####'),
                'acct_last_balance' => '0',
            ]);
        });
    }

    private function makeTaxDocument(int $userId): FileForTaxDocument
    {
        return app(DocumentIngestionService::class)->createTaxFormDetail([
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
    private function makeBrokerLot(FinAccounts $account, FileForTaxDocument $document, array $overrides = []): FinAccountLot
    {
        return $this->makeLot($account, array_merge([
            'document_id' => $document->document_id,
            'lot_origin' => FinAccountLot::ORIGIN_1099B_DISPOSITION,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
        ], $overrides));
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeAccountLot(FinAccounts $account, array $overrides = []): FinAccountLot
    {
        return $this->makeLot($account, array_merge([
            'document_id' => null,
            'lot_source' => 'analyzer',
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
        ], $overrides));
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

    /**
     * @return list<array<string, mixed>>
     */
    private function linkRows(): array
    {
        return FinLotReconciliationLink::query()
            ->orderBy('id')
            ->get()
            ->map(fn (FinLotReconciliationLink $link): array => [
                'id' => (int) $link->id,
                'broker_lot_id' => $link->broker_lot_id !== null ? (int) $link->broker_lot_id : null,
                'account_lot_id' => $link->account_lot_id !== null ? (int) $link->account_lot_id : null,
                'state' => $link->state,
                'reason_code' => $link->match_reason['reason_code'] ?? null,
            ])
            ->values()
            ->all();
    }
}
