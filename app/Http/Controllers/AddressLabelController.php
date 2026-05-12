<?php

namespace App\Http\Controllers;

use App\Http\Requests\AddressLabelCalibrationRequest;
use App\Http\Requests\GenerateAddressLabelsRequest;
use App\Support\AddressLabelParser;
use App\Support\AveryLabelSpec;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Response;
use Illuminate\View\View;
use TCPDF;

class AddressLabelController extends Controller
{
    private const int MAX_ROWS = 500;

    public function __construct(private AddressLabelParser $parser) {}

    public function index(): View
    {
        $sheetOptions = AveryLabelSpec::options();

        return view('tools.address-labels', [
            'sheetOptions' => $sheetOptions,
        ]);
    }

    public function generate(GenerateAddressLabelsRequest $request): Response|RedirectResponse
    {
        $rows = $this->parser->parse($request->addresses(), $request->parserMode());

        if (count($rows) === 0) {
            return redirect()->back()->withErrors(['addresses' => 'No address rows were provided.'])->withInput();
        }

        $spec = new AveryLabelSpec($request->sheetNumber());
        $skipCount = $request->skipCount($spec->labelsPerPage());
        $rows = $this->applyCopies($rows, $request->copies());

        if (count($rows) > self::MAX_ROWS) {
            return redirect()->back()->withErrors(['addresses' => 'Maximum '.self::MAX_ROWS.' label rows are allowed.'])->withInput();
        }

        $pdfBytes = $this->buildLabelsPdf(
            $rows,
            $spec,
            $request->fontSize(),
            $request->isVerticallyCentered(),
            $request->shouldBoldFirstLine(),
            $skipCount
        );

        $disposition = $request->shouldDownload() ? 'attachment' : 'inline';

        return response($pdfBytes, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => $disposition.'; filename="address-labels-'.$request->sheetNumber().'.pdf"',
        ]);
    }

    public function preview(GenerateAddressLabelsRequest $request): View|RedirectResponse
    {
        $spec = new AveryLabelSpec($request->sheetNumber());
        $rows = $this->parser->parse($request->addresses(), $request->parserMode());

        if (count($rows) === 0) {
            return redirect()->back()->withErrors(['addresses' => 'No address rows were provided.'])->withInput();
        }

        $rows = $this->applyCopies($rows, $request->copies());

        if (count($rows) > self::MAX_ROWS) {
            return redirect()->back()->withErrors(['addresses' => 'Maximum '.self::MAX_ROWS.' label rows are allowed.'])->withInput();
        }

        $skipCount = $request->skipCount($spec->labelsPerPage());
        $paddedRows = array_merge(array_fill(0, $skipCount, []), $rows);

        return view('tools.address-labels-preview', [
            'rows' => $paddedRows,
            'spec' => $spec,
            'fontSize' => $request->fontSize(),
            'center' => $request->isVerticallyCentered(),
            'boldFirstLine' => $request->shouldBoldFirstLine(),
        ]);
    }

    public function calibration(AddressLabelCalibrationRequest $request): Response
    {
        $spec = new AveryLabelSpec($request->sheetNumber());
        $pdf = new TCPDF('P', 'in', strtoupper($spec->paper()), true, 'UTF-8', false);
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

    /**
     * @param  array<int, array<int, string>>  $rows
     * @return array<int, array<int, string>>
     */
    private function applyCopies(array $rows, int $copies): array
    {
        if ($copies <= 1 || count($rows) === 0) {
            return $rows;
        }

        return array_merge(array_fill(0, $copies, $rows[0]), array_slice($rows, 1));
    }

    /**
     * @param  array<int, array<int, string>>  $rows
     */
    private function buildLabelsPdf(array $rows, AveryLabelSpec $spec, float $baseFontSize, bool $center, bool $boldFirstLine, int $skipCount): string
    {
        $pdf = new TCPDF('P', 'in', strtoupper($spec->paper()), true, 'UTF-8', false);
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
