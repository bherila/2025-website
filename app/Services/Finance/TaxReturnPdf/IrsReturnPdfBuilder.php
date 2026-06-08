<?php

namespace App\Services\Finance\TaxReturnPdf;

use App\Models\FinanceTool\FinTaxReturnProfile;
use App\Models\User;
use App\Services\Finance\TaxPreviewFactsService;
use App\Services\Finance\TaxReturnPdf\Data\IrsFieldDefinition;
use App\Services\Finance\TaxReturnPdf\Data\TaxReturnPdfOptions;
use App\Services\Finance\TaxReturnPdf\Exceptions\TaxReturnPdfUnavailableException;

class IrsReturnPdfBuilder
{
    public function __construct(
        private readonly TaxPreviewFactsService $taxPreviewFactsService,
        private readonly IrsPdfTemplateRepository $templates,
        private readonly IrsFieldDumpService $fieldDumpService,
        private readonly IrsFieldMapRepository $fieldMaps,
        private readonly IrsFieldValueResolver $valueResolver,
        private readonly IrsFieldValueFormatter $valueFormatter,
        private readonly IrsReturnReadinessService $readinessService,
        private readonly IrsAcroFormFillEngine $fillEngine,
    ) {}

    public function buildForUser(User $user, TaxReturnPdfOptions $options): string
    {
        $facts = $this->taxPreviewFactsService->arrayForYear((int) $user->id, $options->year);
        $profile = $this->profile($user, $options->year);
        $readiness = $this->readinessService->forRequest(
            $user,
            $options->year,
            $options->scope,
            $options->formId,
            $options->mode,
            $profile,
            $facts,
        );

        if (! $readiness->isReady()) {
            throw new TaxReturnPdfUnavailableException($readiness->errors, $readiness->warnings);
        }

        $formId = $options->formId ?? 'form-1040';
        $template = $this->templates->template($options->year, $formId);
        $fieldMap = $this->fieldMaps->map($options->year, $formId);
        $fields = $this->indexedFields($this->fieldDumpService->dump($this->templates->templatePath($template)));
        $fieldValues = $this->fieldValues($fieldMap->mappings, $fields, $facts, $profile);

        return $this->fillEngine->fill($this->templates->templatePath($template), $fieldValues, $options);
    }

    /**
     * @param  array<int, array<string, mixed>>  $mappings
     * @param  array<string, IrsFieldDefinition>  $fields
     * @param  array<string, mixed>  $facts
     * @return array<string, string|bool|null>
     */
    public function fieldValues(array $mappings, array $fields, array $facts, ?FinTaxReturnProfile $profile): array
    {
        $values = [];
        $context = [
            'facts' => $facts,
            'profile' => $profile,
        ];

        foreach ($mappings as $mapping) {
            $pdfField = $mapping['pdfField'] ?? null;
            $source = $mapping['source'] ?? null;

            if (! is_string($pdfField) || ! is_string($source)) {
                continue;
            }

            $value = $this->valueResolver->resolve($source, $context);
            $formattedValue = $this->valueFormatter->format($value, $mapping, $fields[$pdfField] ?? null);

            if ($this->isUncheckedCheckboxValue($mapping, $formattedValue)) {
                continue;
            }

            $values[$pdfField] = $formattedValue;
        }

        return $values;
    }

    /**
     * @param  array<string, mixed>  $mapping
     */
    private function isUncheckedCheckboxValue(array $mapping, string|bool|null $value): bool
    {
        return ($mapping['format'] ?? null) === 'checkbox' && $value === false;
    }

    private function profile(User $user, int $year): ?FinTaxReturnProfile
    {
        return FinTaxReturnProfile::query()
            ->where('user_id', $user->id)
            ->where('tax_year', $year)
            ->first();
    }

    /**
     * @param  array<int, IrsFieldDefinition>  $fields
     * @return array<string, IrsFieldDefinition>
     */
    private function indexedFields(array $fields): array
    {
        $indexed = [];

        foreach ($fields as $field) {
            $indexed[$field->name] = $field;
        }

        return $indexed;
    }
}
