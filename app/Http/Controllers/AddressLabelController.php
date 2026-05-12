<?php

namespace App\Http\Controllers;

use App\Http\Requests\AddressLabelCalibrationRequest;
use App\Http\Requests\GenerateAddressLabelsRequest;
use App\Support\AddressLabelParser;
use App\Support\AveryLabelRenderer;
use App\Support\AveryLabelSpec;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Response;
use Illuminate\View\View;

class AddressLabelController extends Controller
{
    private const int MAX_ROWS = 500;

    public function __construct(private AddressLabelParser $parser, private AveryLabelRenderer $renderer) {}

    public function index(): View
    {
        $sheetOptions = AveryLabelSpec::options();

        return view('tools.address-labels', [
            'sheetOptions' => $sheetOptions,
        ]);
    }

    public function generate(GenerateAddressLabelsRequest $request): Response|RedirectResponse
    {
        $spec = new AveryLabelSpec($request->sheetNumber());
        $rows = $this->parseAndApplyCopies($request);
        if ($rows instanceof RedirectResponse) {
            return $rows;
        }

        $pdfBytes = $this->renderer->labelsPdf(
            $rows,
            $spec,
            $request->fontSize(),
            $request->isVerticallyCentered(),
            $request->shouldBoldFirstLine(),
            $request->skipCount($spec->labelsPerPage()),
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
        $rows = $this->parseAndApplyCopies($request);
        if ($rows instanceof RedirectResponse) {
            return $rows;
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
        $pdfBytes = $this->renderer->calibrationPdf($spec);

        return response($pdfBytes, 200, ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="label-calibration.pdf"']);
    }

    /**
     * @return array<int, array<int, string>>|RedirectResponse
     */
    private function parseAndApplyCopies(GenerateAddressLabelsRequest $request): array|RedirectResponse
    {
        $rows = $this->parser->parse($request->addresses(), $request->parserMode());

        if (count($rows) === 0) {
            return $this->backWithAddressError('No address rows were provided.');
        }

        $rows = $this->applyCopies($rows, $request->copies());

        if (count($rows) > self::MAX_ROWS) {
            return $this->backWithAddressError('Maximum '.self::MAX_ROWS.' label rows are allowed.');
        }

        return $rows;
    }

    private function backWithAddressError(string $message): RedirectResponse
    {
        return redirect()->back()->withErrors(['addresses' => $message])->withInput();
    }

    /**
     * Repeats only the first parsed label, then appends any remaining input rows.
     *
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
}
