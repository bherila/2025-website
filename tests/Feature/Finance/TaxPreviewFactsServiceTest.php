<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\TaxPreviewFactsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaxPreviewFactsServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_schedule1_line5_uses_k1_schedule_e_sources_without_form4952_investment_interest(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'AQR Managed Futures', '1' => '0', '2' => '0', '3' => '0', '4' => '0'],
                codes: [
                    '11' => [['code' => 'ZZ', 'value' => '-74206']],
                    '13' => [
                        ['code' => 'ZZ', 'value' => '8893'],
                        ['code' => 'ZZ', 'value' => '258'],
                        ['code' => 'H', 'value' => '20105'],
                    ],
                ],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025);

        $this->assertSame(-83357.0, $facts['schedule1']['line5Total']);
        $this->assertSame(20105.0, $facts['form4952']['totalInvestmentInterestExpense']);
    }

    public function test_unrouted_1099_misc_defaults_to_schedule1_line8z(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_misc',
            'is_reviewed' => true,
            'parsed_data' => [
                'payer_name' => 'Fidelity',
                'box3_other_income' => 3838.89,
                'box8_substitute_payments' => 0.44,
            ],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'schedule1');

        $this->assertSame(3839.33, $facts['schedule1']['line8zTotal']);
        $this->assertSame('default_schedule_1_8z', $facts['schedule1']['line8zSources'][0]['routing']);
    }

    public function test_1099_misc_explicit_schedule_c_or_e_routing_excludes_line8z(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_misc',
            'is_reviewed' => true,
            'misc_routing' => 'sch_c',
            'parsed_data' => ['box3_other_income' => 100],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_misc',
            'is_reviewed' => true,
            'misc_routing' => 'sch_e',
            'parsed_data' => ['box3_other_income' => 200],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'schedule1');

        $this->assertSame(0.0, $facts['schedule1']['line8zTotal']);
        $this->assertSame([], $facts['schedule1']['line8zSources']);
    }

    public function test_flat_broker_1099_link_uses_parent_review_state_for_misc_line8z(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $doc = $this->createTaxDocument($user->id, [
            'form_type' => 'broker_1099',
            'is_reviewed' => true,
            'parsed_data' => [
                'payer_name' => 'Fidelity Consolidated',
                'box3_other_income' => 3.56,
            ],
        ]);
        TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_misc', 2025, isReviewed: false);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'schedule1');

        $this->assertSame(3.56, $facts['schedule1']['line8zTotal']);
        $this->assertSame('link-1-schedule1-8z', $facts['schedule1']['line8zSources'][0]['id']);
    }

    public function test_form4952_distinguishes_investment_interest_from_investment_expenses(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'AQR', '5' => '100', '6a' => '50', '6b' => '20'],
                codes: [
                    '13' => [['code' => 'H', 'value' => '26320']],
                    '20' => [
                        ['code' => 'A', 'value' => '33300'],
                        ['code' => 'B', 'value' => '86555'],
                    ],
                ],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form4952');

        $this->assertSame(26320.0, $facts['form4952']['totalInvestmentInterestExpense']);
        $this->assertSame(86555.0, $facts['form4952']['totalInvestmentExpenses']);
        $this->assertSame('form_4952_line_1', $facts['form4952']['investmentInterestSources'][0]['routing']);
        $this->assertSame('form_4952_line_5', $facts['form4952']['investmentExpenseSources'][0]['routing']);
    }

    private function createAccount(int $userId): FinAccounts
    {
        return FinAccounts::withoutEvents(fn (): FinAccounts => FinAccounts::withoutGlobalScopes()->forceCreate([
            'acct_owner' => $userId,
            'acct_name' => 'Brokerage',
        ]));
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createTaxDocument(int $userId, array $overrides): FileForTaxDocument
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
            'file_hash' => str_repeat('a', 64),
            'uploaded_by_user_id' => $userId,
        ], $overrides));
    }

    /**
     * @param  array<string, string>  $fields
     * @param  array<string, array<int, array<string, string>>>  $codes
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
