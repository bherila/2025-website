<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Services\FileStorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class TaxDocumentController extends Controller
{
    protected FileStorageService $fileService;

    public function __construct(FileStorageService $fileService)
    {
        $this->fileService = $fileService;
    }

    public function index(Request $request): JsonResponse
    {
        $userId = Auth::id();

        $query = FileForTaxDocument::where('user_id', $userId)
            ->with([
                'uploader:id,name',
                'employmentEntity:id,display_name',
                'account:acct_id,acct_name',
            ])
            ->orderBy('tax_year', 'desc')
            ->orderBy('created_at', 'desc');

        if ($request->filled('year')) {
            $query->where('tax_year', (int) $request->year);
        }

        if ($request->filled('form_type')) {
            $types = array_filter(array_map('trim', explode(',', $request->form_type)));
            $query->whereIn('form_type', $types);
        }

        if ($request->filled('employment_entity_id')) {
            $query->where('employment_entity_id', (int) $request->employment_entity_id);
        }

        if ($request->filled('account_id')) {
            $query->where('account_id', (int) $request->account_id);
        }

        return response()->json($query->get());
    }

    public function requestUpload(Request $request): JsonResponse
    {
        $request->validate([
            'filename' => 'required|string|max:255',
            'content_type' => 'nullable|string|max:255',
            'file_size' => 'required|integer|min:1|max:104857600',
        ]);

        $contentType = $request->input('content_type', 'application/pdf');
        $storedFilename = FileForTaxDocument::generateStoredFilename($request->filename);
        $s3Path = FileForTaxDocument::generateS3Path(Auth::id(), $storedFilename);

        $uploadUrl = $this->fileService->getSignedUploadUrl($s3Path, $contentType, 15);

        return response()->json([
            'upload_url' => $uploadUrl,
            's3_key' => $s3Path,
            'expires_in' => 900,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            's3_key' => 'required|string',
            'original_filename' => 'required|string|max:255',
            'form_type' => 'required|string|in:'.implode(',', FileForTaxDocument::FORM_TYPES),
            'tax_year' => 'required|integer|min:1900|max:2100',
            'file_size_bytes' => 'required|integer|min:1',
            'file_hash' => 'required|string',
            'mime_type' => 'nullable|string|max:255',
            'employment_entity_id' => 'nullable|integer',
            'account_id' => 'nullable|integer',
            'notes' => 'nullable|string',
        ]);

        $userId = Auth::id();
        $formType = $request->form_type;

        if (in_array($formType, FileForTaxDocument::W2_FORM_TYPES)) {
            $request->validate(['employment_entity_id' => 'required|integer']);
            FinEmploymentEntity::withoutGlobalScopes()
                ->where('id', $request->employment_entity_id)
                ->where('user_id', $userId)
                ->firstOrFail();
        }

        if (in_array($formType, FileForTaxDocument::ACCOUNT_FORM_TYPES)) {
            $request->validate(['account_id' => 'required|integer']);
            FinAccounts::withoutGlobalScopes()
                ->where('acct_id', $request->account_id)
                ->where('acct_owner', $userId)
                ->firstOrFail();
        }

        $s3Key = (string) $request->s3_key;
        $expectedPrefix = "tax_docs/{$userId}/";

        if (! str_starts_with($s3Key, $expectedPrefix)) {
            return response()->json([
                'message' => 'The selected file key is invalid.',
            ], 422);
        }

        $storedFilename = basename($s3Key);
        $keySuffix = substr($s3Key, strlen($expectedPrefix));

        if ($storedFilename === '' || $storedFilename === '.' || $storedFilename === '..' || $keySuffix !== $storedFilename) {
            return response()->json([
                'message' => 'The selected file key is invalid.',
            ], 422);
        }

        $doc = FileForTaxDocument::create([
            'user_id' => $userId,
            'tax_year' => $request->tax_year,
            'form_type' => $formType,
            'employment_entity_id' => $request->employment_entity_id,
            'account_id' => $request->account_id,
            'original_filename' => $request->original_filename,
            'stored_filename' => $storedFilename,
            's3_path' => $s3Key,
            'mime_type' => $request->input('mime_type', 'application/pdf'),
            'file_size_bytes' => $request->file_size_bytes,
            'file_hash' => $request->file_hash,
            'uploaded_by_user_id' => $userId,
            'notes' => $request->notes,
            'is_reconciled' => false,
        ]);

        return response()->json(
            $doc->load(['uploader:id,name', 'employmentEntity:id,display_name', 'account:acct_id,acct_name']),
            201
        );
    }

    public function download(int $id): JsonResponse
    {
        $doc = FileForTaxDocument::where('id', $id)
            ->where('user_id', Auth::id())
            ->firstOrFail();

        $doc->recordDownload();

        $viewUrl = $this->fileService->getSignedViewUrl($doc->s3_path, $doc->mime_type);
        $downloadUrl = $this->fileService->getSignedDownloadUrl($doc->s3_path, $doc->original_filename);

        return response()->json([
            'view_url' => $viewUrl,
            'download_url' => $downloadUrl,
            'filename' => $doc->original_filename,
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $doc = FileForTaxDocument::where('id', $id)
            ->where('user_id', Auth::id())
            ->firstOrFail();

        $this->fileService->deleteFileRecord($doc);

        return response()->json(['success' => true]);
    }

    public function updateReconciled(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'is_reconciled' => 'required|boolean',
        ]);

        $doc = FileForTaxDocument::where('id', $id)
            ->where('user_id', Auth::id())
            ->firstOrFail();

        $doc->is_reconciled = $request->boolean('is_reconciled');
        $doc->save();

        return response()->json($doc);
    }

    public function updateParsedData(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'parsed_data' => 'required|array',
        ]);

        $doc = FileForTaxDocument::where('id', $id)
            ->where('user_id', Auth::id())
            ->firstOrFail();

        if ($doc->is_confirmed) {
            return response()->json(['message' => 'Cannot edit confirmed document. Unconfirm first.'], 422);
        }

        $doc->parsed_data = $request->parsed_data;
        $doc->save();

        return response()->json($doc);
    }

    public function updateConfirmed(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'is_confirmed' => 'required|boolean',
        ]);

        $doc = FileForTaxDocument::where('id', $id)
            ->where('user_id', Auth::id())
            ->firstOrFail();

        $doc->is_confirmed = $request->boolean('is_confirmed');
        $doc->save();

        return response()->json($doc);
    }
}
