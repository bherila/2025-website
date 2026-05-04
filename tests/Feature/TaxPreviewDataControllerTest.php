<?php

namespace Tests\Feature;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
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

        $doc = FileForTaxDocument::create([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'form_type' => '1099_div',
            'account_id' => $account->acct_id,
            'original_filename' => '1099-div.pdf',
            'stored_filename' => '1099-div.pdf',
            's3_path' => '',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 0,
            'file_hash' => str_repeat('a', 64),
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
