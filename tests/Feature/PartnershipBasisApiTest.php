<?php

namespace Tests\Feature;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinPartnershipBasisEvent;
use App\Models\FinanceTool\FinPartnershipInterest;
use App\Models\User;
use App\Services\Finance\TaxPreviewWorkbookBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PartnershipBasisApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_account_basis_endpoint_and_tax_preview_facts_include_partnership_basis(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = FinAccounts::create(['acct_name' => 'Basis Account']);

        FileForTaxDocument::create([
            'user_id' => $user->id,
            'tax_year' => 2024,
            'form_type' => 'k1',
            'account_id' => $account->acct_id,
            'original_filename' => 'basis.pdf',
            'stored_filename' => 'basis.pdf',
            'file_size_bytes' => 1,
            'file_hash' => sha1('basis-api'),
            'is_reviewed' => true,
            'parsed_data' => [
                'schemaVersion' => '2026.1',
                'formType' => 'K-1-1065',
                'fields' => [
                    'A' => ['value' => 'Basis API LP'],
                    'B' => ['value' => 'Partner'],
                    'D' => ['value' => '12-3456789'],
                    '5' => ['value' => '100'],
                ],
                'codes' => ['19' => [['code' => 'A', 'value' => '40']]],
                'basis' => ['capitalAccount' => ['beginningCapital' => 75]],
            ],
        ]);

        $this->getJson("/api/finance/accounts/{$account->acct_id}/basis?year=2024")
            ->assertOk()
            ->assertJsonPath('interests.0.partnershipName', 'Basis API LP')
            ->assertJsonPath('interests.0.endingOutsideBasis', 60);

        $this->getJson('/api/finance/tax-preview-data?year=2024&include_tax_facts=1')
            ->assertOk()
            ->assertJsonPath('taxFacts.partnershipBasis.interestCount', 1)
            ->assertJsonPath('taxFacts.partnershipBasis.interests.0.worksheet.cashDistributions', 40);
    }

    public function test_initialization_and_manual_event_endpoints_preserve_source_review_state(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = FinAccounts::create(['acct_name' => 'Manual Basis Account']);

        $this->postJson("/api/finance/accounts/{$account->acct_id}/basis/initialization", [
            'tax_year' => 2024,
            'partnership_name' => 'Manual LP',
            'initial_cash_contribution_cents' => 100_00,
            'initial_tax_basis_capital_cents' => 60_00,
            'initialization_review_status' => 'needs_review',
        ])->assertCreated()
            ->assertJsonPath('events.0.reviewStatus', 'needs_review');

        $this->postJson("/api/finance/accounts/{$account->acct_id}/basis/events", [
            'tax_year' => 2024,
            'event_type' => 'taxable_income',
            'amount_cents' => 25_00,
            'review_status' => 'reviewed',
            'source_label' => 'Manual income allocation',
        ])->assertCreated()
            ->assertJsonPath('sourceLabel', 'Manual income allocation');

        $this->postJson("/api/finance/accounts/{$account->acct_id}/basis/lock?year=2024")
            ->assertOk()
            ->assertJsonPath('reviewStatus', 'locked');
    }

    public function test_workbook_export_includes_partnership_basis_worksheets(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = FinAccounts::create(['acct_name' => 'Workbook Basis Account']);
        $interest = FinPartnershipInterest::create([
            'user_id' => $user->id,
            'account_id' => $account->acct_id,
            'partnership_name' => 'Workbook LP',
            'normalized_partnership_name' => 'workbook lp',
            'form_type' => 'k1_1065',
        ]);
        FinPartnershipBasisEvent::create([
            'user_id' => $user->id,
            'partnership_interest_id' => $interest->id,
            'tax_year' => 2024,
            'event_type' => 'beginning_basis',
            'amount_cents' => 100_00,
            'source_type' => 'manual',
            'review_status' => 'reviewed',
        ]);

        $workbook = app(TaxPreviewWorkbookBuilder::class)->buildForUserYear($user->id, 2024);
        $names = array_column($workbook['sheets'], 'name');

        $this->assertContains('Partnership Basis Summary', $names);
        $this->assertContains('Outside Basis Rollforward', $names);
        $this->assertContains('Inside Basis / Capital Reconciliation', $names);
        $this->assertContains('Distribution & Liquidation Analysis', $names);
        $this->assertContains('Basis Source Lines', $names);
    }
}
