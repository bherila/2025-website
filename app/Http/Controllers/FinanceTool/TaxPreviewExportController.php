<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Http\Requests\FinanceTool\TaxPreviewExportRequest;
use App\Services\Finance\TaxPreviewWorkbookBuilder;
use App\Services\Finance\TaxPreviewXlsxWriter;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;

class TaxPreviewExportController extends Controller
{
    public function __construct(
        private readonly TaxPreviewWorkbookBuilder $workbookBuilder,
        private readonly TaxPreviewXlsxWriter $xlsxWriter,
    ) {}

    public function export(TaxPreviewExportRequest $request): Response
    {
        $validated = $request->validated();
        $year = (int) $validated['year'];
        $scope = (string) ($validated['scope'] ?? TaxPreviewExportRequest::SCOPE_FULL);
        $filename = $this->defaultFilename($validated['filename'] ?? null, $year);
        $factSheets = [];

        if ($scope === TaxPreviewExportRequest::SCOPE_FULL) {
            $workbook = $this->workbookBuilder->buildForUserYear(
                (int) Auth::id(),
                $year,
                $validated['filename'] ?? null,
            );

            $filename = $workbook['filename'];
            $factSheets = $workbook['sheets'];
        }

        $content = $this->xlsxWriter->write(
            $factSheets,
            $this->gridSheetsForScope($validated['grids'] ?? [], $scope),
        );
        $filename = $this->sanitizeFilename($filename);

        return response($content, 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    /**
     * @param  array<int, array<string, mixed>>  $gridSheets
     * @return array<int, array<string, mixed>>
     */
    private function gridSheetsForScope(array $gridSheets, string $scope): array
    {
        if ($scope === TaxPreviewExportRequest::SCOPE_FULL) {
            return array_values($gridSheets);
        }

        return array_values(array_filter(
            $gridSheets,
            fn (array $gridSheet): bool => TaxPreviewExportRequest::gridMatchesScope($gridSheet, $scope),
        ));
    }

    private function defaultFilename(mixed $filename, int $year): string
    {
        $filename = is_scalar($filename) ? trim((string) $filename) : '';

        return $filename !== '' ? $filename : "tax-preview-{$year}.xlsx";
    }

    private function sanitizeFilename(string $filename): string
    {
        $filename = preg_replace('/[^A-Za-z0-9._-]/', '-', $filename) ?: 'tax-preview.xlsx';

        return str_ends_with(strtolower($filename), '.xlsx') ? $filename : "{$filename}.xlsx";
    }
}
