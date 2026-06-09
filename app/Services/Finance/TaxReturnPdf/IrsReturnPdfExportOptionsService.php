<?php

namespace App\Services\Finance\TaxReturnPdf;

use App\Models\User;
use App\Services\Finance\TaxPreviewFactsService;
use App\Services\Finance\TaxReturnPdf\Data\TaxReturnPdfOptions;

class IrsReturnPdfExportOptionsService
{
    private const array FORM_METADATA = [
        'form-1040' => ['label' => 'Form 1040 — U.S. Individual Income Tax Return', 'category' => 'Form'],
        'schedule-1' => ['label' => 'Schedule 1 — Additional Income & Adjustments', 'category' => 'Schedule'],
        'schedule-3' => ['label' => 'Schedule 3 — Additional Credits & Payments', 'category' => 'Schedule'],
        'schedule-d' => ['label' => 'Schedule D — Capital Gains & Losses', 'category' => 'Schedule'],
        'form-8949' => ['label' => 'Form 8949 — Sales & Dispositions of Capital Assets', 'category' => 'Form'],
    ];

    private const array UNSUPPORTED_LABELS = [
        'schedule-b' => 'Schedule B',
        'schedule-c' => 'Schedule C',
        'schedule-e' => 'Schedule E',
        'schedule-f' => 'Schedule F',
        'schedule-se' => 'Schedule SE',
        'form-1116' => 'Form 1116',
        'form-4797' => 'Form 4797',
        'form-4952' => 'Form 4952',
        'form-6251' => 'Form 6251',
        'form-6781' => 'Form 6781',
        'form-8582' => 'Form 8582',
        'form-8606' => 'Form 8606',
        'form-8829' => 'Form 8829',
        'form-8959' => 'Form 8959',
        'form-8960' => 'Form 8960',
        'form-8995' => 'Form 8995',
    ];

    public function __construct(
        private readonly TaxPreviewFactsService $taxPreviewFactsService,
        private readonly IrsPdfTemplateRepository $templates,
        private readonly IrsReturnFormSelector $formSelector,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function forUser(User $user, int $year): array
    {
        $facts = $this->taxPreviewFactsService->arrayForYear((int) $user->id, $year);
        $manifest = $this->templates->manifest($year);
        $allSupportedFormIds = TaxReturnPdfOptions::normalizeFormIds(array_keys($manifest->templates));
        $recommendedFormIds = TaxReturnPdfOptions::normalizeFormIds(array_merge(['form-1040'], $this->formSelector->supportedRequiredForms($facts)));
        $unsupportedRequiredForms = $this->formSelector->unsupportedRequiredForms($facts);

        return [
            'year' => $year,
            'supportedForms' => array_map(
                fn (string $formId): array => $this->supportedForm($formId, in_array($formId, $recommendedFormIds, true), $this->hasData($formId, $facts)),
                $allSupportedFormIds,
            ),
            'recommendedFormIds' => $recommendedFormIds,
            'allSupportedFormIds' => $allSupportedFormIds,
            'unsupportedRequiredForms' => array_map(
                fn (string $formId): array => $this->unsupportedForm($formId),
                $unsupportedRequiredForms,
            ),
            'warnings' => array_merge(
                ['Taxpayer identity fields are not included by default and will be blank in the generated PDF.'],
                array_map(
                    static fn (string $formId): string => "{$formId} appears required from Tax Preview facts but no pinned or mapped PDF exists yet.",
                    $unsupportedRequiredForms,
                ),
            ),
        ];
    }

    /**
     * @return array{id: string, label: string, category: string, available: bool, recommended: bool, hasData: bool, warnings: array<int, string>}
     */
    private function supportedForm(string $formId, bool $recommended, bool $hasData): array
    {
        $metadata = self::FORM_METADATA[$formId] ?? ['label' => $formId, 'category' => 'Form'];

        return [
            'id' => $formId,
            'label' => $metadata['label'],
            'category' => $metadata['category'],
            'available' => true,
            'recommended' => $recommended,
            'hasData' => $hasData,
            'warnings' => $hasData ? [] : ["{$metadata['label']} has no current Tax Preview values and may render blank."],
        ];
    }

    /**
     * @return array{id: string, label: string, reason: string}
     */
    private function unsupportedForm(string $formId): array
    {
        return [
            'id' => $formId,
            'label' => self::UNSUPPORTED_LABELS[$formId] ?? $formId,
            'reason' => 'Appears required from Tax Preview facts but no pinned/mapped PDF exists yet.',
        ];
    }

    /**
     * @param  array<string, mixed>  $facts
     */
    private function hasData(string $formId, array $facts): bool
    {
        return match ($formId) {
            'form-1040' => is_array($facts['form1040'] ?? null),
            'schedule-1' => is_array($facts['schedule1'] ?? null),
            'schedule-3' => is_array($facts['schedule3'] ?? null),
            'schedule-d' => is_array($facts['scheduleD'] ?? null),
            'form-8949' => is_array($facts['form8949'] ?? null) && (int) ($facts['form8949']['rowCount'] ?? 0) > 0,
            default => false,
        };
    }
}
