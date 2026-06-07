<?php

namespace App\Services\Finance\TaxReturnPdf;

use App\Services\Finance\TaxReturnPdf\Data\IrsFieldDefinition;
use App\Services\Finance\TaxReturnPdf\Data\IrsFieldMap;
use RuntimeException;

class IrsFieldMapRepository
{
    public function __construct(
        private readonly IrsPdfTemplateRepository $templates,
        private readonly IrsFieldDumpService $fieldDumpService,
    ) {}

    public function map(int $year, string $formId): IrsFieldMap
    {
        $path = resource_path("irs/maps/{$year}/{$formId}.json");

        if (! is_file($path)) {
            throw new RuntimeException("IRS field map is missing for {$formId} {$year}: {$path}");
        }

        $decoded = json_decode((string) file_get_contents($path), true);

        if (! is_array($decoded)) {
            throw new RuntimeException("IRS field map is not valid JSON: {$path}");
        }

        $map = IrsFieldMap::fromArray($decoded);
        $this->validate($map);

        return $map;
    }

    public function validate(IrsFieldMap $map): void
    {
        $template = $this->templates->template($map->taxYear, $map->formId);
        $fields = $this->indexedFields($this->fieldDumpService->dump($this->templates->templatePath($template)));
        $errors = [];

        foreach ($map->mappings as $index => $mapping) {
            $pdfField = $mapping['pdfField'] ?? null;
            $key = is_scalar($mapping['key'] ?? null) ? (string) $mapping['key'] : "mapping {$index}";

            if (! is_string($pdfField) || $pdfField === '') {
                $errors[] = "{$key} is missing pdfField.";

                continue;
            }

            $field = $fields[$pdfField] ?? null;
            if (! $field instanceof IrsFieldDefinition) {
                $errors[] = "{$key} maps to unknown PDF field {$pdfField}.";

                continue;
            }

            if (($mapping['format'] ?? null) === 'checkbox') {
                if ($field->type !== 'Btn') {
                    $errors[] = "{$key} maps checkbox format to non-button PDF field {$pdfField}.";
                }

                if ($field->onValues === []) {
                    $errors[] = "{$key} maps checkbox PDF field {$pdfField}, but no on-value was found in the template.";
                }
            }
        }

        if ($errors !== []) {
            throw new RuntimeException("IRS field map validation failed:\n".implode("\n", $errors));
        }
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
