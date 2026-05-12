<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinAccountTag;
use App\Models\FinanceTool\FinStatement;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Models\User;
use App\Services\Finance\DocumentIngestionService;
use App\Services\Finance\FeeAnalyticsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FeeAnalyticsServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_fee_amount_for_line_item_counts_overlapping_signals_once(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user);
        $tag = $this->createFeeTag($user, 'fee_schE');
        $feeRow = $this->createLineItem($account, [
            't_type' => 'Fee',
            't_amt' => -50,
            't_fee' => 12,
        ]);
        $feeRow->tags()->attach($tag->tag_id);
        $commissionRow = $this->createLineItem($account, [
            't_type' => 'Buy',
            't_amt' => -1000,
            't_fee' => 7.5,
        ]);

        $service = app(FeeAnalyticsService::class);

        $this->assertSame(50.0, $service->feeAmountForLineItem($feeRow->fresh('tags')));
        $this->assertSame(7.5, $service->feeAmountForLineItem($commissionRow->fresh('tags')));
    }

    public function test_actual_fees_for_account_buckets_tagged_untagged_and_embedded_fees(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user);
        $schETag = $this->createFeeTag($user, 'fee_schE', 'Schedule E Fees');
        $irc67gTag = $this->createFeeTag($user, 'fee_irc67g', 'Personal Fees');

        $this->createLineItem($account, ['t_type' => 'Debit', 't_amt' => -20])->tags()->attach($schETag->tag_id);
        $this->createLineItem($account, ['t_type' => 'Fee', 't_amt' => -30])->tags()->attach($irc67gTag->tag_id);
        $this->createLineItem($account, ['t_type' => 'Fee', 't_amt' => -40]);
        $this->createLineItem($account, ['t_type' => 'Buy', 't_amt' => -1000, 't_fee' => 5]);

        $actual = app(FeeAnalyticsService::class)->actualFeesForAccount((int) $account->acct_id, 2025);

        $this->assertSame(95.0, $actual['total']);
        $this->assertSame(20.0, $actual['by_characteristic']['fee_schE']);
        $this->assertSame(30.0, $actual['by_characteristic']['fee_irc67g']);
        $this->assertSame(45.0, $actual['by_characteristic']['untagged']);
        $this->assertCount(4, $actual['line_items']);
    }

    public function test_expected_fees_for_account_prorates_for_mid_year_opened_accounts(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user, [
            'expected_fee_pct' => 1,
            'expected_fee_flat' => 120,
        ]);
        $this->createLineItem($account, ['t_date' => '2025-07-01', 't_type' => 'Deposit', 't_amt' => 12000]);

        foreach (['2025-07-31', '2025-08-31', '2025-09-30', '2025-10-31', '2025-11-30', '2025-12-31'] as $date) {
            $this->createStatement($account, $date, 12000);
        }

        $expected = app(FeeAnalyticsService::class)->expectedFeesForAccount($account->fresh(), 2025);

        $this->assertEqualsWithDelta(120.90, $expected, 0.01);
    }

    public function test_expected_and_actual_fees_are_zero_for_account_closed_before_year(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user, [
            'expected_fee_pct' => 1,
            'expected_fee_flat' => 120,
            'when_closed' => '2024-12-31',
        ]);
        $this->createLineItem($account, ['t_date' => '2024-06-01', 't_type' => 'Deposit', 't_amt' => 10000]);
        $this->createLineItem($account, ['t_date' => '2025-02-01', 't_type' => 'Fee', 't_amt' => -50]);

        $service = app(FeeAnalyticsService::class);

        $this->assertSame(0.0, $service->expectedFeesForAccount($account->fresh(), 2025));
        $this->assertSame(0.0, $service->actualFeesForAccount((int) $account->acct_id, 2025)['total']);
    }

    public function test_monthly_fee_drag_series_gross_return_equals_net_return_plus_fees(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user);
        $this->createStatement($account, '2024-12-31', 1000);
        $this->createStatement($account, '2025-01-31', 1100);
        $this->createStatement($account, '2025-02-28', 1125);
        $this->createLineItem($account, ['t_date' => '2025-01-10', 't_type' => 'Deposit', 't_amt' => 100]);
        $this->createLineItem($account, ['t_date' => '2025-01-15', 't_type' => 'Fee', 't_amt' => -10]);

        $series = app(FeeAnalyticsService::class)->monthlyFeeDragSeries((int) $account->acct_id, 2025);

        $this->assertCount(12, $series);
        foreach ($series as $row) {
            $this->assertEqualsWithDelta($row['gross_return'], $row['net_return'] + $row['fees'], 0.001);
        }
    }

    public function test_reconcile_k1_fees_flags_unclassified_when_13zz_has_no_fee_subtotal(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user);
        $this->createLineItem($account, ['t_type' => 'Fee', 't_amt' => -100])
            ->tags()
            ->attach($this->createFeeTag($user, 'fee_schE')->tag_id);
        $document = $this->createK1Document($user, ['13' => [['code' => 'ZZ', 'value' => '100']]]);
        TaxDocumentAccount::createLink($document->id, $account->acct_id, 'k1', 2025, isReviewed: true);

        $rows = app(FeeAnalyticsService::class)->reconcileK1Fees((int) $account->acct_id, 2025);

        $this->assertSame('unclassified', $rows[0]['status']);
    }

    public function test_reconcile_k1_fees_flags_mismatch_when_delta_exceeds_threshold(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user);
        $this->createLineItem($account, ['t_type' => 'Fee', 't_amt' => -100])
            ->tags()
            ->attach($this->createFeeTag($user, 'fee_schE')->tag_id);
        $document = $this->createK1Document($user, ['13' => [['code' => 'L', 'value' => '50']]]);
        TaxDocumentAccount::createLink($document->id, $account->acct_id, 'k1', 2025, isReviewed: true);

        $rows = app(FeeAnalyticsService::class)->reconcileK1Fees((int) $account->acct_id, 2025);

        $this->assertSame('mismatch', $rows[0]['status']);
        $this->assertSame(50.0, $rows[0]['delta_schE']);
    }

    public function test_reconcile_k1_fees_flags_match_when_deltas_are_within_threshold(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user);
        $this->createLineItem($account, ['t_type' => 'Fee', 't_amt' => -100])
            ->tags()
            ->attach($this->createFeeTag($user, 'fee_schE')->tag_id);
        $this->createLineItem($account, ['t_type' => 'Fee', 't_amt' => -25])
            ->tags()
            ->attach($this->createFeeTag($user, 'fee_irc67g')->tag_id);
        $document = $this->createK1Document($user, [
            '13' => [
                ['code' => 'L', 'value' => '100.50'],
                ['code' => 'K', 'value' => '24.50'],
            ],
        ]);
        TaxDocumentAccount::createLink($document->id, $account->acct_id, 'k1', 2025, isReviewed: true);

        $rows = app(FeeAnalyticsService::class)->reconcileK1Fees((int) $account->acct_id, 2025);

        $this->assertSame('match', $rows[0]['status']);
    }

    public function test_fee_api_endpoints_return_shape_require_auth_and_scope_accounts(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $account = $this->createAccount($user, ['expected_fee_flat' => 120]);
        $this->createLineItem($account, ['t_type' => 'Fee', 't_amt' => -40]);

        $this->getJson("/api/finance/{$account->acct_id}/fees?year=2025")->assertUnauthorized();
        $this->actingAs($otherUser)
            ->getJson("/api/finance/{$account->acct_id}/fees?year=2025")
            ->assertNotFound();

        $this->actingAs($user)
            ->getJson("/api/finance/{$account->acct_id}/fees?year=2025")
            ->assertOk()
            ->assertJsonPath('year', 2025)
            ->assertJsonPath('actual.total', 40)
            ->assertJsonStructure([
                'account',
                'actual' => ['total', 'by_characteristic', 'line_items'],
                'expected' => ['total', 'has_expectation'],
                'monthly_fee_drag',
                'reconciliation',
            ]);

        $this->actingAs($user)
            ->getJson('/api/finance/all/fees?year=2025')
            ->assertOk()
            ->assertJsonStructure([
                'totals' => ['total', 'by_characteristic'],
                'accounts',
                'monthly_fee_drag',
                'reconciliation_summary' => ['matched', 'mismatched', 'unclassified', 'unlinked'],
            ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createAccount(User $user, array $overrides = []): FinAccounts
    {
        return FinAccounts::withoutEvents(fn (): FinAccounts => FinAccounts::withoutGlobalScopes()->forceCreate(array_merge([
            'acct_owner' => $user->id,
            'acct_name' => fake()->unique()->word(),
            'acct_last_balance' => '10000',
        ], $overrides)));
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createLineItem(FinAccounts $account, array $overrides = []): FinAccountLineItems
    {
        return FinAccountLineItems::forceCreate(array_merge([
            't_account' => $account->acct_id,
            't_date' => '2025-01-15',
            't_type' => 'Fee',
            't_amt' => -10,
            't_fee' => 0,
            't_description' => 'Investment management fee',
        ], $overrides));
    }

    private function createFeeTag(User $user, string $taxCharacteristic, string $label = 'Investment Fee'): FinAccountTag
    {
        return FinAccountTag::create([
            'tag_userid' => (string) $user->id,
            'tag_label' => $label.' '.$taxCharacteristic,
            'tag_color' => '#2563eb',
            'tax_characteristic' => $taxCharacteristic,
        ]);
    }

    private function createStatement(FinAccounts $account, string $closingDate, float $balance): FinStatement
    {
        return FinStatement::create([
            'acct_id' => $account->acct_id,
            'balance' => (string) $balance,
            'statement_opening_date' => substr($closingDate, 0, 8).'01',
            'statement_closing_date' => $closingDate,
        ]);
    }

    /**
     * @param  array<string, array<int, array<string, mixed>>>  $codes
     */
    private function createK1Document(User $user, array $codes): FileForTaxDocument
    {
        return app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'form_type' => 'k1',
            'original_filename' => 'k1.pdf',
            'stored_filename' => fake()->uuid().'.pdf',
            's3_path' => '',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 0,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $user->id,
            'is_reviewed' => true,
            'parsed_data' => [
                'schemaVersion' => '2026.1',
                'formType' => 'K-1-1065',
                'fields' => ['B' => ['value' => 'Example Fund LP']],
                'codes' => $codes,
            ],
        ]);
    }
}
