<?php

namespace App\Http\Controllers\Agent\Finance;

use App\Http\Controllers\Controller;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinDocument;
use App\Services\FileStorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

/**
 * Agent signed-download endpoints (lane 3B).
 *
 * Binaries are never streamed through the JSON/TOON agent surface; instead
 * these endpoints mint short-lived signed S3 URLs exactly like the existing
 * web download actions (TaxDocumentController::download() and
 * FinanceDocumentController::download()). Owner-scoped; non-owned or
 * file-less IDs render 404 so cross-user IDs are never confirmed.
 */
class FinanceDownloadController extends Controller
{
    /** Signed URL TTL in minutes (FileStorageService default). */
    private const URL_EXPIRATION_MINUTES = 60;

    public function __construct(private readonly FileStorageService $fileService) {}

    /** GET /api/agent/v1/finance/tax-documents/{id}/download-url — finance.tax-documents.view */
    public function taxDocumentDownloadUrl(int $id): JsonResponse
    {
        $doc = FileForTaxDocument::where('id', $id)
            ->where('user_id', Auth::id())
            ->firstOrFail();

        if (! $doc->s3_path) {
            return response()->json(['message' => 'No file associated with this document.'], 404);
        }

        $doc->recordDownload();

        return $this->signedUrlResponse($doc->s3_path, $doc->original_filename, $doc->mime_type);
    }

    /** GET /api/agent/v1/finance/documents/{id}/download-url — finance.accounts.detail */
    public function documentDownloadUrl(int $id): JsonResponse
    {
        $document = FinDocument::query()
            ->where('id', $id)
            ->where('user_id', (int) Auth::id())
            ->firstOrFail();

        if ($document->document_kind === FinDocument::KIND_TAX_FORM && $document->taxDocument) {
            $taxDocument = $document->taxDocument;

            if (! $taxDocument->s3_path) {
                return response()->json(['message' => 'No file associated with this document.'], 404);
            }

            $taxDocument->recordDownload();

            return $this->signedUrlResponse($taxDocument->s3_path, $taxDocument->original_filename, $taxDocument->mime_type);
        }

        if (! $document->s3_path) {
            return response()->json(['message' => 'No file associated with this document.'], 404);
        }

        // Guard against poisoned/legacy rows whose s3_path sits outside the
        // owner's expected prefix for this document kind (IDOR hardening),
        // mirroring FinanceDocumentController::download().
        if (! FinDocument::isValidS3PathForOwner(
            $document->s3_path,
            (int) Auth::id(),
            $document->document_kind,
        )) {
            abort(404);
        }

        $document->recordDownload();

        return $this->signedUrlResponse($document->s3_path, $document->original_filename, $document->mime_type);
    }

    private function signedUrlResponse(string $s3Path, ?string $filename, ?string $mimeType): JsonResponse
    {
        $filename ??= 'document';
        $mimeType ??= 'application/octet-stream';

        return response()->json([
            'download_url' => $this->fileService->getSignedDownloadUrl($s3Path, $filename, self::URL_EXPIRATION_MINUTES),
            'view_url' => $this->fileService->getSignedViewUrl($s3Path, $mimeType, self::URL_EXPIRATION_MINUTES),
            'expires_in_seconds' => self::URL_EXPIRATION_MINUTES * 60,
            'filename' => $filename,
            'content_type' => $mimeType,
        ]);
    }
}
