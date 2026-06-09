<?php

namespace Tests\Feature\FinanceTool;

use App\Models\User;
use App\Services\Finance\TaxPreviewFactsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Tests\TestCase;

class TaxReturnPdfExportOptionsControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_endpoint_requires_authentication(): void
    {
        $response = $this->getJson('/finance/tax-preview/pdf-export-options?year=2025');

        $response->assertUnauthorized();
    }

    public function test_year_is_validated(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/finance/tax-preview/pdf-export-options');

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors('year');
    }

    public function test_returns_supported_recommended_and_default_pii_warning(): void
    {
        $user = User::factory()->create();
        $this->mock(TaxPreviewFactsService::class, function (MockInterface $mock) use ($user): void {
            $mock->shouldReceive('arrayForYear')
                ->once()
                ->with((int) $user->id, 2025)
                ->andReturn([
                    'form1040' => ['line8' => 42.0],
                    'schedule1' => ['line9TotalOtherIncome' => 42.0],
                ]);
        });

        $response = $this->actingAs($user)->getJson('/finance/tax-preview/pdf-export-options?year=2025');

        $response->assertOk();
        $response->assertJsonPath('year', 2025);
        $response->assertJsonPath('allSupportedFormIds', ['form-1040', 'schedule-1', 'schedule-3', 'schedule-d', 'form-8949']);
        $response->assertJsonPath('recommendedFormIds', ['form-1040', 'schedule-1']);
        $response->assertJsonPath('unsupportedRequiredForms', []);
        $response->assertJsonCount(5, 'supportedForms');
        $response->assertJsonPath('supportedForms.0.id', 'form-1040');
        $response->assertJsonPath('supportedForms.0.recommended', true);

        $this->assertNotEmpty(array_filter(
            $response->json('warnings'),
            static fn (string $warning): bool => str_contains($warning, 'not included by default'),
        ));
    }

    public function test_surfaces_unsupported_required_forms_and_warnings(): void
    {
        $user = User::factory()->create();
        $this->mock(TaxPreviewFactsService::class, function (MockInterface $mock) use ($user): void {
            $mock->shouldReceive('arrayForYear')
                ->once()
                ->with((int) $user->id, 2025)
                ->andReturn([
                    'form1040' => ['line8' => 0.0],
                    'scheduleC' => ['netProfitRoutedToSchedule1' => 1500.0],
                ]);
        });

        $response = $this->actingAs($user)->getJson('/finance/tax-preview/pdf-export-options?year=2025');

        $response->assertOk();
        $response->assertJsonPath('unsupportedRequiredForms.0.id', 'schedule-c');
        $this->assertNotEmpty(array_filter(
            $response->json('warnings'),
            static fn (string $warning): bool => str_contains($warning, 'schedule-c'),
        ));
    }
}
