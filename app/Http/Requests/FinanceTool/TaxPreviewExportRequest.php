<?php

namespace App\Http\Requests\FinanceTool;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class TaxPreviewExportRequest extends FormRequest
{
    public const string SCOPE_FULL = 'full';

    public const string SCOPE_K1_ALL_IN_ONE = 'k1-all-in-one';

    public const string SCOPE_K3_ALL_IN_ONE = 'k3-all-in-one';

    public const array SCOPES = [
        self::SCOPE_FULL,
        self::SCOPE_K1_ALL_IN_ONE,
        self::SCOPE_K3_ALL_IN_ONE,
    ];

    public const array GRID_SCOPES = [
        self::SCOPE_K1_ALL_IN_ONE,
        self::SCOPE_K3_ALL_IN_ONE,
    ];

    public const array GRID_COLUMN_FORMATS = [
        'currency',
        'number',
        'percent',
        'text',
    ];

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'year' => ['required', 'integer', 'min:1900', 'max:2100'],
            'filename' => ['nullable', 'string', 'max:255'],
            'scope' => ['required', 'string', Rule::in(self::SCOPES)],
            'grids' => ['sometimes', 'array', 'max:12'],
            'grids.*.name' => ['required', 'string', 'max:80'],
            'grids.*.scope' => ['nullable', 'string', Rule::in(self::GRID_SCOPES)],
            'grids.*.columns' => ['required', 'array', 'min:1', 'max:64'],
            'grids.*.columns.*.key' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9_-]+$/'],
            'grids.*.columns.*.label' => ['required', 'string', 'max:120'],
            'grids.*.columns.*.width' => ['nullable', 'numeric', 'min:6', 'max:80'],
            'grids.*.columns.*.format' => ['nullable', 'string', Rule::in(self::GRID_COLUMN_FORMATS)],
            'grids.*.rows' => ['required', 'array', 'min:1', 'max:2000'],
            'grids.*.rows.*.kind' => ['required', 'string', Rule::in(['title', 'section', 'header', 'data', 'total'])],
            'grids.*.rows.*.label' => ['nullable', 'string', 'max:500'],
            'grids.*.rows.*.cells' => ['nullable', 'array'],
            'grids.*.rows.*.cells.*' => ['nullable'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $scope = $this->input('scope', self::SCOPE_FULL);
            $grids = $this->input('grids', []);

            if ($grids === null) {
                $grids = [];
            }

            if (! is_string($scope) || ! is_array($grids)) {
                return;
            }

            if ($scope !== self::SCOPE_FULL && ! $this->hasMatchingGrid($grids, $scope)) {
                $validator->errors()->add('grids', "At least one normalized grid sheet must match the {$scope} export scope.");
            }

            $this->validateGridCells($validator, $grids);
        });
    }

    protected function prepareForValidation(): void
    {
        $scope = $this->input('scope', self::SCOPE_FULL);
        $grids = $this->input('grids');

        if (is_string($scope)) {
            $scope = strtolower(trim($scope));
        }

        if (is_array($grids)) {
            foreach ($grids as $index => $grid) {
                if (! is_array($grid) || ! isset($grid['scope']) || ! is_string($grid['scope'])) {
                    continue;
                }

                $grids[$index]['scope'] = strtolower(trim($grid['scope']));
            }
        }

        $prepared = ['scope' => $scope === '' ? self::SCOPE_FULL : $scope];

        if (is_array($grids)) {
            $prepared['grids'] = $grids;
        }

        $this->merge($prepared);
    }

    /**
     * @param  array<mixed>  $grids
     */
    private function hasMatchingGrid(array $grids, string $scope): bool
    {
        foreach ($grids as $grid) {
            if (self::gridMatchesScope($grid, $scope)) {
                return true;
            }
        }

        return false;
    }

    public static function gridMatchesScope(mixed $grid, string $scope): bool
    {
        if (! is_array($grid)) {
            return false;
        }

        $gridScope = $grid['scope'] ?? null;
        if (is_string($gridScope) && $gridScope !== '') {
            return $gridScope === $scope;
        }

        $name = $grid['name'] ?? '';
        if (! is_scalar($name)) {
            return false;
        }

        $name = (string) $name;

        return match ($scope) {
            self::SCOPE_K1_ALL_IN_ONE => preg_match('/(^|[^a-z0-9])k[-_\s]?1s?([^a-z0-9]|$)/i', $name) === 1,
            self::SCOPE_K3_ALL_IN_ONE => preg_match('/(^|[^a-z0-9])k[-_\s]?3s?([^a-z0-9]|$)/i', $name) === 1,
            default => false,
        };
    }

    /**
     * @param  array<mixed>  $grids
     */
    private function validateGridCells(Validator $validator, array $grids): void
    {
        foreach ($grids as $sheetIndex => $grid) {
            if (! is_array($grid)) {
                continue;
            }

            $columnKeys = $this->columnKeysForGrid($validator, $grid, $sheetIndex);
            $rows = $grid['rows'] ?? [];

            if (! is_array($rows)) {
                continue;
            }

            foreach ($rows as $rowIndex => $row) {
                if (! is_array($row)) {
                    continue;
                }

                $cells = $row['cells'] ?? [];
                if (! is_array($cells)) {
                    continue;
                }

                foreach ($cells as $key => $value) {
                    $cellKey = (string) $key;
                    if (! array_key_exists($cellKey, $columnKeys)) {
                        $validator->errors()->add("grids.{$sheetIndex}.rows.{$rowIndex}.cells.{$cellKey}", "The {$cellKey} cell does not match a declared grid column.");
                    }

                    if (! $this->isSupportedCellValue($value)) {
                        $validator->errors()->add("grids.{$sheetIndex}.rows.{$rowIndex}.cells.{$cellKey}", 'Grid cell values must be strings, numbers, or null.');
                    }
                }
            }
        }
    }

    /**
     * @param  array<string, mixed>  $grid
     * @return array<string, true>
     */
    private function columnKeysForGrid(Validator $validator, array $grid, int|string $sheetIndex): array
    {
        $columns = $grid['columns'] ?? [];
        $keys = [];

        if (! is_array($columns)) {
            return $keys;
        }

        foreach ($columns as $columnIndex => $column) {
            if (! is_array($column) || ! isset($column['key']) || ! is_string($column['key'])) {
                continue;
            }

            if (array_key_exists($column['key'], $keys)) {
                $validator->errors()->add("grids.{$sheetIndex}.columns.{$columnIndex}.key", "The {$column['key']} column key is duplicated.");
            }

            $keys[$column['key']] = true;
        }

        return $keys;
    }

    private function isSupportedCellValue(mixed $value): bool
    {
        if ($value === null || is_string($value) || is_int($value)) {
            return true;
        }

        return is_float($value) && is_finite($value);
    }
}
