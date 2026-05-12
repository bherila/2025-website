<?php

namespace App\Http\Controllers;

use App\Support\AddressLabelParser;
use App\Support\AveryLabelSpec;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\View\View;
use TCPDF;

class AddressLabelController extends Controller
{
    public function __construct(private AddressLabelParser $parser) {}

    public function index(): View
    {
        $sheetOptions = AveryLabelSpec::options();

        return view('tools.address-labels', [
            'sheetOptions' => $sheetOptions,
        ]);
    }

    public function generate(Request $request): Response|RedirectResponse
    {
        $validated = $request->validate([
            'sheet_number' => ['required', 'string', 'in:'.implode(',', array_keys(AveryLabelSpec::options()))],
            'addresses' => ['required', 'string'],
            'parser_mode' => ['nullable', 'string', 'in:auto,delimited,blocks'],
            'font_size' => ['nullable', 'numeric', 'min:7', 'max:14'],
            'vertical_align' => ['nullable', 'string', 'in:top,center'],
            'bold_first_line' => ['nullable', 'boolean'],
            'skip_count' => ['nullable', 'integer', 'min:0', 'max:500'],
            'copies' => ['nullable', 'integer', 'min:1', 'max:500'],
            'download' => ['nullable', 'boolean'],
        ]);

        $mode = $validated['parser_mode'] ?? 'auto';
        if ($mode === 'delimited') {
            $mode = 'delimited';
        }

        $rows = $this->parser->parse($validated['addresses'], $mode === 'delimited' ? 'delimited' : $mode);

        if (count($rows) === 0) {
            return redirect()->back()->withErrors(['addresses' => 'No address rows were provided.'])->withInput();
        }

        $spec = new AveryLabelSpec($validated['sheet_number']);
        $labelsPerPage = $spec->labelsPerPage();
        $skipCount = min((int) ($validated['skip_count'] ?? 0), max(0, $labelsPerPage - 1));
        $rows = $this->applyCopies($rows, (int) ($validated['copies'] ?? 1));

        if (count($rows) > 500) {
            return redirect()->back()->withErrors(['addresses' => 'Maximum 500 label rows are allowed.'])->withInput();
        }

        $pdfBytes = $this->buildLabelsPdf(
            $rows,
            $spec,
            (float) ($validated['font_size'] ?? 11),
            ($validated['vertical_align'] ?? 'top') === 'center',
            (bool) ($validated['bold_first_line'] ?? false),
            $skipCount
        );

        $disposition = ! empty($validated['download']) ? 'attachment' : 'inline';

        return response($pdfBytes, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => $disposition.'; filename="address-labels-'.$validated['sheet_number'].'.pdf"',
        ]);
    }

    public function preview(Request $request): View|RedirectResponse
    {
        $spec = new AveryLabelSpec($request->string('sheet_number', '48163')->toString());
        $rows = $this->parser->parse($request->string('addresses', '')->toString(), $request->string('parser_mode', 'auto')->toString());

        if (count($rows) === 0) {
            return redirect()->back()->withErrors(['addresses' => 'No address rows were provided.'])->withInput();
        }

        $rows = $this->applyCopies($rows, max(1, $request->integer('copies', 1)));
        $skipCount = min($request->integer('skip_count', 0), max(0, $spec->labelsPerPage() - 1));
        $paddedRows = array_merge(array_fill(0, $skipCount, []), $rows);

        return view('tools.address-labels-preview', [
            'rows' => $paddedRows,
            'spec' => $spec,
            'fontSize' => $request->integer('font_size', 11),
            'center' => $request->string('vertical_align', 'top')->toString() === 'center',
            'boldFirstLine' => $request->boolean('bold_first_line'),
        ]);
    }

    public function calibration(Request $request): Response
    {
        $spec = new AveryLabelSpec($request->string('sheet_number', '48163')->toString());
        $pdf = new TCPDF('P', 'in', 'LETTER', true, 'UTF-8', false);
        $pdf->SetPrintHeader(false);
        $pdf->SetPrintFooter(false);
        $pdf->SetMargins(0, 0, 0);
        $pdf->AddPage();
        $pdf->SetDrawColor(180, 0, 0);

        for ($r = 0; $r < $spec->rows(); $r++) {
            for ($c = 0; $c < $spec->columns(); $c++) {
                $x = $spec->leftMarginInches() + ($c * $spec->horizontalPitchInches());
                $y = $spec->topMarginInches() + ($r * $spec->verticalPitchInches());
                $pdf->Line($x - 0.05, $y, $x + 0.05, $y);
                $pdf->Line($x, $y - 0.05, $x, $y + 0.05);
            }
        }

        return response($pdf->Output('calibration.pdf', 'S'), 200, ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="label-calibration.pdf"']);
    }

    private function applyCopies(array $rows, int $copies): array
    {
        if ($copies <= 1 || count($rows) === 0) {
            return $rows;
        }

        return array_merge(array_fill(0, $copies, $rows[0]), array_slice($rows, 1));
    }

    private function buildLabelsPdf(array $rows, AveryLabelSpec $spec, float $baseFontSize, bool $center, bool $boldFirstLine, int $skipCount): string
    {
        $pdf = new TCPDF('P', 'in', 'LETTER', true, 'UTF-8', false);
        $pdf->SetPrintHeader(false);
        $pdf->SetPrintFooter(false);
        $pdf->SetMargins(0, 0, 0);

        $labels = array_merge(array_fill(0, $skipCount, []), $rows);
        $chunks = array_chunk($labels, $spec->labelsPerPage());

        foreach ($chunks as $pageRows) {
            $pdf->AddPage();
            for ($r = 0; $r < $spec->rows(); $r++) {
                for ($c = 0; $c < $spec->columns(); $c++) {
                    $index = ($r * $spec->columns()) + $c;
                    $lines = $pageRows[$index] ?? [];
                    $x = $spec->leftMarginInches() + ($c * $spec->horizontalPitchInches());
                    $y = $spec->topMarginInches() + ($r * $spec->verticalPitchInches());

                    $fontSize = count($lines) > 5 ? max(7, $baseFontSize - 2) : $baseFontSize;
                    $lineHeight = ($fontSize / 72) * 1.4;
                    $blockHeight = count($lines) * $lineHeight;
                    $startY = $center ? $y + max(0.08, ($spec->labelHeightInches() - $blockHeight) / 2) : $y + 0.08;

                    foreach ($lines as $lineIndex => $line) {
                        $pdf->SetFont('helvetica', ($boldFirstLine && $lineIndex === 0) ? 'B' : '', $fontSize);
                        $pdf->SetXY($x + 0.08, $startY + ($lineIndex * $lineHeight));
                        $pdf->Cell($spec->labelWidthInches() - 0.16, $lineHeight, $line, 0, 1, 'L', false, '', 1);
                    }
                }
            }
        }

        return $pdf->Output('labels.pdf', 'S');
    }
}
