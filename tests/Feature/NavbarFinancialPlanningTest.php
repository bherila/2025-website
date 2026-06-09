<?php

namespace Tests\Feature;

use App\Models\UserFeaturePermission;
use Tests\TestCase;

class NavbarFinancialPlanningTest extends TestCase
{
    public function test_guest_nav_groups_games_and_public_finance_tools(): void
    {
        $this->withoutVite();

        $response = $this->get('/');

        $response->assertOk();

        $payload = $this->payloadFromResponse($response->getContent());
        $navItems = $payload['navItems'];
        $this->assertSame(['Recipes', 'Projects', 'Finance', 'Tools'], array_column($navItems, 'label'));

        $projects = $this->navItemByLabel($navItems, 'Projects');
        $this->assertSame('dropdown', $projects['type']);
        $this->assertSame([
            '/projects',
            '/games/parking-pickup',
            '/games/marble-sort',
            '/tools/bingo',
        ], array_column($projects['items'], 'href'));
        $this->assertContains('Marble Sort', array_column($projects['items'], 'label'));

        $finance = $this->navItemByLabel($navItems, 'Finance');
        $this->assertSame('dropdown', $finance['type']);
        $financeHrefs = array_column($finance['items'], 'href');
        $this->assertContains('/tools/irs-f461', $financeHrefs);
        $this->assertContains('/financial-planning/rent-vs-buy', $financeHrefs);
        $this->assertNotContains('/finance/accounts', $financeHrefs);
        $this->assertNotContains('/finance/tax-preview', $financeHrefs);

        $tools = $this->navItemByLabel($navItems, 'Tools');
        $toolHrefs = array_column($tools['items'], 'href');
        $this->assertContains('/tools/license-manager', $toolHrefs);
        $this->assertContains('/tools/address-labels', $toolHrefs);
        $this->assertContains('/tools/markdown', $toolHrefs);
        $this->assertNotContains('/tools/bingo', $toolHrefs);
        $this->assertNotContains('/games/parking-pickup', $toolHrefs);
        $this->assertNotContains('/tools/irs-f461', $toolHrefs);
        $this->assertSame([], $payload['accountMenuItems']);
    }

    public function test_logged_in_nav_keeps_private_finance_and_utility_links_server_filtered(): void
    {
        $this->withoutVite();
        $user = $this->createUser(['id' => 2]);
        foreach ([
            'finance.accounts.detail',
            'finance.transactions.view',
            'finance.tax-preview.view',
            'utility-bills.view',
        ] as $permission) {
            UserFeaturePermission::query()->create([
                'user_id' => $user->id,
                'permission' => $permission,
            ]);
        }

        $response = $this->actingAs($user)->get('/');

        $response->assertOk();

        $payload = $this->payloadFromResponse($response->getContent());
        $navItems = $payload['navItems'];
        $this->assertSame(['Recipes', 'Projects', 'Finance', 'Tools'], array_column($navItems, 'label'));

        $finance = $this->navItemByLabel($navItems, 'Finance');
        $this->assertSame('dropdown', $finance['type']);
        $financeHrefs = array_column($finance['items'], 'href');
        $this->assertContains('/finance/accounts', $financeHrefs);
        $this->assertContains('/finance/all-transactions', $financeHrefs);
        $this->assertContains('/finance/tax-preview', $financeHrefs);
        $this->assertContains('/utility-bill-tracker', $financeHrefs);
        $this->assertContains('/tools/irs-f461', $financeHrefs);
        $this->assertContains('/financial-planning/rent-vs-buy', $financeHrefs);

        $tools = $this->navItemByLabel($navItems, 'Tools');
        $toolHrefs = array_column($tools['items'], 'href');
        $this->assertContains('/phr', $toolHrefs);
        $this->assertContains('/tools/class-action-tracker', $toolHrefs);
        $this->assertNotContains('/admin/users', $toolHrefs);
        $this->assertSame(['User Settings'], array_column($payload['accountMenuItems'], 'label'));
    }

    public function test_admin_links_are_hydrated_in_account_menu_not_main_nav(): void
    {
        $this->withoutVite();
        $admin = $this->createAdminUser();

        $response = $this->actingAs($admin)->get('/');

        $response->assertOk();

        $payload = $this->payloadFromResponse($response->getContent());
        $navLabels = $this->nestedNavLabels($payload['navItems']);

        $this->assertNotContains('User Management', $navLabels);
        $this->assertNotContains('GenAI Jobs', $navLabels);
        $this->assertNotContains('Tax Normalization Review', $navLabels);
        $this->assertNotContains('Client Management', $navLabels);
        $this->assertNotContains('All Invoices', $navLabels);

        $this->assertSame([
            'User Settings',
            'Admin',
            'User Management',
            'GenAI Jobs',
            'Tax Normalization Review',
            'Client Management',
            'All Invoices',
        ], array_column($payload['accountMenuItems'], 'label'));

        $this->assertContains('/admin/users', array_column($payload['accountMenuItems'], 'href'));
        $this->assertContains('/admin/genai-jobs', array_column($payload['accountMenuItems'], 'href'));
        $this->assertContains('/admin/tax-normalization-review', array_column($payload['accountMenuItems'], 'href'));
        $this->assertContains('/client/mgmt', array_column($payload['accountMenuItems'], 'href'));
        $this->assertContains('/client/mgmt/invoices', array_column($payload['accountMenuItems'], 'href'));
    }

    /**
     * @return array{navItems: array<int, array<string, mixed>>, accountMenuItems: array<int, array<string, mixed>>}
     */
    private function payloadFromResponse(string $html): array
    {
        preg_match('/<script id="app-initial-data"[^>]*>\s*(.*?)\s*<\/script>/s', $html, $matches);
        $this->assertArrayHasKey(1, $matches);

        /** @var array{navItems: array<int, array<string, mixed>>, accountMenuItems: array<int, array<string, mixed>>} $payload */
        $payload = json_decode($matches[1], true, 512, JSON_THROW_ON_ERROR);

        return $payload;
    }

    /**
     * @param  array<int, array<string, mixed>>  $navItems
     * @return array<string, mixed>
     */
    private function navItemByLabel(array $navItems, string $label): array
    {
        foreach ($navItems as $navItem) {
            if (($navItem['label'] ?? null) === $label) {
                return $navItem;
            }
        }

        $this->fail("Expected nav item [{$label}] to exist.");
    }

    /**
     * @param  array<int, array<string, mixed>>  $navItems
     * @return list<string>
     */
    private function nestedNavLabels(array $navItems): array
    {
        $labels = [];

        foreach ($navItems as $navItem) {
            if (isset($navItem['label']) && is_string($navItem['label'])) {
                $labels[] = $navItem['label'];
            }

            $children = $navItem['items'] ?? [];

            if (! is_array($children)) {
                continue;
            }

            foreach ($children as $child) {
                if (isset($child['label']) && is_string($child['label'])) {
                    $labels[] = $child['label'];
                }
            }
        }

        return $labels;
    }
}
