<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Models\FinanceTool\UserDeduction;
use App\Services\Finance\TaxPreviewDataService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class TaxPreviewFactsApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_tax_preview_data_endpoint_includes_tax_facts_when_requested(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->getJson('/api/finance/tax-preview-data?year=2025&include_tax_facts=1');

        $response->assertOk()
            ->assertJsonStructure([
                'taxFacts' => [
                    'year',
                    'schedule1' => ['line5Sources', 'line5Total', 'line8Sources', 'line8bSources', 'line8bTotal', 'line8hSources', 'line8hTotal', 'line8iSources', 'line8iTotal', 'line8zSources', 'line8zTotal', 'line9TotalOtherIncome'],
                    'scheduleB' => ['interestSources', 'interestTotal', 'ordinaryDividendSources', 'ordinaryDividendTotal'],
                    'form4952' => ['investmentInterestSources', 'totalInvestmentInterestExpense', 'investmentExpenseSources', 'totalInvestmentExpenses', 'line4cNetInvestmentIncomeAfterQualifiedDividends'],
                    'form1040' => ['line1zSources', 'line1z', 'line16', 'line24', 'line33', 'line37'],
                ],
            ]);
    }

    public function test_tax_preview_data_endpoint_omits_tax_facts_by_default(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->getJson('/api/finance/tax-preview-data?year=2025');

        $response->assertOk()
            ->assertJsonMissingPath('taxFacts');
    }

    public function test_tax_preview_data_service_loads_accounts_without_auth_context(): void
    {
        $user = $this->createUser();
        $account = FinAccounts::withoutEvents(fn (): FinAccounts => FinAccounts::withoutGlobalScopes()->forceCreate([
            'acct_owner' => $user->id,
            'acct_name' => 'CLI Brokerage',
        ]));

        $dataset = app(TaxPreviewDataService::class)->datasetForYear($user->id, 2025);

        $this->assertSame($account->acct_id, $dataset['accounts'][0]['acct_id']);
        $this->assertArrayNotHasKey('taxFacts', $dataset);
    }

    public function test_tax_document_update_preserves_legacy_shape_without_tax_fact_opt_in(): void
    {
        $user = $this->createUser();
        $doc = $this->createTaxDocument($user->id);

        $response = $this->actingAs($user)->putJson("/api/finance/tax-documents/{$doc->id}", [
            'notes' => 'Reviewed',
        ]);

        $response->assertOk()
            ->assertJsonPath('id', $doc->id)
            ->assertJsonMissingPath('document')
            ->assertJsonMissingPath('taxFacts');
    }

    public function test_tax_document_update_can_return_tax_fact_patch(): void
    {
        $user = $this->createUser();
        $doc = $this->createTaxDocument($user->id);

        $response = $this->actingAs($user)->putJson("/api/finance/tax-documents/{$doc->id}?include_tax_facts=1", [
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Fidelity', 'box3_other_income' => 42],
        ]);

        $response->assertOk()
            ->assertJsonPath('document.id', $doc->id)
            ->assertJsonPath('taxFacts.schedule1.line8zTotal', 42);
    }

    public function test_account_link_update_can_return_tax_fact_patch(): void
    {
        $user = $this->createUser();
        $account = FinAccounts::withoutEvents(fn (): FinAccounts => FinAccounts::withoutGlobalScopes()->forceCreate([
            'acct_owner' => $user->id,
            'acct_name' => 'Brokerage',
        ]));
        $doc = $this->createTaxDocument($user->id, [
            'form_type' => 'broker_1099',
            'is_reviewed' => true,
            'parsed_data' => [
                [
                    'account_identifier' => '1234',
                    'account_name' => 'Brokerage',
                    'form_type' => '1099_misc',
                    'tax_year' => 2025,
                    'parsed_data' => ['payer_name' => 'Broker', 'box3_other_income' => 12],
                ],
            ],
        ]);
        $link = TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_misc', 2025, aiIdentifier: '1234', aiAccountName: 'Brokerage');

        $response = $this->actingAs($user)->patchJson("/api/finance/tax-documents/{$doc->id}/accounts/{$link->id}?include_tax_facts=1", [
            'is_reviewed' => true,
        ]);

        $response->assertOk()
            ->assertJsonPath('link.id', $link->id)
            ->assertJsonPath('taxFacts.schedule1.line8zTotal', 12);
    }

    public function test_tax_preview_facts_cli_outputs_requested_slice(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Fidelity', 'box3_other_income' => 42],
        ]);

        $this->artisan('finance:tax-preview-facts', [
            '--user' => $user->id,
            '--year' => 2025,
            '--slice' => 'schedule1',
            '--format' => 'json',
        ])
            ->assertExitCode(0)
            ->expectsOutputToContain('"line8zTotal": 42');
    }

    public function test_tax_preview_facts_cli_outputs_form1040_slice(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 50000],
        ]);

        $exitCode = Artisan::call('finance:tax-preview-facts', [
            '--user' => $user->id,
            '--year' => 2025,
            '--slice' => 'form1040',
            '--format' => 'json',
        ]);
        $payload = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);

        $this->assertSame(0, $exitCode);
        $this->assertSame(50000, $payload['form1040']['line1z']);
    }

    public function test_tax_preview_facts_cli_rejects_invalid_format(): void
    {
        $user = $this->createUser();

        $this->artisan('finance:tax-preview-facts', [
            '--user' => $user->id,
            '--year' => 2025,
            '--format' => 'yaml',
        ])
            ->assertExitCode(1)
            ->expectsOutputToContain('Invalid --format value');
    }

    public function test_tax_preview_facts_cli_rejects_missing_user(): void
    {
        $this->artisan('finance:tax-preview-facts', [
            '--user' => 999999,
            '--year' => 2025,
        ])
            ->assertExitCode(1)
            ->expectsOutputToContain('User ID 999999 not found');
    }

    public function test_tax_preview_facts_table_outputs_excluded_form4952_expense_sources(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'Fund'],
                codes: ['20' => [['code' => 'B', 'value' => '123']]],
            ),
        ]);

        $exitCode = Artisan::call('finance:tax-preview-facts', [
            '--user' => $user->id,
            '--year' => 2025,
            '--slice' => 'form4952',
        ]);
        $output = Artisan::output();

        $this->assertSame(0, $exitCode);
        $this->assertStringContainsString('excludedLine5', $output);
        $this->assertStringContainsString('totalExcludedInvestmentExpenses', $output);
    }

    public function test_tax_preview_facts_table_outputs_all_schedule_a_source_buckets(): void
    {
        $user = $this->createUser();
        UserDeduction::create([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'category' => 'sales_tax',
            'description' => 'Sales tax',
            'amount' => 20,
        ]);
        UserDeduction::create([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'category' => 'mortgage_interest',
            'description' => 'Mortgage interest',
            'amount' => 30,
        ]);
        UserDeduction::create([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'category' => 'charitable_cash',
            'description' => 'Cash gift',
            'amount' => 40,
        ]);

        $exitCode = Artisan::call('finance:tax-preview-facts', [
            '--user' => $user->id,
            '--year' => 2025,
            '--slice' => 'scheduleA',
        ]);
        $output = Artisan::output();

        $this->assertSame(0, $exitCode);
        $this->assertStringContainsString('line5a', $output);
        $this->assertStringContainsString('Sales tax', $output);
        $this->assertStringContainsString('line8a', $output);
        $this->assertStringContainsString('Mortgage interest', $output);
        $this->assertStringContainsString('line11', $output);
        $this->assertStringContainsString('Cash gift', $output);
    }

    public function test_tax_preview_facts_table_outputs_all_schedule_e_source_buckets(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: [
                    'B' => 'Trader Fund',
                    '1' => '100',
                    '4' => '25',
                    'partnershipPosition_traderInSecurities' => 'true',
                ],
                codes: [
                    '11' => [['code' => 'ZZ', 'value' => '10']],
                    '13' => [['code' => 'ZZ', 'value' => '3']],
                ],
            ),
        ]);

        $exitCode = Artisan::call('finance:tax-preview-facts', [
            '--user' => $user->id,
            '--year' => 2025,
            '--slice' => 'scheduleE',
        ]);
        $output = Artisan::output();

        $this->assertSame(0, $exitCode);
        $this->assertStringContainsString('box1Sources', $output);
        $this->assertStringContainsString('box4Sources', $output);
        $this->assertStringContainsString('traderNiiSources', $output);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createTaxDocument(int $userId, array $overrides = []): FileForTaxDocument
    {
        return FileForTaxDocument::create(array_merge([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => '1099_misc',
            'original_filename' => 'tax-doc.pdf',
            'stored_filename' => 'tax-doc.pdf',
            's3_path' => '',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 0,
            'file_hash' => str_repeat('b', 64),
            'uploaded_by_user_id' => $userId,
            'is_reviewed' => false,
        ], $overrides));
    }

    /**
     * @param  array<int|string, string>  $fields
     * @param  array<int|string, array<int, array<string, string>>>  $codes
     * @return array<string, mixed>
     */
    private function k1Data(array $fields = [], array $codes = []): array
    {
        return [
            'schemaVersion' => '2026.1',
            'formType' => 'K-1-1065',
            'fields' => collect($fields)->map(fn (string $value): array => ['value' => $value])->all(),
            'codes' => $codes,
        ];
    }
}
