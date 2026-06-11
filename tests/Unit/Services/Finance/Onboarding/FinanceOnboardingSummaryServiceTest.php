<?php

namespace Tests\Unit\Services\Finance\Onboarding;

use App\Models\CareerJob;
use App\Models\FinanceTool\FinAccounts;
use App\Models\User;
use App\Services\Finance\Onboarding\FinanceOnboardingSummaryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinanceOnboardingSummaryServiceTest extends TestCase
{
    use RefreshDatabase;

    private FinanceOnboardingSummaryService $service;

    /** @var list<string> */
    private array $allFinancePermissions = [
        'finance.access',
        'finance.accounts.manage',
        'finance.transactions.manage',
        'finance.lots.manage',
        'finance.tax-preview.manage',
        'finance.tax-documents.manage',
        'finance.rsu.manage',
        'finance.payslips.manage',
        'finance.rules.manage',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        // Consume admin user ID 1 so test users are non-admin.
        User::factory()->create(['user_role' => 'admin']);
        $this->service = app(FinanceOnboardingSummaryService::class);
    }

    public function test_resolve_year_prefers_explicit_valid_request_year(): void
    {
        $this->assertSame(2022, $this->service->resolveYear(2022, [2024, 2023]));
    }

    public function test_resolve_year_falls_back_to_latest_available_year(): void
    {
        $this->assertSame(2024, $this->service->resolveYear(null, [2024, 2023]));
    }

    public function test_resolve_year_falls_back_to_current_year_when_no_data(): void
    {
        $this->assertSame((int) date('Y'), $this->service->resolveYear(null, []));
    }

    public function test_resolve_year_rejects_out_of_range_request_year(): void
    {
        $this->assertSame(2024, $this->service->resolveYear(1800, [2024]));
        $this->assertSame(2024, $this->service->resolveYear(2200, [2024]));
    }

    public function test_accounts_section_not_started_for_blank_user(): void
    {
        $user = $this->grantFeatures(User::factory()->create(), $this->allFinancePermissions);

        $summary = $this->service->summaryForYear($user, 2024);

        $accounts = $this->section($summary, 'accounts');
        $this->assertSame('not_started', $accounts['status']);
        $this->assertSame(0, $accounts['counts']['accounts']);
    }

    public function test_accounts_section_ready_when_account_exists(): void
    {
        $user = $this->grantFeatures(User::factory()->create(), $this->allFinancePermissions);
        $this->actingAs($user);
        $this->makeFinAccount($user);

        $summary = $this->service->summaryForYear($user, 2024);

        $this->assertSame('ready', $this->section($summary, 'accounts')['status']);
    }

    public function test_employment_section_in_progress_with_only_career_job(): void
    {
        $user = $this->grantFeatures(User::factory()->create(), $this->allFinancePermissions);
        CareerJob::query()->create([
            'user_id' => $user->id,
            'kind' => 'current',
            'name' => 'Engineer',
            'spec_json' => [],
        ]);

        $summary = $this->service->summaryForYear($user, 2024);

        $employment = $this->section($summary, 'employment');
        $this->assertSame('in_progress', $employment['status']);
        $this->assertSame(1, $employment['counts']['current_career_job']);
        $this->assertSame(0, $employment['counts']['employment_entities']);
    }

    public function test_no_access_sections_carry_no_counts_or_summary(): void
    {
        $user = $this->grantFeatures(User::factory()->create(), ['finance.access']);

        $summary = $this->service->summaryForYear($user, 2024);

        $accounts = $this->section($summary, 'accounts');
        $this->assertSame('no_access', $accounts['status']);
        $this->assertArrayNotHasKey('counts', $accounts);
        $this->assertSame('', $accounts['summary']);
        $this->assertSame([], $accounts['actions']);
    }

    public function test_action_generation_filters_unheld_permissions(): void
    {
        $user = $this->grantFeatures(User::factory()->create(), ['finance.access', 'finance.accounts.detail']);
        $this->actingAs($user);
        $this->makeFinAccount($user);

        $summary = $this->service->summaryForYear($user, 2024);

        $accounts = $this->section($summary, 'accounts');
        $actionIds = array_column($accounts['actions'], 'id');
        $this->assertNotContains('accounts.add', $actionIds);
        $this->assertContains('accounts.view', $actionIds);
    }

    public function test_overall_readiness_promotes_actionable_sections_to_primary_actions(): void
    {
        $user = $this->grantFeatures(User::factory()->create(), $this->allFinancePermissions);

        $summary = $this->service->summaryForYear($user, 2024);

        // Blank user has actionable (not_started/needs_attention/in_progress) sections.
        $this->assertNotEmpty($summary['primaryActions']);
        foreach ($summary['primaryActions'] as $action) {
            $this->assertSame('primary', $action['kind']);
        }
    }

    public function test_lots_section_hides_reconciliation_without_tax_preview_permission(): void
    {
        $user = $this->grantFeatures(User::factory()->create(), ['finance.access', 'finance.lots.view']);
        $this->actingAs($user);
        $this->makeFinAccount($user);

        $summary = $this->service->summaryForYear($user, 2024);

        $lots = $this->section($summary, 'lots');
        $this->assertArrayHasKey('lots', $lots['counts']);
        $this->assertArrayNotHasKey('reconciliation_drift', $lots['counts']);
        $this->assertArrayNotHasKey('reconciliation_blocked', $lots['counts']);
        $this->assertNotSame('needs_attention', $lots['status']);
        $this->assertStringNotContainsStringIgnoringCase('reconciliation', $lots['summary']);

        foreach ($summary['warnings'] as $warning) {
            $this->assertNotSame('warning.lots', $warning['id']);
        }
    }

    public function test_categorization_section_hides_rule_count_without_rules_manage(): void
    {
        $user = $this->grantFeatures(User::factory()->create(), ['finance.access', 'finance.accounts.basic', 'finance.transactions.view']);

        $summary = $this->service->summaryForYear($user, 2024);

        $categorization = $this->section($summary, 'categorization');
        $this->assertArrayHasKey('tags', $categorization['counts']);
        $this->assertArrayNotHasKey('rules', $categorization['counts']);
        $this->assertStringNotContainsStringIgnoringCase('rule', $categorization['summary']);
    }

    /**
     * @param  array{sections: list<array<string, mixed>>}  $summary
     * @return array<string, mixed>
     */
    private function section(array $summary, string $id): array
    {
        foreach ($summary['sections'] as $section) {
            if ($section['id'] === $id) {
                return $section;
            }
        }

        $this->fail("Section {$id} not found");
    }

    private function makeFinAccount(User $user): FinAccounts
    {
        return FinAccounts::withoutEvents(function () use ($user): FinAccounts {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $user->id,
                'acct_name' => 'Test Brokerage',
                'acct_number' => '9999',
                'acct_last_balance' => '0',
            ]);
        });
    }
}
