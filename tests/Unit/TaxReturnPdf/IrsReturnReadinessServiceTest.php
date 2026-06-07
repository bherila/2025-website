<?php

namespace Tests\Unit\TaxReturnPdf;

use App\Models\FinanceTool\FinTaxReturnProfile;
use App\Models\User;
use App\Services\Finance\TaxReturnPdf\IrsReturnReadinessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IrsReturnReadinessServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_complete_return_requires_profile_fields_and_blocks_unsupported_forms(): void
    {
        $user = User::factory()->create();

        $readiness = app(IrsReturnReadinessService::class)->forRequest(
            user: $user,
            year: 2025,
            scope: 'return',
            formId: null,
            mode: 'editable',
            profile: null,
            facts: ['form1040' => ['line8' => 100]],
        );

        $this->assertFalse($readiness->isReady());
        $this->assertContains('schedule-1', $readiness->unsupportedForms);
        $this->assertNotEmpty(array_filter(
            $readiness->errors,
            static fn (string $error): bool => str_contains($error, 'taxpayer first name'),
        ));
    }

    public function test_individual_form_reports_missing_profile_as_warnings_but_engine_as_error(): void
    {
        $user = User::factory()->create();

        $readiness = app(IrsReturnReadinessService::class)->forRequest(
            user: $user,
            year: 2025,
            scope: 'form',
            formId: 'form-1040',
            mode: 'editable',
            profile: null,
            facts: ['form1040' => []],
        );

        $this->assertFalse($readiness->isReady());
        $this->assertNotEmpty($readiness->warnings);
        $this->assertNotEmpty(array_filter(
            $readiness->errors,
            static fn (string $error): bool => str_contains($error, 'qpdf normalization'),
        ));
    }

    public function test_complete_return_profile_requirements_pass_for_complete_single_profile(): void
    {
        $user = User::factory()->create();
        $profile = FinTaxReturnProfile::factory()->for($user, 'user')->create();

        $readiness = app(IrsReturnReadinessService::class)->forRequest(
            user: $user,
            year: 2025,
            scope: 'return',
            formId: null,
            mode: 'editable',
            profile: $profile,
            facts: ['form1040' => []],
        );

        $this->assertEmpty(array_filter(
            $readiness->errors,
            static fn (string $error): bool => str_contains($error, 'requires taxpayer first name'),
        ));
        $this->assertNotEmpty(array_filter(
            $readiness->errors,
            static fn (string $error): bool => str_contains($error, 'Editable complete-return merge'),
        ));
    }
}
