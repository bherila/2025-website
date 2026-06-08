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

    public function test_complete_return_requires_profile_fields_and_includes_supported_schedules(): void
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
        $this->assertContains('schedule-1', $readiness->requiredForms);
        $this->assertNotContains('schedule-1', $readiness->unsupportedForms);
        $this->assertNotEmpty(array_filter(
            $readiness->errors,
            static fn (string $error): bool => str_contains($error, 'taxpayer first name'),
        ));
    }

    public function test_complete_return_still_blocks_when_an_unsupported_dependent_form_is_required(): void
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
            facts: [
                'form1040' => ['line8' => 100],
                'scheduleC' => ['netProfitRoutedToSchedule1' => 100],
            ],
        );

        $this->assertFalse($readiness->isReady());
        $this->assertContains('schedule-1', $readiness->requiredForms);
        $this->assertContains('schedule-c', $readiness->unsupportedForms);
        $this->assertNotEmpty(array_filter(
            $readiness->errors,
            static fn (string $error): bool => str_contains($error, 'schedule-c appears required'),
        ));
    }

    public function test_form_8949_rows_without_supported_boxes_block_export(): void
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
            facts: [
                'form1040' => ['line7' => 100],
                'form8949' => ['rowCount' => 1],
                'irsPdf' => ['form8949' => ['unsupportedRowCount' => 1]],
            ],
        );

        $this->assertFalse($readiness->isReady());
        $this->assertContains('schedule-d', $readiness->requiredForms);
        $this->assertContains('form-8949', $readiness->requiredForms);
        $this->assertNotEmpty(array_filter(
            $readiness->errors,
            static fn (string $error): bool => str_contains($error, 'Form 8949 export is blocked'),
        ));
    }

    public function test_individual_form_reports_missing_profile_as_warnings_without_blocking_export(): void
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

        $this->assertTrue($readiness->isReady());
        $this->assertNotEmpty($readiness->warnings);
        $this->assertSame([], $readiness->errors);
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

        $this->assertTrue($readiness->isReady());
        $this->assertSame([], $readiness->errors);
    }
}
