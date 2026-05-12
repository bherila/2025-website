<?php

namespace Tests\Unit\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Services\Finance\CapitalGains\LotMatcherService;
use App\Services\Finance\CapitalGains\LotReconciliationStatusCacheVerifier;
use App\Services\Finance\DocumentIngestionService;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class LotMatcherServiceTransitionTest extends TestCase
{
    public function test_accept_broker_updates_link_decision_and_cache(): void
    {
        [$link, $userId] = $this->matchedLink();

        $updated = app(LotMatcherService::class)->acceptBrokerLink((int) $link->id, $userId);

        $this->assertSame(FinLotReconciliationLink::STATE_ACCEPTED_BROKER, $updated->state);
        $this->assertSame($userId, (int) $updated->accepted_by_user_id);
        $this->assertNotNull($updated->accepted_at);
        $this->assertSame(FinLotReconciliationLink::STATE_ACCEPTED_BROKER, $updated->brokerLot?->fresh()->reconciliation_status);
        $this->assertSame(FinLotReconciliationLink::STATE_ACCEPTED_BROKER, $updated->accountLot?->fresh()->reconciliation_status);
    }

    public function test_accept_account_override_sets_superseded_broker_cache(): void
    {
        [$link, $userId] = $this->matchedLink();

        $updated = app(LotMatcherService::class)->acceptAccountOverride((int) $link->id, $userId);

        $brokerLot = $updated->brokerLot?->fresh();
        $this->assertSame(FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE, $updated->state);
        $this->assertSame(FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE, $brokerLot?->reconciliation_status);
        $this->assertSame($updated->account_lot_id, $brokerLot?->superseded_by_lot_id);
    }

    public function test_mark_duplicate_updates_single_sided_link_cache(): void
    {
        [$document, $account, $userId] = $this->documentAccountAndUser();
        $brokerLot = $this->makeBrokerLot($account, $document);
        $link = FinLotReconciliationLink::create([
            'document_id' => $document->document_id,
            'broker_lot_id' => $brokerLot->lot_id,
            'account_lot_id' => null,
            'state' => FinLotReconciliationLink::STATE_BROKER_ONLY,
            'match_reason' => $this->matchReason('broker_only'),
        ]);

        $updated = app(LotMatcherService::class)->markDuplicate((int) $link->id, $userId);

        $this->assertSame(FinLotReconciliationLink::STATE_IGNORED_DUPLICATE, $updated->state);
        $this->assertNull($updated->accepted_by_user_id);
        $this->assertNull($updated->accepted_at);
        $this->assertSame(FinLotReconciliationLink::STATE_IGNORED_DUPLICATE, $brokerLot->fresh()->reconciliation_status);
    }

    public function test_unlink_clears_superseded_broker_cache(): void
    {
        [$link, $userId] = $this->matchedLink();
        $service = app(LotMatcherService::class);
        $service->acceptAccountOverride((int) $link->id, $userId);

        $updated = $service->unlinkLot((int) $link->id, $userId);

        $brokerLot = $updated->brokerLot?->fresh();
        $this->assertSame(FinLotReconciliationLink::STATE_UNLINKED, $updated->state);
        $this->assertNull($updated->accepted_by_user_id);
        $this->assertNull($updated->accepted_at);
        $this->assertSame(FinLotReconciliationLink::STATE_UNLINKED, $brokerLot?->reconciliation_status);
        $this->assertNull($brokerLot?->superseded_by_lot_id);
    }

    public function test_relink_replaces_existing_link_and_displaces_old_account_lot(): void
    {
        [$document, $account, $userId] = $this->documentAccountAndUser();
        $brokerLot = $this->makeBrokerLot($account, $document);
        $oldAccountLot = $this->makeAccountLot($account);
        $newAccountLot = $this->makeAccountLot($account);
        FinLotReconciliationLink::create([
            'document_id' => $document->document_id,
            'broker_lot_id' => $brokerLot->lot_id,
            'account_lot_id' => $oldAccountLot->lot_id,
            'state' => FinLotReconciliationLink::STATE_AUTO_MATCHED,
            'match_reason' => $this->matchReason('exact'),
        ]);

        $link = app(LotMatcherService::class)->relinkLot((int) $brokerLot->lot_id, (int) $newAccountLot->lot_id, $userId);

        $this->assertSame(FinLotReconciliationLink::STATE_AUTO_MATCHED, $link->state);
        $this->assertNull($brokerLot->fresh()->superseded_by_lot_id);
        $this->assertDatabaseHas('fin_lot_reconciliation_links', [
            'broker_lot_id' => null,
            'account_lot_id' => $oldAccountLot->lot_id,
            'state' => FinLotReconciliationLink::STATE_ACCOUNT_ONLY,
        ]);
    }

    public function test_relink_displaces_broker_lot_already_linked_to_new_account_lot(): void
    {
        [$document, $account, $userId] = $this->documentAccountAndUser();
        $targetBrokerLot = $this->makeBrokerLot($account, $document);
        $displacedBrokerLot = $this->makeBrokerLot($account, $document);
        $targetOldAccountLot = $this->makeAccountLot($account);
        $newAccountLot = $this->makeAccountLot($account);
        FinLotReconciliationLink::create([
            'document_id' => $document->document_id,
            'broker_lot_id' => $targetBrokerLot->lot_id,
            'account_lot_id' => $targetOldAccountLot->lot_id,
            'state' => FinLotReconciliationLink::STATE_AUTO_MATCHED,
            'match_reason' => $this->matchReason('exact'),
        ]);
        FinLotReconciliationLink::create([
            'document_id' => $document->document_id,
            'broker_lot_id' => $displacedBrokerLot->lot_id,
            'account_lot_id' => $newAccountLot->lot_id,
            'state' => FinLotReconciliationLink::STATE_AUTO_MATCHED,
            'match_reason' => $this->matchReason('exact'),
        ]);

        app(LotMatcherService::class)->relinkLot((int) $targetBrokerLot->lot_id, (int) $newAccountLot->lot_id, $userId);

        $this->assertDatabaseHas('fin_lot_reconciliation_links', [
            'broker_lot_id' => $displacedBrokerLot->lot_id,
            'account_lot_id' => null,
            'state' => FinLotReconciliationLink::STATE_BROKER_ONLY,
        ]);
    }

    public function test_invalid_transition_guards_reject_unsafe_state_changes(): void
    {
        [$document, $account, $userId] = $this->documentAccountAndUser();
        $brokerLot = $this->makeBrokerLot($account, $document);
        $accountLot = $this->makeAccountLot($account);
        $brokerOnly = FinLotReconciliationLink::create([
            'document_id' => $document->document_id,
            'broker_lot_id' => $brokerLot->lot_id,
            'account_lot_id' => null,
            'state' => FinLotReconciliationLink::STATE_BROKER_ONLY,
            'match_reason' => $this->matchReason('broker_only'),
        ]);
        $matched = FinLotReconciliationLink::create([
            'document_id' => $document->document_id,
            'broker_lot_id' => $brokerLot->lot_id,
            'account_lot_id' => $accountLot->lot_id,
            'state' => FinLotReconciliationLink::STATE_AUTO_MATCHED,
            'match_reason' => $this->matchReason('exact'),
        ]);

        try {
            app(LotMatcherService::class)->acceptBrokerLink((int) $brokerOnly->id, $userId);
            $this->fail('Expected acceptBrokerLink to reject a broker_only link.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('state', $exception->errors());
        }

        try {
            app(LotMatcherService::class)->markDuplicate((int) $matched->id, $userId);
            $this->fail('Expected markDuplicate to reject a matched link.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('state', $exception->errors());
        }
    }

    public function test_cache_refresh_and_verifier_agree_for_document_scoped_account_lot_links(): void
    {
        [$firstDocument, $account, $userId] = $this->documentAccountAndUser();
        $secondDocument = app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => 'broker-1099-b.pdf',
            'stored_filename' => 'broker-1099-b.pdf',
            's3_path' => "tax_docs/{$userId}/broker-1099-b.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => str_repeat('b', 64),
            'uploaded_by_user_id' => $userId,
            'is_reviewed' => true,
        ]);
        $sharedAccountLot = $this->makeAccountLot($account);
        $firstBrokerLot = $this->makeBrokerLot($account, $firstDocument);
        $secondBrokerLot = $this->makeBrokerLot($account, $secondDocument);
        $firstLink = FinLotReconciliationLink::create([
            'document_id' => $firstDocument->document_id,
            'broker_lot_id' => $firstBrokerLot->lot_id,
            'account_lot_id' => $sharedAccountLot->lot_id,
            'state' => FinLotReconciliationLink::STATE_AUTO_MATCHED,
            'match_reason' => $this->matchReason('exact'),
        ]);
        $secondLink = FinLotReconciliationLink::create([
            'document_id' => $secondDocument->document_id,
            'broker_lot_id' => $secondBrokerLot->lot_id,
            'account_lot_id' => $sharedAccountLot->lot_id,
            'state' => FinLotReconciliationLink::STATE_AUTO_MATCHED,
            'match_reason' => $this->matchReason('exact'),
        ]);
        $service = app(LotMatcherService::class);
        $service->acceptBrokerLink((int) $firstLink->id, $userId);

        $service->acceptAccountOverride((int) $secondLink->id, $userId);

        $this->assertSame(FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE, $sharedAccountLot->fresh()->reconciliation_status);
        $this->assertSame([], app(LotReconciliationStatusCacheVerifier::class)->auditDocument((int) $secondDocument->document_id));
    }

    public function test_cache_verifier_reports_status_and_superseded_mismatches(): void
    {
        [$link] = $this->matchedLink();
        app(LotMatcherService::class)->acceptAccountOverride((int) $link->id, $this->createUser()->id);
        $brokerLot = $link->brokerLot?->fresh();
        $brokerLot?->update([
            'reconciliation_status' => 'wrong',
            'superseded_by_lot_id' => null,
        ]);

        $findings = app(LotReconciliationStatusCacheVerifier::class)->auditDocument((int) $link->document_id);

        $this->assertCount(2, $findings);
        $this->assertStringContainsString('reconciliation_status cache is wrong', $findings[0]);
        $this->assertStringContainsString('superseded_by_lot_id cache is null', $findings[1]);
    }

    /**
     * @return array{FinLotReconciliationLink, int}
     */
    private function matchedLink(): array
    {
        [$document, $account, $userId] = $this->documentAccountAndUser();
        $brokerLot = $this->makeBrokerLot($account, $document);
        $accountLot = $this->makeAccountLot($account);
        $link = FinLotReconciliationLink::create([
            'document_id' => $document->document_id,
            'broker_lot_id' => $brokerLot->lot_id,
            'account_lot_id' => $accountLot->lot_id,
            'state' => FinLotReconciliationLink::STATE_AUTO_MATCHED,
            'match_reason' => $this->matchReason('exact'),
        ]);

        return [$link->fresh(['brokerLot', 'accountLot']), $userId];
    }

    /**
     * @return array{FileForTaxDocument, FinAccounts, int}
     */
    private function documentAccountAndUser(): array
    {
        $user = $this->createUser();
        $account = FinAccounts::withoutEvents(function () use ($user): FinAccounts {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $user->id,
                'acct_name' => 'Brokerage',
                'acct_number' => '1234',
                'acct_last_balance' => '0',
            ]);
        });
        $document = app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => 'broker-1099.pdf',
            'stored_filename' => 'broker-1099.pdf',
            's3_path' => "tax_docs/{$user->id}/broker-1099.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $user->id,
            'is_reviewed' => true,
        ]);

        return [$document, $account, (int) $user->id];
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeBrokerLot(FinAccounts $account, FileForTaxDocument $document, array $overrides = []): FinAccountLot
    {
        return $this->makeLot($account, array_merge([
            'document_id' => $document->document_id,
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
     * @return array{reason_code: string, score: float, deltas: array{proceeds: float, basis: float, wash: float, qty: float, date_days: int}, notes: null}
     */
    private function matchReason(string $reasonCode): array
    {
        return [
            'reason_code' => $reasonCode,
            'score' => 1.0,
            'deltas' => [
                'proceeds' => 0.0,
                'basis' => 0.0,
                'wash' => 0.0,
                'qty' => 0.0,
                'date_days' => 0,
            ],
            'notes' => null,
        ];
    }
}
