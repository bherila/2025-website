<?php

namespace App\Http\Controllers\FinanceTool;

use App\GenAiProcessor\Jobs\ParseImportJob;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Services\GenAiJobDispatcherService;
use App\Http\Controllers\Controller;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\FileStorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class TaxDocumentController extends Controller
{
    protected FileStorageService $fileService;

    protected GenAiJobDispatcherService $dispatcherService;

    public function __construct(FileStorageService $fileService, GenAiJobDispatcherService $dispatcherService)
    {
        $this->fileService = $fileService;
        $this->dispatcherService = $dispatcherService;
    }

    public function index(Request $request): JsonResponse
    {
        $userId = Auth::id();

        $query = FileForTaxDocument::where('user_id', $userId)
            ->with([
                'uploader:id,name',
                'employmentEntity:id,display_name',
                'account:acct_id,acct_name',
                'accountLinks.account:acct_id,acct_name',
            ])
            ->orderBy('tax_year', 'desc')
            ->orderBy('created_at', 'desc');

        if ($request->filled('year')) {
            $query->where('tax_year', (int) $request->year);
        }

        if ($request->filled('form_type')) {
            $types = array_filter(array_map('trim', explode(',', $request->form_type)));
            // Match on the parent document form_type OR on any account link form_type
            $query->where(function ($q) use ($types): void {
                $q->whereIn('form_type', $types)
                    ->orWhereHas('accountLinks', fn ($lq) => $lq->whereIn('form_type', $types));
            });
        }

        if ($request->filled('employment_entity_id')) {
            $query->where('employment_entity_id', (int) $request->employment_entity_id);
        }

        if ($request->filled('account_id')) {
            // Use the join table as the canonical source of truth.
            $query->whereHas('accountLinks', fn ($q) => $q->where('account_id', (int) $request->account_id));
        }

        if ($request->filled('genai_status')) {
            $query->where('genai_status', $request->genai_status);
        }

        if ($request->filled('is_reviewed')) {
            $query->where('is_reviewed', $request->boolean('is_reviewed'));
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
            'parsed_data' => 'nullable|array',
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

        // When caller supplies pre-parsed JSON, skip AI processing entirely.
        $hasParsedData = $request->filled('parsed_data');

        $doc = DB::transaction(function () use ($request, $userId, $formType, $s3Key, $storedFilename, $hasParsedData): FileForTaxDocument {
            $taxDoc = FileForTaxDocument::create([
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
                'parsed_data' => $hasParsedData ? $request->parsed_data : null,
                'genai_status' => $hasParsedData ? 'parsed' : 'pending',
            ]);

            // Create the canonical account link for account-based form types.
            if ($request->filled('account_id') && in_array($formType, FileForTaxDocument::ACCOUNT_FORM_TYPES)) {
                TaxDocumentAccount::create([
                    'tax_document_id' => $taxDoc->id,
                    'account_id' => $request->account_id,
                    'form_type' => $formType,
                    'tax_year' => $request->tax_year,
                    'is_reviewed' => false,
                    'notes' => $request->notes,
                ]);
            }

            if (! $hasParsedData) {
                $genaiJob = GenAiImportJob::create([
                    'user_id' => $userId,
                    'job_type' => 'tax_document',
                    'file_hash' => $request->file_hash,
                    'original_filename' => $request->original_filename,
                    's3_path' => $s3Key,
                    'mime_type' => $request->input('mime_type', 'application/pdf'),
                    'file_size_bytes' => $request->file_size_bytes,
                    'context_json' => json_encode([
                        'tax_year' => (int) $request->tax_year,
                        'form_type' => $formType,
                        'tax_document_id' => $taxDoc->id,
                    ]),
                    'status' => 'pending',
                ]);

                $taxDoc->update(['genai_job_id' => $genaiJob->id]);
            }

            return $taxDoc;
        });

        if (! $hasParsedData) {
            ParseImportJob::dispatch($doc->genai_job_id);
        }

        return response()->json(
            $doc->load(['uploader:id,name', 'employmentEntity:id,display_name', 'account:acct_id,acct_name', 'accountLinks.account:acct_id,acct_name']),
            201
        );
    }

    /**
     * Upload a multi-account consolidated PDF (e.g. a Fidelity Tax Reporting Statement).
     * No account_id is required at upload time — accounts are matched after AI parsing.
     */
    public function storeMultiAccount(Request $request): JsonResponse
    {
        $request->validate([
            's3_key' => 'required|string',
            'original_filename' => 'required|string|max:255',
            'tax_year' => 'required|integer|min:1900|max:2100',
            'file_size_bytes' => 'required|integer|min:1',
            'file_hash' => 'required|string',
            'mime_type' => 'nullable|string|max:255',
            'context_accounts' => 'nullable|array',
            'context_accounts.*.name' => 'nullable|string|max:255',
            'context_accounts.*.last4' => 'nullable|string|max:4',
        ]);

        $userId = Auth::id();
        $s3Key = (string) $request->s3_key;
        $expectedPrefix = "tax_docs/{$userId}/";

        if (! str_starts_with($s3Key, $expectedPrefix)) {
            return response()->json(['message' => 'The selected file key is invalid.'], 422);
        }

        $storedFilename = basename($s3Key);
        $keySuffix = substr($s3Key, strlen($expectedPrefix));

        if ($storedFilename === '' || $storedFilename === '.' || $storedFilename === '..' || $keySuffix !== $storedFilename) {
            return response()->json(['message' => 'The selected file key is invalid.'], 422);
        }

        $doc = DB::transaction(function () use ($request, $userId, $s3Key, $storedFilename): FileForTaxDocument {
            $taxDoc = FileForTaxDocument::create([
                'user_id' => $userId,
                'tax_year' => $request->tax_year,
                'form_type' => 'broker_1099',
                'original_filename' => $request->original_filename,
                'stored_filename' => $storedFilename,
                's3_path' => $s3Key,
                'mime_type' => $request->input('mime_type', 'application/pdf'),
                'file_size_bytes' => $request->file_size_bytes,
                'file_hash' => $request->file_hash,
                'uploaded_by_user_id' => $userId,
                'genai_status' => 'pending',
            ]);

            $genaiJob = GenAiImportJob::create([
                'user_id' => $userId,
                'job_type' => 'tax_form_multi_account_import',
                'file_hash' => $request->file_hash,
                'original_filename' => $request->original_filename,
                's3_path' => $s3Key,
                'mime_type' => $request->input('mime_type', 'application/pdf'),
                'file_size_bytes' => $request->file_size_bytes,
                'context_json' => json_encode([
                    'tax_document_id' => $taxDoc->id,
                    'tax_year' => (int) $request->tax_year,
                    'accounts' => $request->input('context_accounts', []),
                ]),
                'status' => 'pending',
            ]);

            $taxDoc->update(['genai_job_id' => $genaiJob->id]);

            return $taxDoc;
        });

        ParseImportJob::dispatch($doc->genai_job_id);

        return response()->json(
            $doc->load(['uploader:id,name', 'accountLinks.account:acct_id,acct_name']),
            201
        );
    }

    /**
     * Confirm (or update) the account links for a document after multi-account AI parsing.
     *
     * Replaces all existing account links with the provided set. Each link may have
     * account_id = null if the user has not yet resolved the account mapping.
     */
    public function confirmAccountLinks(Request $request, int $id): JsonResponse
    {
        $doc = FileForTaxDocument::where('id', $id)
            ->where('user_id', Auth::id())
            ->firstOrFail();

        $request->validate([
            'links' => 'required|array|min:1',
            'links.*.account_id' => 'nullable|integer',
            'links.*.form_type' => 'required|string|in:'.implode(',', FileForTaxDocument::FORM_TYPES),
            'links.*.tax_year' => 'required|integer|min:1900|max:2100',
        ]);

        $userId = Auth::id();

        DB::transaction(function () use ($doc, $request, $userId): void {
            // Verify ownership of any provided account_id values.
            foreach ($request->links as $link) {
                if (! empty($link['account_id'])) {
                    FinAccounts::withoutGlobalScopes()
                        ->where('acct_id', $link['account_id'])
                        ->where('acct_owner', $userId)
                        ->firstOrFail();
                }
            }

            // Replace all existing links atomically.
            $doc->accountLinks()->delete();

            foreach ($request->links as $link) {
                TaxDocumentAccount::create([
                    'tax_document_id' => $doc->id,
                    'account_id' => $link['account_id'] ?? null,
                    'form_type' => $link['form_type'],
                    'tax_year' => $link['tax_year'],
                    'is_reviewed' => false,
                ]);
            }
        });

        return response()->json(
            $doc->fresh(['uploader:id,name', 'employmentEntity:id,display_name', 'accountLinks.account:acct_id,acct_name'])
        );
    }

    /**
     * Update a single account link row (e.g. to assign account_id for an unresolved link,
     * or to mark it reviewed / add notes).
     */
    public function updateAccountLink(Request $request, int $id, int $linkId): JsonResponse
    {
        $doc = FileForTaxDocument::where('id', $id)
            ->where('user_id', Auth::id())
            ->firstOrFail();

        $link = TaxDocumentAccount::where('id', $linkId)
            ->where('tax_document_id', $doc->id)
            ->firstOrFail();

        $request->validate([
            'account_id' => 'nullable|integer',
            'is_reviewed' => 'nullable|boolean',
            'notes' => 'nullable|string',
        ]);

        if ($request->has('account_id') && ! empty($request->account_id)) {
            FinAccounts::withoutGlobalScopes()
                ->where('acct_id', $request->account_id)
                ->where('acct_owner', Auth::id())
                ->firstOrFail();
            $link->account_id = $request->account_id;
        } elseif ($request->has('account_id')) {
            $link->account_id = null;
        }

        if ($request->has('is_reviewed')) {
            $link->is_reviewed = $request->boolean('is_reviewed');
        }

        if ($request->has('notes')) {
            $link->notes = $request->notes;
        }

        $link->save();

        return response()->json($link->load('account:acct_id,acct_name'));
    }

    /**
     * Delete a single account link. If it was the last link, also deletes the parent
     * document and queues S3 cleanup.
     */
    public function destroyAccountLink(int $id, int $linkId): JsonResponse
    {
        $doc = FileForTaxDocument::where('id', $id)
            ->where('user_id', Auth::id())
            ->firstOrFail();

        $link = TaxDocumentAccount::where('id', $linkId)
            ->where('tax_document_id', $doc->id)
            ->firstOrFail();

        DB::transaction(function () use ($doc, $link): void {
            $link->delete();

            $remaining = TaxDocumentAccount::where('tax_document_id', $doc->id)->count();
            if ($remaining === 0) {
                // Last link removed — clean up the parent document and its S3 file.
                $this->fileService->deleteFileRecord($doc);
            }
        });

        return response()->json(['success' => true]);
    }

    /**
     * Return the LLM prompt text and JSON schema for a given form type.
     */
    public function getPromptInfo(Request $request): JsonResponse
    {
        $formType = (string) ($request->query('form_type') ?? 'w2');
        $taxYear = is_numeric($request->query('tax_year')) ? (int) $request->query('tax_year') : (int) date('Y');

        if (! in_array($formType, FileForTaxDocument::FORM_TYPES, true)) {
            return response()->json(['message' => 'Invalid form type.'], 422);
        }

        $effectiveType = match ($formType) {
            'w2c' => 'w2',
            '1099_int_c' => '1099_int',
            '1099_div_c' => '1099_div',
            default => $formType,
        };

        try {
            $info = $this->dispatcherService->getTaxDocumentPromptInfo($effectiveType, $taxYear);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($info);
    }

    /**
     * Store a manually-entered tax document (no PDF upload, just data entry).
     */
    public function storeManual(Request $request): JsonResponse
    {
        $request->validate([
            'form_type' => 'required|string|in:'.implode(',', FileForTaxDocument::FORM_TYPES),
            'tax_year' => 'required|integer|min:1900|max:2100',
            'parsed_data' => 'required|array',
            'is_confirmed' => 'boolean',
            'employment_entity_id' => 'nullable|integer',
            'account_id' => 'nullable|integer',
        ]);

        $userId = Auth::id();
        $formType = $request->form_type;

        if (in_array($formType, FileForTaxDocument::ACCOUNT_FORM_TYPES, true)) {
            $request->validate(['account_id' => 'required|integer']);
            $exists = FinAccounts::withoutGlobalScopes()
                ->where('acct_id', $request->account_id)
                ->where('acct_owner', $userId)
                ->exists();
            if (! $exists) {
                return response()->json(['message' => 'Account not found.'], 404);
            }
        }

        if (in_array($formType, FileForTaxDocument::W2_FORM_TYPES, true) && $request->filled('employment_entity_id')) {
            $exists = FinEmploymentEntity::where('id', $request->employment_entity_id)
                ->where('user_id', $userId)
                ->exists();
            if (! $exists) {
                return response()->json(['message' => 'Employment entity not found.'], 404);
            }
        }

        $isReviewed = $request->boolean('is_reviewed', false);

        $doc = DB::transaction(function () use ($request, $userId, $formType, $isReviewed): FileForTaxDocument {
            $taxDoc = FileForTaxDocument::create([
                'user_id' => $userId,
                'tax_year' => $request->tax_year,
                'form_type' => $formType,
                'employment_entity_id' => in_array($formType, FileForTaxDocument::W2_FORM_TYPES, true)
                    ? $request->employment_entity_id
                    : null,
                'account_id' => in_array($formType, FileForTaxDocument::ACCOUNT_FORM_TYPES, true)
                    ? $request->account_id
                    : null,
                'original_filename' => 'Manual entry',
                'stored_filename' => 'manual-entry',
                's3_path' => '',
                'mime_type' => 'application/octet-stream',
                'file_size_bytes' => 0,
                'file_hash' => '',
                'uploaded_by_user_id' => $userId,
                'genai_status' => 'parsed',
                'parsed_data' => $request->parsed_data,
                'is_reviewed' => $isReviewed,
            ]);

            // Create the canonical account link for account-based form types.
            if ($request->filled('account_id') && in_array($formType, FileForTaxDocument::ACCOUNT_FORM_TYPES, true)) {
                TaxDocumentAccount::create([
                    'tax_document_id' => $taxDoc->id,
                    'account_id' => $request->account_id,
                    'form_type' => $formType,
                    'tax_year' => $request->tax_year,
                    'is_reviewed' => $isReviewed,
                ]);
            }

            return $taxDoc;
        });

        return response()->json(
            $doc->load(['uploader:id,name', 'employmentEntity:id,display_name', 'account:acct_id,acct_name', 'accountLinks.account:acct_id,acct_name']),
            201
        );
    }

    public function show(int $id): JsonResponse
    {
        $doc = FileForTaxDocument::where('id', $id)
            ->where('user_id', Auth::id())
            ->with(['uploader:id,name', 'employmentEntity:id,display_name', 'account:acct_id,acct_name', 'accountLinks.account:acct_id,acct_name'])
            ->firstOrFail();

        return response()->json($doc);
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

        // Deletes account links via DB cascade; booted() event queues S3 cleanup.
        $this->fileService->deleteFileRecord($doc);

        return response()->json(['success' => true]);
    }

    /**
     * Update tax document fields (notes, reviewed state, parsed_data).
     * Also writes through to account link rows so per-account state stays in sync.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'notes' => 'nullable|string',
            'is_reviewed' => 'nullable|boolean',
            'parsed_data' => 'nullable|array',
        ]);

        $doc = FileForTaxDocument::where('id', $id)
            ->where('user_id', Auth::id())
            ->firstOrFail();

        if ($request->has('notes')) {
            $doc->notes = $request->notes;
        }

        if ($request->has('is_reviewed')) {
            $doc->is_reviewed = $request->boolean('is_reviewed');
        }

        if ($request->has('parsed_data')) {
            $doc->parsed_data = $request->parsed_data;
        }

        $doc->save();

        // Write-through: keep single account link in sync for single-account documents.
        if ($request->has('notes') || $request->has('is_reviewed')) {
            $updates = array_filter([
                'notes' => $request->has('notes') ? $request->notes : null,
                'is_reviewed' => $request->has('is_reviewed') ? $request->boolean('is_reviewed') : null,
            ], fn ($v) => $v !== null);
            if (! empty($updates)) {
                $doc->accountLinks()->update($updates);
            }
        }

        return response()->json($doc);
    }

    /**
     * Return all reviewed tax documents for the authenticated user.
     */
    public function getAllReviewed(Request $request): JsonResponse
    {
        $userId = Auth::id();

        $query = FileForTaxDocument::where('user_id', $userId)
            ->where('is_reviewed', true)
            ->with([
                'uploader:id,name',
                'employmentEntity:id,display_name',
                'account:acct_id,acct_name',
                'accountLinks.account:acct_id,acct_name',
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

        return response()->json($query->get());
    }

    /**
     * Atomically mark a document as reviewed.
     * Also writes through to all account link rows.
     */
    public function markReviewed(int $id, Request $request): JsonResponse
    {
        $doc = FileForTaxDocument::where('id', $id)
            ->where('user_id', Auth::id())
            ->firstOrFail();

        $doc->is_reviewed = true;

        if ($request->has('notes')) {
            $doc->notes = $request->notes;
        }

        if ($request->has('parsed_data')) {
            $doc->parsed_data = $request->parsed_data;
        }

        $doc->save();

        // Write-through: mark all account link rows reviewed too.
        $linkUpdates = ['is_reviewed' => true];
        if ($request->has('notes')) {
            $linkUpdates['notes'] = $request->notes;
        }
        $doc->accountLinks()->update($linkUpdates);

        return response()->json($doc);
    }
}
