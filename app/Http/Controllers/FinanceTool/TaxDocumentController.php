<?php

namespace App\Http\Controllers\FinanceTool;

use App\GenAiProcessor\Services\GenAiJobDispatcherService;
use App\Http\Controllers\Controller;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\FileStorageService;
use App\Services\TaxDocument\TaxDocumentCreationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class TaxDocumentController extends Controller
{
    protected FileStorageService $fileService;

    protected GenAiJobDispatcherService $dispatcherService;

    protected TaxDocumentCreationService $creationService;

    public function __construct(
        FileStorageService $fileService,
        GenAiJobDispatcherService $dispatcherService,
        TaxDocumentCreationService $creationService,
    ) {
        $this->fileService = $fileService;
        $this->dispatcherService = $dispatcherService;
        $this->creationService = $creationService;
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
            'misc_routing' => 'nullable|string|in:sch_c,sch_e,sch_1_line_8',
        ]);

        $userId = Auth::id();
        $formType = $request->form_type;

        if (in_array($formType, FileForTaxDocument::W2_FORM_TYPES)) {
            $request->validate(['employment_entity_id' => 'required|integer']);
            $this->verifyEmploymentEntityOwnership($request->employment_entity_id, $userId);
        }

        if (in_array($formType, FileForTaxDocument::ACCOUNT_FORM_TYPES)) {
            $request->validate(['account_id' => 'required|integer']);
            $this->verifyAccountOwnership($request->account_id, $userId);
        }

        $validated = $this->validateS3Key((string) $request->s3_key, $userId);
        if ($validated instanceof JsonResponse) {
            return $validated;
        }
        $s3Key = $validated['s3_key'];
        $storedFilename = $validated['stored_filename'];

        // When caller supplies pre-parsed JSON, skip AI processing entirely.
        $hasParsedData = $request->filled('parsed_data');

        $docAttributes = [
            'user_id' => $userId,
            'tax_year' => $request->tax_year,
            'form_type' => $formType,
            'employment_entity_id' => $request->employment_entity_id,
            'original_filename' => $request->original_filename,
            'stored_filename' => $storedFilename,
            's3_path' => $s3Key,
            'mime_type' => $request->input('mime_type', 'application/pdf'),
            'file_size_bytes' => $request->file_size_bytes,
            'file_hash' => $request->file_hash,
            'uploaded_by_user_id' => $userId,
            'notes' => $request->notes,
            'parsed_data' => $hasParsedData ? $request->parsed_data : null,
            'misc_routing' => $request->input('misc_routing'),
            'genai_status' => $hasParsedData ? 'parsed' : 'pending',
        ];

        $linkAttributes = null;
        if ($request->filled('account_id') && in_array($formType, FileForTaxDocument::ACCOUNT_FORM_TYPES)) {
            $linkAttributes = [
                'account_id' => $request->account_id,
                'form_type' => $formType,
                'tax_year' => $request->tax_year,
                'notes' => $request->notes,
            ];
        }

        $doc = $this->creationService->createSingleAccountDocument($docAttributes, $linkAttributes);

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

        $validated = $this->validateS3Key((string) $request->s3_key, $userId);
        if ($validated instanceof JsonResponse) {
            return $validated;
        }
        $s3Key = $validated['s3_key'];
        $storedFilename = $validated['stored_filename'];

        $doc = $this->creationService->createMultiAccountDocument(
            [
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
            ],
            $request->input('context_accounts', []),
        );

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
            'links.*.account_id' => 'nullable|integer|min:1',
            'links.*.form_type' => 'required|string|in:'.implode(',', FileForTaxDocument::FORM_TYPES),
            'links.*.tax_year' => 'required|integer|min:1900|max:2100',
            'links.*.ai_identifier' => 'nullable|string|max:100',
            'links.*.ai_account_name' => 'nullable|string|max:255',
        ]);

        $userId = Auth::id();

        DB::transaction(function () use ($doc, $request, $userId): void {
            // Verify ownership of all non-null account_ids in a single batch query.
            $requestedIds = array_values(array_unique(array_filter(
                array_column($request->links, 'account_id')
            )));
            if (! empty($requestedIds)) {
                $validCount = FinAccounts::withoutGlobalScopes()
                    ->where('acct_owner', $userId)
                    ->whereIn('acct_id', $requestedIds)
                    ->count();
                if ($validCount !== count($requestedIds)) {
                    abort(403, 'One or more accounts do not belong to you.');
                }
            }

            // Replace all existing links atomically.
            $doc->accountLinks()->delete();

            foreach ($request->links as $link) {
                TaxDocumentAccount::createLink(
                    $doc->id,
                    $link['account_id'] ?? null,
                    $link['form_type'],
                    $link['tax_year'],
                    aiIdentifier: $link['ai_identifier'] ?? null,
                    aiAccountName: $link['ai_account_name'] ?? null,
                );
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
            'account_id' => 'nullable|integer|min:1',
            'is_reviewed' => 'nullable|boolean',
            'notes' => 'nullable|string',
        ]);

        if ($request->has('account_id') && $request->account_id !== null) {
            $this->verifyAccountOwnership($request->account_id, Auth::id());
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

        $deleteDoc = false;

        DB::transaction(function () use ($doc, $link, &$deleteDoc): void {
            $link->delete();

            $remaining = TaxDocumentAccount::where('tax_document_id', $doc->id)->count();
            if ($remaining === 0) {
                // Last link removed — delete the parent document DB row inside the transaction.
                $doc->delete();
                $deleteDoc = true;
            }
        });

        // Defer S3 deletion until after the DB transaction has committed to avoid
        // leaving the DB row intact but the S3 object already deleted on rollback.
        if ($deleteDoc && $doc->s3_path) {
            $this->fileService->deleteFile($doc->s3_path);
        }

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
            $this->verifyAccountOwnership($request->account_id, $userId);
        }

        if (in_array($formType, FileForTaxDocument::W2_FORM_TYPES, true) && $request->filled('employment_entity_id')) {
            $this->verifyEmploymentEntityOwnership($request->employment_entity_id, $userId);
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
                TaxDocumentAccount::createLink(
                    $taxDoc->id,
                    $request->account_id,
                    $formType,
                    $request->tax_year,
                    $isReviewed,
                );
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
            'misc_routing' => 'nullable|string|in:sch_c,sch_e,sch_1_line_8',
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

        if ($request->has('misc_routing')) {
            $doc->misc_routing = $request->input('misc_routing');
        }

        $doc->save();

        // Write-through: keep account links in sync for notes/review state.
        $linkUpdates = [];
        if ($request->has('notes')) {
            $linkUpdates['notes'] = $request->notes;
        }
        if ($request->has('is_reviewed')) {
            $linkUpdates['is_reviewed'] = $request->boolean('is_reviewed');
        }
        $doc->syncToAccountLinks($linkUpdates);

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
        $request->validate([
            'notes' => 'nullable|string',
            'parsed_data' => 'nullable|array',
            'misc_routing' => 'nullable|string|in:sch_c,sch_e,sch_1_line_8',
        ]);

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

        if ($request->has('misc_routing')) {
            $doc->misc_routing = $request->input('misc_routing');
        }

        $doc->save();

        // Write-through: mark all account link rows reviewed too.
        $linkUpdates = ['is_reviewed' => true];
        if ($request->has('notes')) {
            $linkUpdates['notes'] = $request->notes;
        }
        $doc->syncToAccountLinks($linkUpdates);

        return response()->json($doc);
    }

    /**
     * Validate that an S3 key belongs to the given user and contains no path traversal.
     *
     * @return array{s3_key: string, stored_filename: string}|JsonResponse Parsed key parts on success, or error response.
     */
    private function validateS3Key(string $s3Key, int $userId): array|JsonResponse
    {
        $expectedPrefix = "tax_docs/{$userId}/";

        if (! str_starts_with($s3Key, $expectedPrefix)) {
            return response()->json(['message' => 'The selected file key is invalid.'], 422);
        }

        $storedFilename = basename($s3Key);
        $keySuffix = substr($s3Key, strlen($expectedPrefix));

        if ($storedFilename === '' || $storedFilename === '.' || $storedFilename === '..' || $keySuffix !== $storedFilename) {
            return response()->json(['message' => 'The selected file key is invalid.'], 422);
        }

        return ['s3_key' => $s3Key, 'stored_filename' => $storedFilename];
    }

    /**
     * Verify that the given account belongs to the given user. Throws 404 if not found.
     */
    private function verifyAccountOwnership(int $accountId, int $userId): FinAccounts
    {
        return FinAccounts::withoutGlobalScopes()
            ->where('acct_id', $accountId)
            ->where('acct_owner', $userId)
            ->firstOrFail();
    }

    /**
     * Verify that the given employment entity belongs to the given user. Throws 404 if not found.
     */
    private function verifyEmploymentEntityOwnership(int $entityId, int $userId): FinEmploymentEntity
    {
        return FinEmploymentEntity::withoutGlobalScopes()
            ->where('id', $entityId)
            ->where('user_id', $userId)
            ->firstOrFail();
    }
}
