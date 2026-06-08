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
        $fields = $this->fieldsByName($this->fieldDumpService->dump($this->templates->templatePath($template)));
        $errors = [];

        foreach ($map->mappings as $index => $mapping) {
            $pdfField = $mapping['pdfField'] ?? null;
            $key = is_scalar($mapping['key'] ?? null) ? (string) $mapping['key'] : "mapping {$index}";

            if (! is_string($pdfField) || $pdfField === '') {
                $errors[] = "{$key} is missing pdfField.";

                continue;
            }

            $matchingFields = $fields[$pdfField] ?? [];
            if ($matchingFields === []) {
                $errors[] = "{$key} maps to unknown PDF field {$pdfField}.";

                continue;
            }

            if (($mapping['format'] ?? null) === 'checkbox') {
                if (! $this->hasFieldType($matchingFields, 'Btn')) {
                    $errors[] = "{$key} maps checkbox format to non-button PDF field {$pdfField}.";
                }

                $onValues = $this->onValues($matchingFields);
                if ($onValues === []) {
                    $errors[] = "{$key} maps checkbox PDF field {$pdfField}, but no on-value was found in the template.";
                }

                foreach ($this->mappedCheckboxOnValues($mapping) as $mappedOnValue) {
                    if (! in_array($mappedOnValue, $onValues, true)) {
                        $errors[] = "{$key} maps checkbox PDF field {$pdfField} to unknown on-value {$mappedOnValue}.";
                    }
                }
            }
        }

        if ($errors !== []) {
            throw new RuntimeException("IRS field map validation failed:\n".implode("\n", $errors));
        }
    }

    /**
     * @param  array<int, IrsFieldDefinition>  $fields
     * @return array<string, array<int, IrsFieldDefinition>>
     */
    private function fieldsByName(array $fields): array
    {
        $indexed = [];

        foreach ($fields as $field) {
            $indexed[$field->name][] = $field;
        }

        return $indexed;
    }

    /**
     * @param  array<int, IrsFieldDefinition>  $fields
     */
    private function hasFieldType(array $fields, string $type): bool
    {
        foreach ($fields as $field) {
            if ($field->type === $type) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<int, IrsFieldDefinition>  $fields
     * @return array<int, string>
     */
    private function onValues(array $fields): array
    {
        $onValues = [];

        foreach ($fields as $field) {
            foreach ($field->onValues as $onValue) {
                $onValues[] = $onValue;
            }
        }

        return array_values(array_unique($onValues));
    }

    /**
     * @param  array<string, mixed>  $mapping
     * @return array<int, string>
     */
    private function mappedCheckboxOnValues(array $mapping): array
    {
        $mappedOnValues = [];

        if (isset($mapping['onValue'])) {
            $mappedOnValues[] = (string) $mapping['onValue'];
        }

        if (is_array($mapping['checkedValues'] ?? null)) {
            foreach ($mapping['checkedValues'] as $checkedValue) {
                if (is_scalar($checkedValue)) {
                    $mappedOnValues[] = (string) $checkedValue;
                }
            }
        }

        return array_values(array_unique($mappedOnValues));
    }
}
