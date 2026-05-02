<?php

namespace Tests\Feature;

use Tests\TestCase;

class NavbarFinancialPlanningTest extends TestCase
{
    public function test_logged_out_nav_includes_public_financial_planning_dropdown(): void
    {
        $this->withoutVite();

        $response = $this->get('/');

        $response->assertOk();

        $navItems = $this->navItemsFromResponse($response->getContent());
        $this->assertSame(['Recipes', 'Projects', 'Financial Planning', 'Tools'], array_column($navItems, 'label'));

        $financialPlanning = $this->navItemByLabel($navItems, 'Financial Planning');
        $this->assertSame('dropdown', $financialPlanning['type']);
        $this->assertSame([
            '/financial-planning',
            '/financial-planning/retirement-contribution-calculator',
            '/financial-planning/rent-vs-buy',
        ], array_column($financialPlanning['items'], 'href'));
        $this->assertContains('Retirement Contribution Calculator', array_column($financialPlanning['items'], 'label'));
    }

    public function test_logged_in_nav_keeps_finance_and_financial_planning_separate(): void
    {
        $this->withoutVite();
        $user = $this->createUser();

        $response = $this->actingAs($user)->get('/');

        $response->assertOk();

        $navItems = $this->navItemsFromResponse($response->getContent());
        $this->assertSame(['Recipes', 'Projects', 'Finance', 'Financial Planning', 'Tools'], array_column($navItems, 'label'));

        $finance = $this->navItemByLabel($navItems, 'Finance');
        $financialPlanning = $this->navItemByLabel($navItems, 'Financial Planning');

        $this->assertSame('dropdown', $finance['type']);
        $this->assertSame('dropdown', $financialPlanning['type']);
        $this->assertContains('/finance/tax-preview', array_column($finance['items'], 'href'));
        $this->assertContains('/financial-planning/rent-vs-buy', array_column($financialPlanning['items'], 'href'));
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function navItemsFromResponse(string $html): array
    {
        preg_match('/<script id="app-initial-data"[^>]*>\s*(.*?)\s*<\/script>/s', $html, $matches);
        $this->assertArrayHasKey(1, $matches);

        /** @var array{navItems: array<int, array<string, mixed>>} $payload */
        $payload = json_decode($matches[1], true, 512, JSON_THROW_ON_ERROR);

        return $payload['navItems'];
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
}
