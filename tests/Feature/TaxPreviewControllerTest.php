<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaxPreviewControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_tax_preview_page_loads_for_authenticated_user(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->get('/finance/tax-preview');

        $response->assertStatus(200);
        $response->assertSee('TaxPreviewPage');
        $response->assertSee('tax-preview-data');
    }

    public function test_tax_preview_page_accepts_year_parameter(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->get('/finance/tax-preview?year=2024');

        $response->assertStatus(200);
        $response->assertSee('tax-preview-data');
    }

    public function test_tax_preview_page_preload_contains_expected_keys(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->get('/finance/tax-preview?year=2025');

        $response->assertStatus(200);

        // Extract the preload JSON from the response
        $content = $response->getContent();
        preg_match('/<script id="tax-preview-data" type="application\/json">\s*(.*?)\s*<\/script>/s', $content, $matches);
        $this->assertNotEmpty($matches[1] ?? '', 'Preload script tag should contain JSON');

        $preload = json_decode($matches[1], true);
        $this->assertIsArray($preload);
        $this->assertArrayHasKey('year', $preload);
        $this->assertArrayHasKey('availableYears', $preload);
        $this->assertArrayHasKey('payslips', $preload);
        $this->assertArrayHasKey('pendingReviewCount', $preload);
        $this->assertArrayHasKey('reviewedW2Docs', $preload);
        $this->assertArrayHasKey('reviewed1099Docs', $preload);
        $this->assertArrayHasKey('scheduleCData', $preload);
        $this->assertArrayHasKey('employmentEntities', $preload);

        $this->assertEquals(2025, $preload['year']);
        $this->assertIsArray($preload['availableYears']);
        $this->assertIsArray($preload['payslips']);
        $this->assertIsInt($preload['pendingReviewCount']);
    }

    public function test_tax_preview_page_requires_authentication(): void
    {
        $response = $this->get('/finance/tax-preview');

        $response->assertRedirect('/login');
    }

    public function test_schedule_c_redirect_works(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->get('/finance/schedule-c');

        $response->assertRedirect('/finance/tax-preview');
    }

    public function test_tax_preview_defaults_to_current_year(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->get('/finance/tax-preview');

        $response->assertStatus(200);

        $content = $response->getContent();
        preg_match('/<script id="tax-preview-data" type="application\/json">\s*(.*?)\s*<\/script>/s', $content, $matches);

        $preload = json_decode($matches[1] ?? '', true);
        $this->assertEquals((int) date('Y'), $preload['year']);
    }
}
