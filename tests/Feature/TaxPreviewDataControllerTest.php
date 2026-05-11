<?php

namespace Tests\Feature;

use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\DocumentIngestionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaxPreviewDataControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_tax_preview_data_endpoint_requires_authentication(): void
    {
        $this->getJson('/api/finance/tax-preview-data')
            ->assertUnauthorized();
    }

    public function test_tax_preview_data_endpoint_returns_expected_keys(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->getJson('/api/finance/tax-preview-data?year=2025');

        $response->assertOk()
            ->assertJsonStructure([
                'year',
                'availableYears',
                'payslips',
                'pendingReviewCount',
                'w2Documents',
                'accountDocuments',
                'scheduleCData' => ['available_years', 'years', 'entities'],
                'employmentEntities',
                'accounts',
                'activeAccountIds',
            ]);
    }

    public function test_tax_preview_data_endpoint_includes_debt_accounts_for_future_tax_document_categories(): void
    {
        $user = $this->createUser();

        FinAccounts::withoutEvents(function () use ($user): void {
            FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $user->id,
                'acct_name' => 'fidelity taxable',
                'acct_is_debt' => false,
                'acct_is_retirement' => false,
            ]);
            FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $user->id,
                'acct_name' => 'traditional ira',
                'acct_is_debt' => false,
                'acct_is_retirement' => true,
            ]);
            FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $user->id,
                'acct_name' => 'green',
                'acct_is_debt' => true,
                'acct_is_retirement' => false,
            ]);
        });

        $response = $this->actingAs($user)->getJson('/api/finance/tax-preview-data?year=2025');

        $response->assertOk();
        $accountNames = collect($response->json('accounts'))->pluck('acct_name')->all();
        $this->assertContains('fidelity taxable', $accountNames);
        $this->assertContains('traditional ira', $accountNames);
        $this->assertContains('green', $accountNames);
    }

    public function test_tax_preview_data_endpoint_ignores_non_numeric_year_query_values(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->getJson('/api/finance/tax-preview-data?year=all');

        $response->assertOk();
        $this->assertEquals((int) date('Y'), $response->json('year'));
    }

    public function test_tax_preview_data_endpoint_returns_canonicalized_account_documents(): void
    {
        $user = $this->createUser();
        $account = FinAccounts::withoutEvents(function () use ($user): FinAccounts {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $user->id,
                'acct_name' => 'Fidelity SMA',
            ]);
        });

        $doc = app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'form_type' => '1099_div',
            'account_id' => $account->acct_id,
            'original_filename' => '1099-div.pdf',
            'stored_filename' => '1099-div.pdf',
            's3_path' => '',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 0,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $user->id,
            'parsed_data' => [
                'payer_name' => 'Fidelity',
                'boxes' => [
                    '1a_total_ordinary_dividends' => 99.12,
                    '1b_qualified_dividends' => 88.10,
                ],
            ],
        ]);
        TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_div', 2025);

        $response = $this->actingAs($user)->getJson('/api/finance/tax-preview-data?year=2025');

        $response->assertOk()
            ->assertJsonPath('accountDocuments.0.parsed_data.box1a_ordinary', 99.12)
            ->assertJsonPath('accountDocuments.0.parsed_data.box1b_qualified', 88.10)
            ->assertJsonPath('accountDocuments.0.parsed_data_needs_review', true);
    }

    public function test_tax_preview_data_endpoint_does_not_return_prior_year_payload(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->getJson('/api/finance/tax-preview-data?year=2025');

        $response->assertOk();
        $response->assertJsonMissingPath('priorYearAccountDocuments');
    }
}
