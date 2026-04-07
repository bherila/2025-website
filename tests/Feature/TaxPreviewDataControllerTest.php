<?php

namespace Tests\Feature;

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
}
