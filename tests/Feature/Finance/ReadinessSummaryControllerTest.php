<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Models\User;
use App\Services\Finance\DocumentIngestionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class ReadinessSummaryControllerTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->actingAs($this->user);
    }

    public function test_returns_readiness_summary_for_year(): void
    {
        // Create test documents
        $this->createTaxDocument([
            'form_type' => 'w2',
            'genai_status' => 'parsed',
            'is_reviewed' => true,
        ]);

        $this->createTaxDocument([
            'form_type' => '1099_div',
            'genai_status' => 'parsed',
            'is_reviewed' => false,
        ]);

        $this->createTaxDocument([
            'form_type' => '1099_b',
            'genai_status' => 'parsed',
            'is_reviewed' => true,
        ]);

        $response = $this->getJson('/api/finance/tax-years/2024/readiness-summary');

        $response->assertOk();
        $response->assertJsonStructure([
            'year',
            'documents_by_kind' => [
                'w2',
                '1099_div',
                '1099_int',
                '1099_b',
                '1099_r',
                'k1',
                'other',
            ],
            'pending_review_count',
            'missing_account_count',
            'reconciliation_health' => [
                'ok',
                'drift',
                'blocked',
            ],
            'parsing_failure_count',
            'last_matcher_run_at',
        ]);

        $data = $response->json();
        $this->assertEquals(2024, $data['year']);
        $this->assertEquals(1, $data['documents_by_kind']['w2']);
        $this->assertEquals(1, $data['documents_by_kind']['1099_div']);
        $this->assertEquals(1, $data['documents_by_kind']['1099_b']);
        $this->assertEquals(1, $data['pending_review_count']);
        $this->assertEquals(0, $data['parsing_failure_count']);
    }

    public function test_counts_missing_account_links(): void
    {
        // 1099-B without account links
        $this->createTaxDocument([
            'form_type' => '1099_b',
            'genai_status' => 'parsed',
            'is_reviewed' => true,
        ]);

        $response = $this->getJson('/api/finance/tax-years/2024/readiness-summary');

        $response->assertOk();
        $data = $response->json();
        $this->assertEquals(1, $data['missing_account_count']);
    }

    public function test_counts_corrected_1099_and_k1_documents_in_their_buckets(): void
    {
        $this->createTaxDocument([
            'form_type' => '1099_div_c',
        ]);
        $this->createTaxDocument([
            'form_type' => '1099_int_c',
        ]);
        $this->createTaxDocument([
            'form_type' => 'k1',
        ]);

        $response = $this->getJson('/api/finance/tax-years/2024/readiness-summary');

        $response->assertOk()
            ->assertJsonPath('documents_by_kind.1099_div', 1)
            ->assertJsonPath('documents_by_kind.1099_int', 1)
            ->assertJsonPath('documents_by_kind.k1', 1)
            ->assertJsonPath('documents_by_kind.other', 0);
    }

    public function test_reconciliation_health_uses_persisted_link_states(): void
    {
        $okDocument = $this->createTaxDocument([
            'form_type' => '1099_b',
            'is_reviewed' => true,
        ]);
        $driftDocument = $this->createTaxDocument([
            'form_type' => '1099_b',
            'is_reviewed' => true,
        ]);
        $blockedDocument = $this->createTaxDocument([
            'form_type' => '1099_b',
            'is_reviewed' => true,
        ]);
        $this->createTaxDocument([
            'form_type' => '1099_b',
            'is_reviewed' => true,
        ]);

        FinLotReconciliationLink::factory()->create([
            'document_id' => (int) $okDocument->document_id,
            'state' => FinLotReconciliationLink::STATE_AUTO_MATCHED,
            'updated_at' => now()->subMinutes(3),
        ]);
        FinLotReconciliationLink::factory()->create([
            'document_id' => (int) $driftDocument->document_id,
            'state' => FinLotReconciliationLink::STATE_NEEDS_REVIEW,
            'updated_at' => now()->subMinutes(2),
        ]);
        FinLotReconciliationLink::factory()->create([
            'document_id' => (int) $blockedDocument->document_id,
            'state' => FinLotReconciliationLink::STATE_BROKER_ONLY,
            'updated_at' => now()->subMinute(),
        ]);

        $response = $this->getJson('/api/finance/tax-years/2024/readiness-summary');

        $response->assertOk();
        $response->assertJsonPath('reconciliation_health.ok', 1)
            ->assertJsonPath('reconciliation_health.drift', 1)
            ->assertJsonPath('reconciliation_health.blocked', 2);
        $this->assertNotNull($response->json('last_matcher_run_at'));
    }

    public function test_counts_parsing_failures(): void
    {
        $this->createTaxDocument([
            'form_type' => '1099_div',
            'genai_status' => 'failed',
        ]);
        $this->createTaxDocument([
            'form_type' => '1099_int',
            'genai_status' => 'parsed',
        ]);

        $response = $this->getJson('/api/finance/tax-years/2024/readiness-summary');

        $response->assertOk();
        $response->assertJsonPath('parsing_failure_count', 1);
    }

    public function test_caches_summary_for_60_seconds(): void
    {
        $cacheKey = "tax_readiness_summary:{$this->user->id}:2024";

        // First request
        $this->getJson('/api/finance/tax-years/2024/readiness-summary');
        $this->assertTrue(Cache::has($cacheKey));

        // Create new document
        $this->createTaxDocument([
            'form_type' => 'w2',
        ]);

        // Second request should still use cached value
        $response = $this->getJson('/api/finance/tax-years/2024/readiness-summary');
        $data = $response->json();

        // Should be 0 because cached value is returned
        $this->assertEquals(0, $data['documents_by_kind']['w2']);

        // Clear cache and verify fresh data
        Cache::forget($cacheKey);
        $response = $this->getJson('/api/finance/tax-years/2024/readiness-summary');
        $data = $response->json();

        // Should be 1 now
        $this->assertEquals(1, $data['documents_by_kind']['w2']);
    }

    public function test_validates_year_parameter(): void
    {
        $response = $this->getJson('/api/finance/tax-years/1800/readiness-summary');
        $response->assertStatus(422);

        $response = $this->getJson('/api/finance/tax-years/2200/readiness-summary');
        $response->assertStatus(422);
    }

    public function test_returns_empty_summary_for_year_with_no_data(): void
    {
        $response = $this->getJson('/api/finance/tax-years/2024/readiness-summary');

        $response->assertOk();
        $data = $response->json();
        $this->assertEquals(2024, $data['year']);
        $this->assertEquals(0, $data['pending_review_count']);
        $this->assertEquals(0, $data['missing_account_count']);
        $this->assertEquals(0, $data['parsing_failure_count']);
        $this->assertEquals(0, $data['documents_by_kind']['w2']);
        $this->assertEquals(0, $data['reconciliation_health']['ok']);
    }

    public function test_counts_document_with_unresolved_account_link_as_missing(): void
    {
        // A 1099-B whose account link exists but account_id is null (unresolved)
        // should count as a missing account, consistent with TaxLotReconciliationService::unresolvedAccountLinks().
        $doc = $this->createTaxDocument([
            'form_type' => '1099_b',
            'genai_status' => 'parsed',
            'is_reviewed' => true,
        ]);

        TaxDocumentAccount::createLink((int) $doc->id, null, '1099_b', 2024);

        $response = $this->getJson('/api/finance/tax-years/2024/readiness-summary');

        $response->assertOk();
        $this->assertEquals(1, $response->json('missing_account_count'));
    }

    public function test_reconciliation_health_detects_drift_for_auto_matched_documents_with_amount_mismatch(): void
    {
        // A document with auto_matched links but drifted lot amounts should appear
        // as drift, not ok — LotReconciliationService diagnostics take priority over
        // clean link states.
        $account = $this->makeFinAccount();
        $parsedData = [
            'payer_name' => 'Test Broker',
            'total_proceeds' => 1000.00,
            'total_cost_basis' => 800.00,
            'total_realized_gain_loss' => 200.00,
            'transactions' => [
                [
                    'symbol' => 'AAPL',
                    'proceeds' => 1000.00,
                    'cost_basis' => 800.00,
                    'realized_gain_loss' => 200.00,
                    'form_8949_box' => 'D',
                ],
            ],
        ];

        $doc = $this->createBrokerDocument($account, $parsedData);

        // Create an auto_matched reconciliation link so link states appear clean.
        FinLotReconciliationLink::factory()->create([
            'document_id' => (int) $doc->document_id,
            'state' => FinLotReconciliationLink::STATE_AUTO_MATCHED,
        ]);

        // Create a lot with drifted amounts (proceeds changed after matching).
        FinAccountLot::create([
            'acct_id' => $account->acct_id,
            'symbol' => 'AAPL',
            'description' => 'Apple Inc.',
            'quantity' => 10,
            'purchase_date' => '2023-01-02',
            'cost_basis' => 800.00,
            'cost_per_unit' => 80.00,
            'sale_date' => '2024-02-03',
            'proceeds' => 999.00,
            'realized_gain_loss' => 199.00,
            'is_short_term' => false,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
            'document_id' => (int) $doc->document_id,
            'form_8949_box' => 'D',
            'wash_sale_disallowed' => 0,
        ]);

        Cache::forget("tax_readiness_summary:{$this->user->id}:2024");
        $response = $this->getJson('/api/finance/tax-years/2024/readiness-summary');

        $response->assertOk();
        // Diagnostics detect amount drift: should be drift, not ok.
        $this->assertEquals(1, $response->json('reconciliation_health.drift'));
        $this->assertEquals(0, $response->json('reconciliation_health.ok'));
    }

    public function test_reconciliation_health_treats_warning_diagnostics_as_drift(): void
    {
        $account = $this->makeFinAccount();
        $parsedData = [
            'payer_name' => 'Test Broker',
            'total_proceeds' => 1000.00,
            'total_cost_basis' => 800.00,
            'total_realized_gain_loss' => 200.00,
            'transactions' => [
                [
                    'symbol' => 'AAPL',
                    'proceeds' => 1000.00,
                    'cost_basis' => 800.00,
                    'realized_gain_loss' => 200.00,
                    'form_8949_box' => 'D',
                ],
            ],
        ];

        $doc = $this->createBrokerDocument($account, $parsedData);

        FinLotReconciliationLink::factory()->create([
            'document_id' => (int) $doc->document_id,
            'state' => FinLotReconciliationLink::STATE_AUTO_MATCHED,
        ]);

        FinAccountLot::create([
            'acct_id' => $account->acct_id,
            'symbol' => 'AAPL',
            'description' => 'Apple Inc.',
            'quantity' => 10,
            'purchase_date' => '2023-01-02',
            'cost_basis' => 800.00,
            'cost_per_unit' => 80.00,
            'sale_date' => '2024-02-03',
            'proceeds' => 1000.00,
            'realized_gain_loss' => 200.00,
            'is_short_term' => false,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
            'document_id' => (int) $doc->document_id,
            'form_8949_box' => null,
            'wash_sale_disallowed' => 0,
        ]);

        Cache::forget("tax_readiness_summary:{$this->user->id}:2024");
        $response = $this->getJson('/api/finance/tax-years/2024/readiness-summary');

        $response->assertOk();
        $this->assertEquals(1, $response->json('reconciliation_health.drift'));
        $this->assertEquals(0, $response->json('reconciliation_health.ok'));
    }

    public function test_requires_authentication(): void
    {
        $this->app['auth']->forgetGuards();

        $response = $this->getJson('/api/finance/tax-years/2024/readiness-summary');
        $response->assertStatus(401);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createTaxDocument(array $overrides = []): FileForTaxDocument
    {
        return app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $this->user->id,
            'tax_year' => 2024,
            'form_type' => 'w2',
            'original_filename' => 'test.pdf',
            'file_path' => '/tmp/test.pdf',
            'file_size_bytes' => 1000,
            'file_hash' => md5('test-'.uniqid()),
            'genai_status' => 'parsed',
            'is_reviewed' => false,
            ...$overrides,
        ]);
    }

    private function makeFinAccount(): FinAccounts
    {
        return FinAccounts::withoutEvents(function (): FinAccounts {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $this->user->id,
                'acct_name' => 'Test Brokerage',
                'acct_number' => '9999',
                'acct_last_balance' => '0',
            ]);
        });
    }

    /**
     * @param  array<string, mixed>  $parsedData
     */
    private function createBrokerDocument(FinAccounts $account, array $parsedData): FileForTaxDocument
    {
        $filename = 'broker-1099-'.uniqid().'.pdf';
        $doc = app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $this->user->id,
            'tax_year' => 2024,
            'form_type' => 'broker_1099',
            'original_filename' => $filename,
            'file_path' => '/tmp/'.$filename,
            'file_size_bytes' => 1000,
            'file_hash' => md5($filename),
            'genai_status' => 'parsed',
            'is_reviewed' => true,
            'parsed_data' => [[
                'account_identifier' => '9999',
                'account_name' => 'Test Brokerage',
                'form_type' => '1099_b',
                'tax_year' => 2024,
                'parsed_data' => $parsedData,
            ]],
        ]);

        TaxDocumentAccount::createLink(
            (int) $doc->id,
            $account->acct_id,
            '1099_b',
            2024,
            aiIdentifier: '9999',
            aiAccountName: 'Test Brokerage',
        );

        return $doc;
    }
}
