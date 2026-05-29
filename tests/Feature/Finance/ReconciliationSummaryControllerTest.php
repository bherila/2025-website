<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\CapitalGains\ReconciliationSummaryService;
use App\Services\Finance\DocumentIngestionService;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class ReconciliationSummaryControllerTest extends TestCase
{
    public function test_summary_endpoint_requires_authentication(): void
    {
        $this->getJson('/api/finance/tax-years/2025/reconciliation-summary')
            ->assertUnauthorized();
    }

    public function test_summary_endpoint_validates_year_range(): void
    {
        $user = $this->createUser();

        $this->actingAs($user)
            ->getJson('/api/finance/tax-years/1800/reconciliation-summary')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('year');
    }

    public function test_summary_endpoint_rolls_up_health_and_unresolved_accounts_for_owned_documents(): void
    {
        $user = $this->createUser();
        $otherUser = $this->createUser();
        $account = $this->makeAccount($user->id);
        $otherAccount = $this->makeAccount($otherUser->id, 'Other Brokerage');
        $okDocument = $this->makeBrokerDocument($user->id, $account, ['file_hash' => str_repeat('a', 64)]);
        $driftDocument = $this->makeBrokerDocument($user->id, $account, ['file_hash' => str_repeat('b', 64)]);
        $blockedDocument = $this->makeBrokerDocument($user->id, null, ['file_hash' => str_repeat('c', 64)]);
        $otherDocument = $this->makeBrokerDocument($otherUser->id, $otherAccount, ['file_hash' => str_repeat('d', 64)]);

        $this->makeLink($okDocument, $account, FinLotReconciliationLink::STATE_AUTO_MATCHED);
        $this->makeLink($driftDocument, $account, FinLotReconciliationLink::STATE_NEEDS_REVIEW);
        $this->makeLink($otherDocument, $otherAccount, FinLotReconciliationLink::STATE_AUTO_MATCHED);

        $this->actingAs($user)
            ->getJson('/api/finance/tax-years/2025/reconciliation-summary')
            ->assertOk()
            ->assertJsonPath('user_id', $user->id)
            ->assertJsonPath('summary.document_count', 3)
            ->assertJsonPath('summary.documents_by_health.ok', 1)
            ->assertJsonPath('summary.documents_by_health.drift', 1)
            ->assertJsonPath('summary.documents_by_health.blocked', 1)
            ->assertJsonPath('summary.unresolved_account_links', 1)
            ->assertJsonPath('summary.link_state_counts.auto_matched', 1)
            ->assertJsonPath('summary.link_state_counts.needs_review', 1)
            ->assertJsonPath('documents.0.tax_document_id', $okDocument->id)
            ->assertJsonPath('documents.1.tax_document_id', $driftDocument->id)
            ->assertJsonPath('documents.2.tax_document_id', $blockedDocument->id)
            ->assertJsonPath('unresolved_account_links.0.tax_document_id', $blockedDocument->id);
    }

    public function test_summary_endpoint_does_not_cache_membership_sensitive_response(): void
    {
        $user = $this->createUser();

        $this->actingAs($user)
            ->getJson('/api/finance/tax-years/2025/reconciliation-summary')
            ->assertOk();

        $this->assertFalse(Cache::has(ReconciliationSummaryService::cacheKey($user->id, 2025)));
    }

    public function test_summary_endpoint_allows_missing_broker_name_and_filename(): void
    {
        $user = $this->createUser();
        $document = $this->makeBrokerDocument($user->id, null, [
            'original_filename' => null,
            'stored_filename' => null,
            's3_path' => null,
            'file_hash' => str_repeat('e', 64),
            'parsed_data' => [[]],
        ]);

        $this->actingAs($user)
            ->getJson('/api/finance/tax-years/2025/reconciliation-summary')
            ->assertOk()
            ->assertJsonPath('documents.0.tax_document_id', $document->id)
            ->assertJsonPath('documents.0.broker', null)
            ->assertJsonPath('documents.0.original_filename', null);
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

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeBrokerDocument(int $userId, ?FinAccounts $account, array $overrides = []): FileForTaxDocument
    {
        $document = app(DocumentIngestionService::class)->createTaxFormDetail(array_merge([
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
            'parsed_data' => [[
                'account_identifier' => '1234',
                'account_name' => $account?->acct_name ?? 'Unresolved Brokerage',
                'form_type' => '1099_b',
                'tax_year' => 2025,
                'parsed_data' => [
                    'payer_name' => $account?->acct_name ?? 'Unresolved Brokerage',
                    'transactions' => [],
                ],
            ]],
        ], $overrides));

        TaxDocumentAccount::createLink(
            (int) $document->id,
            $account?->acct_id,
            '1099_b',
            2025,
            aiIdentifier: '1234',
            aiAccountName: $account?->acct_name ?? 'Unresolved Brokerage',
        );

        return $document;
    }

    private function makeLink(FileForTaxDocument $document, FinAccounts $account, string $state): void
    {
        $brokerLot = $this->makeLot($account, [
            'document_id' => $document->document_id,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
        ]);
        $accountLot = $this->makeLot($account, [
            'document_id' => null,
            'lot_source' => 'analyzer',
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
        ]);

        FinLotReconciliationLink::create([
            'document_id' => $document->document_id,
            'broker_lot_id' => $brokerLot->lot_id,
            'account_lot_id' => $accountLot->lot_id,
            'state' => $state,
            'match_reason' => [
                'reason_code' => $state === FinLotReconciliationLink::STATE_NEEDS_REVIEW ? 'basis_delta' : 'exact',
                'score' => 1.0,
                'deltas' => [
                    'proceeds' => 0,
                    'basis' => $state === FinLotReconciliationLink::STATE_NEEDS_REVIEW ? 10 : 0,
                    'wash' => 0,
                    'qty' => 0,
                    'date_days' => 0,
                ],
                'notes' => null,
            ],
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeLot(FinAccounts $account, array $overrides = []): FinAccountLot
    {
        return FinAccountLot::create(array_merge([
            'acct_id' => $account->acct_id,
            'symbol' => fake()->randomElement(['AAPL', 'MSFT', 'TSLA']),
            'description' => 'Test holding',
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
