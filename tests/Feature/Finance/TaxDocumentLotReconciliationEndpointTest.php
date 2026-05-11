<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Models\FinanceTool\TaxDocumentAccount;
use Tests\TestCase;

class TaxDocumentLotReconciliationEndpointTest extends TestCase
{
    public function test_document_endpoint_requires_authentication(): void
    {
        $this->getJson('/api/finance/tax-documents/1/lot-reconciliation')
            ->assertUnauthorized();
    }

    public function test_document_endpoint_is_scoped_to_owner(): void
    {
        $owner = $this->createUser();
        $attacker = $this->createUser();
        $account = $this->makeAccount($owner->id);
        $document = $this->makeBrokerDocument($owner->id, $account);

        $this->actingAs($attacker)
            ->getJson("/api/finance/tax-documents/{$document->id}/lot-reconciliation")
            ->assertNotFound();
    }

    public function test_document_endpoint_returns_reconciliation_report(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);
        $this->makeLot($account, $document);

        $this->actingAs($user)
            ->getJson("/api/finance/tax-documents/{$document->id}/lot-reconciliation")
            ->assertOk()
            ->assertJsonPath('tax_document_id', $document->id)
            ->assertJsonPath('summary.entry_count', 1)
            ->assertJsonPath('entries.0.summary.parsed_transaction_count', 1)
            ->assertJsonPath('link_state_counts.auto_matched', 0)
            ->assertJsonPath('dashboard_status', 'in_sync');
    }

    public function test_document_links_endpoint_returns_persisted_links_with_lot_summaries(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);
        $brokerLot = $this->makeLot($account, $document);
        $accountLot = $this->makeAccountLot($account);
        $link = FinLotReconciliationLink::create([
            'tax_document_id' => $document->id,
            'broker_lot_id' => $brokerLot->lot_id,
            'account_lot_id' => $accountLot->lot_id,
            'state' => FinLotReconciliationLink::STATE_NEEDS_REVIEW,
            'match_reason' => [
                'reason_code' => 'basis_delta',
                'score' => 0.9,
                'deltas' => [
                    'proceeds' => 0,
                    'basis' => 50,
                    'wash' => 0,
                    'qty' => 0,
                    'date_days' => 0,
                ],
                'notes' => null,
            ],
        ]);

        $this->actingAs($user)
            ->getJson("/api/finance/tax-documents/{$document->id}/lot-reconciliation-links")
            ->assertOk()
            ->assertJsonPath('document.id', $document->id)
            ->assertJsonPath('summary.link_state_counts.needs_review', 1)
            ->assertJsonPath('links.0.id', $link->id)
            ->assertJsonPath('links.0.broker_lot.lot_id', $brokerLot->lot_id)
            ->assertJsonPath('links.0.account_lot.lot_id', $accountLot->lot_id)
            ->assertJsonPath('relink_candidates.0.lot_id', $accountLot->lot_id);
    }

    public function test_year_endpoint_rolls_up_owned_documents_only(): void
    {
        $user = $this->createUser();
        $otherUser = $this->createUser();
        $account = $this->makeAccount($user->id);
        $otherAccount = $this->makeAccount($otherUser->id, 'Other Brokerage', '9999');
        $document = $this->makeBrokerDocument($user->id, $account);
        $otherDocument = $this->makeBrokerDocument($otherUser->id, $otherAccount, 'other-1099.pdf', '9999', 'Other Brokerage');
        $this->makeLot($account, $document);
        $this->makeLot($otherAccount, $otherDocument);

        $this->actingAs($user)
            ->getJson('/api/finance/tax-years/2025/lot-reconciliation')
            ->assertOk()
            ->assertJsonPath('user_id', $user->id)
            ->assertJsonPath('summary.document_count', 1)
            ->assertJsonPath('summary.documents_by_status.in_sync', 1)
            ->assertJsonPath('documents.0.tax_document_id', $document->id);
    }

    public function test_year_endpoint_combines_diagnostic_and_link_state_status(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);
        $brokerLot = $this->makeLot($account, $document);
        $accountLot = $this->makeAccountLot($account, ['cost_basis' => 1100, 'realized_gain_loss' => 150]);
        FinLotReconciliationLink::create([
            'tax_document_id' => $document->id,
            'broker_lot_id' => $brokerLot->lot_id,
            'account_lot_id' => $accountLot->lot_id,
            'state' => FinLotReconciliationLink::STATE_NEEDS_REVIEW,
            'match_reason' => [
                'reason_code' => 'basis_delta',
                'score' => 0.9,
                'deltas' => [
                    'proceeds' => 0,
                    'basis' => 100,
                    'wash' => 0,
                    'qty' => 0,
                    'date_days' => 0,
                ],
                'notes' => null,
            ],
        ]);

        $this->actingAs($user)
            ->getJson('/api/finance/tax-years/2025/lot-reconciliation')
            ->assertOk()
            ->assertJsonPath('summary.dashboard_status', 'needs_review')
            ->assertJsonPath('summary.documents_by_status.needs_review', 1)
            ->assertJsonPath('documents.0.dashboard_status', 'needs_review')
            ->assertJsonPath('documents.0.link_state_counts.needs_review', 1);
    }

    public function test_year_endpoint_returns_empty_rollup_without_1099_b_documents(): void
    {
        $user = $this->createUser();

        $this->actingAs($user)
            ->getJson('/api/finance/tax-years/2025/lot-reconciliation')
            ->assertOk()
            ->assertJsonPath('summary.status', 'ok')
            ->assertJsonPath('summary.dashboard_status', 'in_sync')
            ->assertJsonPath('summary.document_count', 0)
            ->assertJsonPath('summary.documents_by_status.in_sync', 0)
            ->assertJsonPath('documents', []);
    }

    private function makeAccount(int $userId, string $name = 'Brokerage', ?string $number = '1234'): FinAccounts
    {
        return FinAccounts::withoutEvents(function () use ($userId, $name, $number): FinAccounts {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $userId,
                'acct_name' => $name,
                'acct_number' => $number,
                'acct_last_balance' => '0',
            ]);
        });
    }

    private function makeBrokerDocument(
        int $userId,
        FinAccounts $account,
        string $filename = 'broker-1099.pdf',
        string $identifier = '1234',
        string $accountName = 'Brokerage',
    ): FileForTaxDocument {
        $document = FileForTaxDocument::create([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => $filename,
            'stored_filename' => $filename,
            's3_path' => "tax_docs/{$userId}/{$filename}",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => str_repeat('c', 64),
            'uploaded_by_user_id' => $userId,
            'is_reviewed' => true,
            'parsed_data' => [[
                'account_identifier' => $identifier,
                'account_name' => $accountName,
                'form_type' => '1099_b',
                'tax_year' => 2025,
                'parsed_data' => [
                    'payer_name' => 'Synthetic Broker',
                    'total_proceeds' => 1250,
                    'total_cost_basis' => 1000,
                    'total_realized_gain_loss' => 250,
                    'transactions' => [[
                        'symbol' => 'AAPL',
                        'description' => 'Apple Inc.',
                        'quantity' => 10,
                        'purchase_date' => '2024-01-02',
                        'sale_date' => '2025-02-03',
                        'proceeds' => 1250,
                        'cost_basis' => 1000,
                        'wash_sale_disallowed' => 0,
                        'realized_gain_loss' => 250,
                        'form_8949_box' => 'D',
                        'is_covered' => true,
                        'is_short_term' => false,
                    ]],
                ],
            ]],
        ]);

        TaxDocumentAccount::createLink((int) $document->id, $account->acct_id, '1099_b', 2025, aiIdentifier: $identifier, aiAccountName: $accountName);

        return $document;
    }

    private function makeLot(FinAccounts $account, FileForTaxDocument $document): FinAccountLot
    {
        return FinAccountLot::create([
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
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'tax_document_id' => $document->id,
            'form_8949_box' => 'D',
            'wash_sale_disallowed' => 0,
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeAccountLot(FinAccounts $account, array $overrides = []): FinAccountLot
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
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            'form_8949_box' => 'D',
            'wash_sale_disallowed' => 0,
        ], $overrides));
    }
}
