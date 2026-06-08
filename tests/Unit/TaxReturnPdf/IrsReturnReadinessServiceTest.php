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

    public function test_form_8949_requirement_also_requires_schedule_d_even_when_form_1040_line_7_is_zero(): void
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
                'form1040' => ['line7' => 0],
                'form8949' => ['rowCount' => 1],
                'irsPdf' => ['form8949' => ['unsupportedRowCount' => 0]],
            ],
        );

        $this->assertTrue($readiness->isReady());
        $this->assertSame(['form-1040', 'schedule-d', 'form-8949'], $readiness->requiredForms);
    }

    public function test_summary_schedule_d_lines_block_form_8949_when_no_detail_rows_are_available(): void
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
                'form1040' => ['line7' => 25],
                'scheduleD' => ['line2GainLoss' => 25],
                'form8949' => ['rowCount' => 0, 'rows' => []],
                'irsPdf' => ['form8949' => ['instances' => [], 'unsupportedRowCount' => 0]],
            ],
        );

        $this->assertFalse($readiness->isReady());
        $this->assertContains('form-8949', $readiness->requiredForms);
        $this->assertNotEmpty(array_filter(
            $readiness->errors,
            static fn (string $error): bool => str_contains($error, 'no supported Form 8949 rows are available'),
        ));
    }

    public function test_foreign_tax_under_direct_schedule_3_threshold_does_not_require_form_1116(): void
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
                'form1040' => [
                    'filingStatus' => 'single',
                    'line16' => 100,
                    'line20' => 25,
                ],
                'schedule3' => [
                    'line1ForeignTaxCredit' => 25,
                    'line8TotalNonrefundableCredits' => 25,
                ],
                'form1116' => [
                    'totalForeignTaxes' => 25,
                    'creditValue' => 25,
                    'totalGeneralIncome' => 0,
                    'totalLine4b' => 0,
                    'totalSourcedByPartnerIncome' => 0,
                    'hasUserOverride' => false,
                    'passiveIncomeSources' => [
                        ['sourceType' => '1099_div_foreign_tax', 'amount' => 100, 'isReviewed' => true, 'reviewStatus' => 'reviewed'],
                    ],
                    'foreignTaxSources' => [
                        ['sourceType' => '1099_div_foreign_tax', 'amount' => 25],
                    ],
                ],
            ],
        );

        $this->assertTrue($readiness->isReady());
        $this->assertSame(['form-1040', 'schedule-3'], $readiness->requiredForms);
        $this->assertNotContains('form-1116', $readiness->unsupportedForms);
    }

    public function test_direct_schedule_3_foreign_tax_is_limited_to_regular_tax(): void
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
                'form1040' => [
                    'filingStatus' => 'single',
                    'line16' => 10,
                    'line20' => 25,
                ],
                'schedule3' => [
                    'line1ForeignTaxCredit' => 25,
                    'line8TotalNonrefundableCredits' => 25,
                ],
                'form1116' => [
                    'totalForeignTaxes' => 25,
                    'creditValue' => 25,
                    'totalGeneralIncome' => 0,
                    'totalLine4b' => 0,
                    'totalSourcedByPartnerIncome' => 0,
                    'hasUserOverride' => false,
                    'passiveIncomeSources' => [
                        ['sourceType' => '1099_div_foreign_tax', 'amount' => 100, 'isReviewed' => true, 'reviewStatus' => 'reviewed'],
                    ],
                    'foreignTaxSources' => [
                        ['sourceType' => '1099_div_foreign_tax', 'amount' => 25],
                    ],
                ],
            ],
        );

        $this->assertFalse($readiness->isReady());
        $this->assertContains('form-1116', $readiness->unsupportedForms);
    }

    public function test_k1_only_foreign_tax_still_requires_form_1116(): void
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
                'form1040' => [
                    'filingStatus' => 'single',
                    'line16' => 100,
                    'line20' => 25,
                ],
                'schedule3' => [
                    'line1ForeignTaxCredit' => 25,
                    'line8TotalNonrefundableCredits' => 25,
                ],
                'form1116' => [
                    'totalForeignTaxes' => 25,
                    'creditValue' => 25,
                    'totalGeneralIncome' => 0,
                    'totalLine4b' => 0,
                    'totalSourcedByPartnerIncome' => 0,
                    'hasUserOverride' => false,
                    'passiveIncomeSources' => [
                        ['sourceType' => 'k1_foreign_tax', 'amount' => 100, 'isReviewed' => true, 'reviewStatus' => 'reviewed'],
                    ],
                    'foreignTaxSources' => [
                        ['sourceType' => 'k1_foreign_tax', 'amount' => 25],
                    ],
                ],
            ],
        );

        $this->assertFalse($readiness->isReady());
        $this->assertContains('form-1116', $readiness->unsupportedForms);
    }

    public function test_estimated_foreign_source_income_still_requires_form_1116(): void
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
                'form1040' => [
                    'filingStatus' => 'single',
                    'line16' => 100,
                    'line20' => 25,
                ],
                'schedule3' => [
                    'line1ForeignTaxCredit' => 25,
                    'line8TotalNonrefundableCredits' => 25,
                ],
                'form1116' => [
                    'totalForeignTaxes' => 25,
                    'creditValue' => 25,
                    'totalGeneralIncome' => 0,
                    'totalLine4b' => 0,
                    'totalSourcedByPartnerIncome' => 0,
                    'hasUserOverride' => false,
                    'passiveIncomeSources' => [
                        ['sourceType' => '1099_div_foreign_tax', 'amount' => 166.67, 'isReviewed' => false, 'reviewStatus' => 'needs_review'],
                    ],
                    'foreignTaxSources' => [
                        ['sourceType' => '1099_div_foreign_tax', 'amount' => 25],
                    ],
                ],
            ],
        );

        $this->assertFalse($readiness->isReady());
        $this->assertContains('form-1116', $readiness->unsupportedForms);
    }

    public function test_foreign_tax_above_direct_schedule_3_threshold_still_requires_form_1116(): void
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
                'form1040' => [
                    'filingStatus' => 'single',
                    'line20' => 301,
                ],
                'schedule3' => [
                    'line1ForeignTaxCredit' => 301,
                    'line8TotalNonrefundableCredits' => 301,
                ],
                'form1116' => [
                    'totalForeignTaxes' => 301,
                    'creditValue' => 301,
                    'totalGeneralIncome' => 0,
                    'totalLine4b' => 0,
                    'totalSourcedByPartnerIncome' => 0,
                    'hasUserOverride' => false,
                    'foreignTaxSources' => [
                        ['sourceType' => '1099_div_foreign_tax', 'amount' => 301],
                    ],
                ],
            ],
        );

        $this->assertFalse($readiness->isReady());
        $this->assertContains('form-1116', $readiness->unsupportedForms);
    }

    public function test_schedule_3_line_7_blocks_when_line_6_details_are_missing(): void
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
                'form1040' => ['line20' => 50],
                'schedule3' => [
                    'line6Sources' => [],
                    'line7OtherNonrefundableCredits' => 50,
                    'line8TotalNonrefundableCredits' => 50,
                ],
            ],
        );

        $this->assertFalse($readiness->isReady());
        $this->assertContains('schedule-3', $readiness->requiredForms);
        $this->assertNotEmpty(array_filter(
            $readiness->errors,
            static fn (string $error): bool => str_contains($error, 'without supported line 6 details'),
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
