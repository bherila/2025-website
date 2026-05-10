<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Models\User;
use Tests\TestCase;

class LotReconciliationLinkEndpointTest extends TestCase
{
    public function test_match_endpoint_requires_authentication(): void
    {
        $this->postJson('/api/finance/tax-documents/1/lots-match')
            ->assertUnauthorized();
    }

    public function test_match_endpoint_is_scoped_to_document_owner(): void
    {
        [$document] = $this->documentAndAccount();
        $attacker = $this->createUser();

        $this->actingAs($attacker)
            ->postJson("/api/finance/tax-documents/{$document->id}/lots-match")
            ->assertNotFound();
    }

    public function test_match_endpoint_runs_matcher_and_full_rebuild_requires_confirmation(): void
    {
        [$document, $account, $userId] = $this->documentAndAccount();
        $this->makeBrokerLot($account, $document);
        $this->makeAccountLot($account);
        $user = User::query()->findOrFail($userId);

        $this->actingAs($user)
            ->postJson("/api/finance/tax-documents/{$document->id}/lots-match")
            ->assertOk()
            ->assertJsonPath('counts.auto_matched', 1);

        $this->actingAs($user)
            ->postJson("/api/finance/tax-documents/{$document->id}/lots-match/full-rebuild")
            ->assertUnprocessable();

        $this->actingAs($user)
            ->postJson("/api/finance/tax-documents/{$document->id}/lots-match/full-rebuild", ['confirm' => true])
            ->assertOk()
            ->assertJsonPath('counts.auto_matched', 1);
    }

    public function test_transition_endpoints_are_owner_scoped_and_update_states(): void
    {
        [$document, $account, $userId] = $this->documentAndAccount();
        $brokerLot = $this->makeBrokerLot($account, $document);
        $accountLot = $this->makeAccountLot($account);
        $link = $this->makeLink($document, $brokerLot, $accountLot);
        $owner = User::query()->findOrFail($userId);
        $attacker = $this->createUser();

        $this->actingAs($attacker)
            ->postJson("/api/finance/lot-reconciliation-links/{$link->id}/accept-broker")
            ->assertNotFound();

        $this->actingAs($owner)
            ->postJson("/api/finance/lot-reconciliation-links/{$link->id}/accept-broker")
            ->assertOk()
            ->assertJsonPath('state', FinLotReconciliationLink::STATE_ACCEPTED_BROKER);

        $this->actingAs($owner)
            ->postJson("/api/finance/lot-reconciliation-links/{$link->id}/accept-account-override")
            ->assertOk()
            ->assertJsonPath('state', FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE);

        $this->assertSame($accountLot->lot_id, $brokerLot->fresh()->superseded_by_lot_id);

        $this->actingAs($owner)
            ->postJson("/api/finance/lot-reconciliation-links/{$link->id}/unlink")
            ->assertOk()
            ->assertJsonPath('state', FinLotReconciliationLink::STATE_UNLINKED);

        $this->assertNull($brokerLot->fresh()->superseded_by_lot_id);
    }

    public function test_mark_duplicate_and_relink_endpoints(): void
    {
        [$document, $account, $userId] = $this->documentAndAccount();
        $brokerLot = $this->makeBrokerLot($account, $document);
        $oldAccountLot = $this->makeAccountLot($account);
        $newAccountLot = $this->makeAccountLot($account, ['proceeds' => 1260]);
        $link = $this->makeLink($document, $brokerLot, $oldAccountLot);
        $owner = User::query()->findOrFail($userId);

        $this->actingAs($owner)
            ->postJson("/api/finance/lot-reconciliation-links/{$link->id}/mark-duplicate")
            ->assertOk()
            ->assertJsonPath('state', FinLotReconciliationLink::STATE_IGNORED_DUPLICATE);

        $this->actingAs($owner)
            ->postJson('/api/finance/lot-reconciliation-links/relink', [
                'broker_lot_id' => $brokerLot->lot_id,
                'account_lot_id' => $newAccountLot->lot_id,
            ])
            ->assertOk()
            ->assertJsonPath('state', FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE)
            ->assertJsonPath('brokerLotId', $brokerLot->lot_id)
            ->assertJsonPath('accountLotId', $newAccountLot->lot_id);
    }

    private function makeLink(FileForTaxDocument $document, FinAccountLot $brokerLot, FinAccountLot $accountLot): FinLotReconciliationLink
    {
        return FinLotReconciliationLink::create([
            'tax_document_id' => $document->id,
            'broker_lot_id' => $brokerLot->lot_id,
            'account_lot_id' => $accountLot->lot_id,
            'state' => FinLotReconciliationLink::STATE_AUTO_MATCHED,
            'match_reason' => [
                'reason_code' => 'exact',
                'score' => 1.0,
                'deltas' => [
                    'proceeds' => 0,
                    'basis' => 0,
                    'wash' => 0,
                    'qty' => 0,
                    'date_days' => 0,
                ],
                'notes' => null,
            ],
        ]);
    }

    /**
     * @return array{FileForTaxDocument, FinAccounts, int}
     */
    private function documentAndAccount(): array
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
        $document = FileForTaxDocument::create([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => 'broker-1099.pdf',
            'stored_filename' => 'broker-1099.pdf',
            's3_path' => "tax_docs/{$user->id}/broker-1099.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => str_repeat('a', 64),
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
            'tax_document_id' => $document->id,
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
            'tax_document_id' => null,
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
}
