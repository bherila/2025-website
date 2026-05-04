<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaxPreviewFactsApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_tax_preview_data_endpoint_includes_tax_facts(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->getJson('/api/finance/tax-preview-data?year=2025');

        $response->assertOk()
            ->assertJsonStructure([
                'taxFacts' => [
                    'year',
                    'schedule1' => ['line5Sources', 'line5Total', 'line8zSources', 'line8zTotal', 'line9TotalOtherIncome'],
                    'scheduleB' => ['interestSources', 'interestTotal', 'ordinaryDividendSources', 'ordinaryDividendTotal'],
                    'form4952' => ['investmentInterestSources', 'totalInvestmentInterestExpense', 'investmentExpenseSources', 'totalInvestmentExpenses'],
                ],
            ]);
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
}
