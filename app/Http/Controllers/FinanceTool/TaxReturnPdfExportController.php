<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Http\Requests\FinanceTool\TaxReturnPdfExportRequest;
use App\Models\FinanceTool\FinTaxReturnPdfExport;
use App\Services\Finance\TaxReturnPdf\Data\TaxReturnPdfOptions;
use App\Services\Finance\TaxReturnPdf\Exceptions\TaxReturnPdfUnavailableException;
use App\Services\Finance\TaxReturnPdf\IrsReturnPdfBuilder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class TaxReturnPdfExportController extends Controller
{
    public function __construct(
        private readonly IrsReturnPdfBuilder $pdfBuilder,
    ) {}

    public function export(TaxReturnPdfExportRequest $request): Response|JsonResponse
    {
        $validated = $request->validated();
        $options = new TaxReturnPdfOptions(
            year: (int) $validated['year'],
            scope: (string) $validated['scope'],
            mode: (string) $validated['mode'],
            formId: isset($validated['formId']) ? (string) $validated['formId'] : null,
            filename: $request->sanitizedFilename(),
        );

        try {
            $content = $this->pdfBuilder->buildForUser(Auth::user(), $options);
            $this->audit($options, 'succeeded');

            return response($content, 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => "attachment; filename=\"{$options->filename}\"",
            ]);
        } catch (TaxReturnPdfUnavailableException $exception) {
            $this->audit($options, 'blocked', [
                'errors' => $exception->errors,
                'warnings' => $exception->warnings,
            ]);

            return response()->json([
                'message' => 'Tax return PDF export is not ready.',
                'errors' => $exception->errors,
                'warnings' => $exception->warnings,
            ], 422);
        } catch (RuntimeException $exception) {
            Log::error('Tax return PDF export failed.', [
                'user_id' => Auth::id(),
                'tax_year' => $options->year,
                'scope' => $options->scope,
                'mode' => $options->mode,
                'exception' => $exception->getMessage(),
            ]);

            $this->audit($options, 'failed', [
                'errors' => [$exception->getMessage()],
            ]);

            return response()->json([
                'message' => 'Tax return PDF export failed.',
                'errors' => ['The tax return PDF could not be generated. Please try again, or contact support if the problem persists.'],
                'warnings' => [],
            ], 422);
        }
    }

    /**
     * @param  array<string, mixed>|null  $errorSummary
     */
    private function audit(TaxReturnPdfOptions $options, string $status, ?array $errorSummary = null): void
    {
        FinTaxReturnPdfExport::query()->create([
            'user_id' => Auth::id(),
            'tax_year' => $options->year,
            'scope' => $options->scope,
            'form_ids' => $options->formIds(),
            'mode' => $options->mode,
            'status' => $status,
            'filename' => $options->filename,
            'error_summary' => $errorSummary,
            'exported_at' => now(),
        ]);
    }
}
