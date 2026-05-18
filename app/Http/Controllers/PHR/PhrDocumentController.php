<?php

namespace App\Http\Controllers\PHR;

use App\Http\Controllers\Controller;
use App\Models\PhrDocument;
use App\Services\PHR\Access\PhrPatientAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PhrDocumentController extends Controller
{
    public function __construct(private PhrPatientAccessService $accessService) {}

    public function index(Request $request, int $patient): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->accessiblePatient($patient, $userId);

        $documents = PhrDocument::query()
            ->where('patient_id', $resolvedPatient->id)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (PhrDocument $document): array => $this->payload($document))
            ->values();

        return response()->json(['documents' => $documents]);
    }

    public function download(Request $request, PhrDocument $document): StreamedResponse
    {
        $userId = (int) $request->user()?->id;
        $this->accessService->accessiblePatient((int) $document->patient_id, $userId);

        abort_unless($document->storage_path !== null, 404);
        abort_unless(Storage::disk($document->storage_disk)->exists($document->storage_path), 404);

        return Storage::disk($document->storage_disk)->download(
            $document->storage_path,
            $document->original_filename ?? ('phr-document-'.$document->id)
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(PhrDocument $document): array
    {
        return [
            'id' => $document->id,
            'patient_id' => $document->patient_id,
            'title' => $document->title,
            'document_type' => $document->document_type,
            'original_filename' => $document->original_filename,
            'mime_type' => $document->mime_type,
            'file_size_bytes' => $document->file_size_bytes,
            'summary' => $document->summary,
            'source' => $document->source,
            'imported_at' => $document->imported_at?->toDateTimeString(),
            'created_at' => $document->created_at?->toDateTimeString(),
            'download_url' => $document->storage_path ? URL::temporarySignedRoute('phr.documents.download', now()->addMinutes(15), ['document' => $document->id]) : null,
        ];
    }
}
