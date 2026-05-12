<?php

namespace App\Http\Controllers;

use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\View\View;

class AddressLabelController extends Controller
{
    public function index(): View
    {
        return view('tools.address-labels');
    }

    public function generate(Request $request): Response
    {
        $validated = $request->validate([
            'sheet_number' => ['required', 'string', 'in:48163'],
            'addresses' => ['required', 'string'],
        ]);

        $rows = $this->parseRows($validated['addresses']);

        if (count($rows) === 0) {
            abort(422, 'No address rows were provided.');
        }

        $labelsPerPage = 10;
        $pages = array_chunk($rows, $labelsPerPage);

        $pdf = Pdf::loadView('tools.address-labels-pdf', [
            'pages' => $pages,
            'sheetNumber' => $validated['sheet_number'],
        ])->setPaper('letter', 'portrait');

        return response($pdf->output(), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="address-labels-48163.pdf"',
        ]);
    }

    /**
     * @return array<int, array<int, string>>
     */
    private function parseRows(string $rawInput): array
    {
        $normalized = str_replace(["\r\n", "\r"], "\n", trim($rawInput));
        $lines = array_filter(explode("\n", $normalized), fn (string $line): bool => trim($line) !== '');

        if (count($lines) === 0) {
            return [];
        }

        $tabCount = substr_count($normalized, "\t");
        $commaCount = substr_count($normalized, ',');
        $delimiter = $tabCount > $commaCount ? "\t" : ',';

        return array_values(array_map(function (string $line) use ($delimiter): array {
            return array_values(array_filter(array_map(
                fn (string $part): string => trim($part),
                str_getcsv($line, $delimiter)
            ), fn (string $part): bool => $part !== ''));
        }, $lines));
    }
}
