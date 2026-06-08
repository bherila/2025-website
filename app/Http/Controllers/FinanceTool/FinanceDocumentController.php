<?php

namespace App\Http\Controllers\FinanceTool;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Models\GenAiImportResult;
use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\IndexDocumentsRequest;
use App\Http\Requests\Finance\StoreTaxFormDocumentRequest;
use App\Http\Resources\FinanceTool\FinDocumentDetailResource;
use App\Http\Resources\FinanceTool\FinDocumentResource;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinDocument;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Services\FileStorageService;
use App\Services\Finance\DocumentCapabilityService;
use App\Services\Finance\DocumentIngestionService;
use App\Services\Finance\TaxDocumentParsedDataNormalizer;
use App\Services\Finance\TransactionDeletionTombstoneService;
use App\Services\TaxDocument\TaxDocumentCreationService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class FinanceDocumentController extends Controller
{
    public function __construct(
        private readonly FileStorageService $fileStorageService,
        private readonly DocumentIngestionService $documentIngestionService,
        private readonly TaxDocumentCreationService $taxDocumentCreationService,
        private readonly TaxDocumentParsedDataNormalizer $taxDocumentParsedDataNormalizer,
        private readonly DocumentCapabilityService $documentCapabilityService,
        private readonly TransactionDeletionTombstoneService $transactionDeletionTombstoneService,
    ) {}

    public function index(IndexDocumentsRequest $request): JsonResponse
    {
        $query = FinDocument::query()
            ->where('user_id', (int) Auth::id())
            ->with([
                'accounts.account:acct_id,acct_name,acct_number',
                'taxDocument:id,document_id,form_type,tax_year,is_reviewed,genai_status',
                'lots:lot_id,document_id',
            ])
            ->orderByDesc('tax_year')
            ->orderByDesc('period_end')
            ->orderByDesc('created_at');

        if ($request->filled('document_kind')) {
            $kinds = array_filter(array_map('trim', explode(',', (string) $request->input('document_kind'))));
            $query->whereIn('document_kind', $kinds);
        }

        if ($request->filled('tax_year')) {
            $query->where('tax_year', (int) $request->input('tax_year'));
        }

        if ($request->filled('account_id')) {
            $query->whereHas('accounts', fn ($accountQuery) => $accountQuery->where('account_id', (int) $request->input('account_id')));
        }

        if ($request->filled('q')) {
            $search = (string) $request->input('q');
            $query->where(function ($q) use ($search) {
                $q->where('original_filename', 'like', "%{$search}%")
                    ->orWhere('notes', 'like', "%{$search}%");
            });
        }

        if ($request->filled('form_type')) {
            $formType = (string) $request->input('form_type');
            $query->where(function ($q) use ($formType): void {
                $q->whereHas('accounts', fn ($accountQuery) => $accountQuery->where('form_type', $formType))
                    ->orWhereHas('taxDocument', fn ($taxQuery) => $taxQuery->where('form_type', $formType));
            });
        }

        if ($request->filled('genai_status')) {
            $query->where('genai_status', (string) $request->input('genai_status'));
        }

        if ($request->filled('processing_status')) {
            $status = (string) $request->input('processing_status');
            match ($status) {
                'needs_review' => $query->where('parsed_data_needs_review', true),
                'reviewed' => $query->where('is_reviewed', true),
                'unreviewed' => $query->where('is_reviewed', false),
                default => $query->where('genai_status', $status),
            };
        }

        if ($request->filled('is_reviewed')) {
            $query->where('is_reviewed', $request->boolean('is_reviewed'));
        }

        if ($request->filled('missing_account') && $request->boolean('missing_account')) {
            $query->whereHas('accounts', fn ($q) => $q->whereNull('account_id'));
        }

        if ($request->filled('has_tax_document')) {
            if ($request->boolean('has_tax_document')) {
                $query->whereHas('taxDocument');
            } else {
                $query->whereDoesntHave('taxDocument');
            }
        }

        if ($request->filled('has_statement')) {
            if ($request->boolean('has_statement')) {
                $query->whereHas('statements');
            } else {
                $query->whereDoesntHave('statements');
            }
        }

        if ($request->filled('has_lots')) {
            if ($request->boolean('has_lots')) {
                $query->whereHas('lots');
            } else {
                $query->whereDoesntHave('lots');
            }
        }

        if ($request->filled('source_job_id')) {
            $query->where('genai_job_id', (int) $request->input('source_job_id'));
        }

        match ((string) $request->input('sort', 'default')) {
            'name_asc' => $query->reorder('original_filename'),
            'kind_asc' => $query->reorder('document_kind')->orderByDesc('created_at'),
            'tax_year_desc' => $query->reorder('tax_year', 'desc')->orderByDesc('created_at'),
            'period_end_desc' => $query->reorder('period_end', 'desc')->orderByDesc('created_at'),
            'created_desc' => $query->reorder()->orderByDesc('created_at')->orderByDesc('id'),
            default => null,
        };

        $perPage = $request->integer('per_page', 50);

        return FinDocumentResource::collection($query->paginate($perPage))->toResponse($request);
    }

    public function summary(): JsonResponse
    {
        $userId = (int) Auth::id();

        $byKind = DB::table('fin_documents')
            ->where('user_id', $userId)
            ->select('document_kind', DB::raw('COUNT(*) as count'))
            ->groupBy('document_kind')
            ->pluck('count', 'document_kind');

        $byYear = DB::table('fin_documents')
            ->where('user_id', $userId)
            ->whereNotNull('tax_year')
            ->select('tax_year', DB::raw('COUNT(*) as count'))
            ->groupBy('tax_year')
            ->orderByDesc('tax_year')
            ->pluck('count', 'tax_year');

        $byStatus = DB::table('fin_documents')
            ->where('user_id', $userId)
            ->select('genai_status', DB::raw('COUNT(*) as count'))
            ->groupBy('genai_status')
            ->pluck('count', 'genai_status');

        $missingAccountCount = DB::table('fin_document_accounts')
            ->join('fin_documents', 'fin_documents.id', '=', 'fin_document_accounts.document_id')
            ->where('fin_documents.user_id', $userId)
            ->whereNull('fin_document_accounts.account_id')
            ->count();

        return response()->json([
            'by_kind' => $byKind,
            'by_year' => $byYear,
            'by_status' => $byStatus,
            'missing_account_count' => $missingAccountCount,
            'total' => DB::table('fin_documents')->where('user_id', $userId)->count(),
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $document = FinDocument::query()
            ->where('id', $id)
            ->where('user_id', (int) Auth::id())
            ->with([
                'accounts.account:acct_id,acct_name,acct_number',
                'genaiJob:id,status,job_type,ai_provider,ai_model,original_filename,parsed_at',
                'taxDocument.uploader:id,name',
                'taxDocument.employmentEntity:id,display_name',
                'taxDocument.account:acct_id,acct_name,acct_number',
                'taxDocument.accountLinks.account:acct_id,acct_name,acct_number',
                'statements' => fn ($query) => $query
                    ->select([
                        'statement_id',
                        'document_id',
                        'acct_id',
                        'statement_closing_date',
                        'balance',
                        'genai_job_id',
                    ])
                    ->with([
                        'account:acct_id,acct_name,acct_number',
                        'genaiJob:id,status,job_type,ai_provider,ai_model,original_filename,parsed_at',
                    ])
                    ->withCount([
                        'transactions as imported_transactions_count',
                        'lots as imported_lots_count',
                    ]),
                'lots',
            ])
            ->firstOrFail();

        return response()->json((new FinDocumentDetailResource($document))->resolve(request()));
    }

    public function download(int $id): JsonResponse
    {
        $document = FinDocument::query()
            ->where('id', $id)
            ->where('user_id', (int) Auth::id())
            ->firstOrFail();

        if ($document->document_kind === FinDocument::KIND_TAX_FORM && $document->taxDocument) {
            return $this->downloadTaxDocument($document->taxDocument);
        }

        if (! $document->s3_path) {
            return response()->json(['message' => 'No file associated with this document.'], 404);
        }

        // Guard against poisoned/legacy rows whose s3_path sits outside the
        // owner's expected prefix for this document kind (IDOR hardening).
        if (! FinDocument::isValidS3PathForOwner(
            $document->s3_path,
            (int) Auth::id(),
            $document->document_kind,
        )) {
            abort(404);
        }

        $document->recordDownload();

        $filename = $document->original_filename ?? 'document';
        $mimeType = $document->mime_type ?? 'application/octet-stream';

        $viewUrl = $this->fileStorageService->getSignedViewUrl($document->s3_path, $mimeType);
        $downloadUrl = $this->fileStorageService->getSignedDownloadUrl($document->s3_path, $filename);

        return response()->json([
            'view_url' => $viewUrl,
            'download_url' => $downloadUrl,
            'filename' => $filename,
        ]);
    }

    public function impactPreview(int $id): JsonResponse
    {
        $document = FinDocument::query()
            ->where('id', $id)
            ->where('user_id', (int) Auth::id())
            ->firstOrFail();

        return response()->json($this->documentCapabilityService->computeImpactSummary($document));
    }

    public function destroy(int $id, Request $request): JsonResponse
    {
        $document = FinDocument::query()
            ->where('id', $id)
            ->where('user_id', (int) Auth::id())
            ->firstOrFail();

        if ($document->document_kind === FinDocument::KIND_TAX_FORM) {
            abort(403, 'Tax form documents cannot be deleted via this endpoint. Use DELETE /api/finance/tax-documents/{id} instead.');
        }

        $request->validate([
            'impact_hash' => 'required|string',
        ]);

        // Recompute impact to verify hash
        $impact = $this->documentCapabilityService->computeImpactSummary($document);

        if ($impact['impact_hash'] !== (string) $request->input('impact_hash')) {
            return response()->json([
                'message' => 'Impact hash mismatch. The document state has changed since the preview was generated.',
            ], 409);
        }

        // Delete associated records, then the document
        DB::transaction(function () use ($document) {
            $transactions = $this->documentTransactions($document)->get(['t_id', 't_account']);
            $this->transactionDeletionTombstoneService->record($transactions, (int) $document->user_id);

            if ($transactions->isNotEmpty()) {
                FinAccountLineItems::query()
                    ->whereKey($transactions->pluck('t_id')->all())
                    ->delete();
            }

            $document->lots()->delete();
            $document->statements->each(function ($statement): void {
                $statement->details()->delete();
                $statement->delete();
            });
            $document->accounts()->delete();
            if ($document->taxDocument) {
                $document->taxDocument->delete();
            }
            if ($document->s3_path) {
                $this->fileStorageService->deleteFile($document->s3_path);
            }
            $document->delete();
        });

        return response()->json(['message' => 'Document deleted successfully.']);
    }

    /**
     * Imported ledger transactions linked to this document's statements.
     *
     * @return Builder<FinAccountLineItems>
     */
    private function documentTransactions(FinDocument $document): Builder
    {
        return FinAccountLineItems::query()
            ->whereIn('statement_id', $document->statements()->select('statement_id'));
    }

    private function downloadTaxDocument(FileForTaxDocument $taxDocument): JsonResponse
    {
        if (! $taxDocument->s3_path) {
            return response()->json(['message' => 'No file associated with this document.'], 404);
        }

        $taxDocument->recordDownload();

        return response()->json([
            'view_url' => $this->fileStorageService->getSignedViewUrl($taxDocument->s3_path, $taxDocument->mime_type),
            'download_url' => $this->fileStorageService->getSignedDownloadUrl($taxDocument->s3_path, $taxDocument->original_filename),
            'filename' => $taxDocument->original_filename,
        ]);
    }

    public function requestUpload(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'filename' => 'required|string|max:255',
            'document_kind' => 'required|string|in:'.implode(',', FinDocument::DOCUMENT_KINDS),
            'content_type' => 'nullable|string|max:255',
            'file_size' => 'required|integer|min:1|max:104857600',
        ]);

        $contentType = $validated['content_type'] ?? 'application/pdf';
        $storedFilename = FinDocument::generateStoredFilename($validated['filename']);
        $s3Path = FinDocument::generateS3Path((int) Auth::id(), $storedFilename, $validated['document_kind']);
        $uploadUrl = $this->fileStorageService->getSignedUploadUrl($s3Path, $contentType, 15);

        return response()->json([
            'upload_url' => $uploadUrl,
            's3_key' => $s3Path,
            'expires_in' => 900,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'document_kind' => 'required|string|in:'.implode(',', FinDocument::DOCUMENT_KINDS),
        ]);

        return match ((string) $request->input('document_kind')) {
            FinDocument::KIND_TAX_FORM => $this->storeTaxForm($request),
            FinDocument::KIND_STATEMENT => $this->storeStatement($request),
            FinDocument::KIND_CSV_IMPORT => $this->storeCsv($request),
            FinDocument::KIND_JSON_IMPORT, FinDocument::KIND_TOON_IMPORT => $this->storeStatement($request),
            default => response()->json(['message' => 'Unsupported document kind.'], 422),
        };
    }

    private function storeStatement(Request $request): JsonResponse
    {
        $validated = $this->validatedStatementPayload($request);

        $result = $this->documentIngestionService->ingestStatementDocument((int) Auth::id(), $validated);

        $this->markGenAiResultImported($request, (int) Auth::id());

        return response()->json([
            'success' => true,
            'document' => $result['document'],
            'accounts' => $result['accounts'],
        ], 201);
    }

    private function storeCsv(Request $request): JsonResponse
    {
        $validated = $this->validatedStatementPayload($request);

        $result = $this->documentIngestionService->ingestCsvDocument((int) Auth::id(), $validated);

        $this->markGenAiResultImported($request, (int) Auth::id());

        return response()->json([
            'success' => true,
            'document' => $result['document'],
            'accounts' => $result['accounts'],
        ], 201);
    }

    /**
     * @return array<string, mixed>
     */
    private function validatedStatementPayload(Request $request): array
    {
        $validated = $request->validate($this->statementValidationRules());
        $s3Key = $validated['s3_key'] ?? null;

        if (is_string($s3Key) && $s3Key !== '') {
            $validatedS3 = $this->validateS3Key(
                $s3Key,
                (int) Auth::id(),
                (string) $validated['document_kind'],
            );
            $validated['s3_key'] = $validatedS3['s3_key'];
            $validated['stored_filename'] = $validatedS3['stored_filename'];
        }

        return $validated;
    }

    /**
     * Mark the originating GenAiImportResult / GenAiImportJob imported when the
     * caller threaded their IDs through. Silently no-ops if the IDs are absent
     * or do not resolve, so non-GenAI imports (CSV paste, manual statement entry)
     * keep working unchanged.
     */
    private function markGenAiResultImported(Request $request, int $userId): void
    {
        $jobId = $request->input('gen_ai_job_id');
        $resultId = $request->input('gen_ai_result_id');

        if ($jobId === null || $resultId === null) {
            return;
        }

        $job = GenAiImportJob::query()
            ->where('id', (int) $jobId)
            ->where('user_id', $userId)
            ->where('job_type', 'finance_transactions')
            ->first();

        if (! $job instanceof GenAiImportJob) {
            return;
        }

        $result = GenAiImportResult::query()
            ->where('id', (int) $resultId)
            ->where('job_id', $job->id)
            ->first();

        if (! $result instanceof GenAiImportResult) {
            return;
        }

        if ($result->status !== 'imported') {
            $result->markImported();
        }

        $stillPending = $job->results()->where('status', 'pending_review')->exists();
        if (! $stillPending && $job->status !== 'imported') {
            $job->markImported();
        }
    }

    private function storeTaxForm(Request $request): JsonResponse
    {
        $request->validate(StoreTaxFormDocumentRequest::rulesArray());

        $userId = (int) Auth::id();
        $formType = (string) $request->input('form_type');

        if (in_array($formType, FileForTaxDocument::W2_FORM_TYPES, true)) {
            $request->validate(['employment_entity_id' => 'required|integer']);
            $this->verifyEmploymentEntityOwnership((int) $request->input('employment_entity_id'), $userId);
        }

        if (in_array($formType, FileForTaxDocument::ACCOUNT_FORM_TYPES, true) && $request->filled('account_id')) {
            $this->verifyAccountOwnership((int) $request->input('account_id'), $userId);
        }

        $validatedS3 = $this->validateS3Key((string) $request->input('s3_key'), $userId, FinDocument::KIND_TAX_FORM);
        $docAttributes = [
            'user_id' => $userId,
            'tax_year' => (int) $request->input('tax_year'),
            'form_type' => $formType,
            'employment_entity_id' => $request->input('employment_entity_id'),
            'original_filename' => $request->input('original_filename'),
            'stored_filename' => $validatedS3['stored_filename'],
            's3_path' => $validatedS3['s3_key'],
            'mime_type' => $request->input('mime_type', 'application/pdf'),
            'file_size_bytes' => (int) $request->input('file_size_bytes'),
            'file_hash' => $request->input('file_hash'),
            'uploaded_by_user_id' => $userId,
            'notes' => $request->input('notes'),
            'parsed_data' => $request->filled('parsed_data') ? $request->input('parsed_data') : null,
            'skip_gen_ai_processing' => $request->boolean('skip_gen_ai_processing'),
        ];

        if ($formType === 'broker_1099' && ! $request->filled('account_id')) {
            $doc = $this->taxDocumentCreationService->createMultiAccountDocument(
                $docAttributes,
                $request->input('context_accounts', []),
            );
        } else {
            if (in_array($formType, FileForTaxDocument::ACCOUNT_FORM_TYPES, true)) {
                $request->validate(['account_id' => 'required|integer']);
                $this->verifyAccountOwnership((int) $request->input('account_id'), $userId);
            }

            $linkAttributes = null;
            if ($request->filled('account_id') && in_array($formType, FileForTaxDocument::ACCOUNT_FORM_TYPES, true)) {
                $linkAttributes = [
                    'account_id' => (int) $request->input('account_id'),
                    'form_type' => $formType,
                    'tax_year' => (int) $request->input('tax_year'),
                    'notes' => $request->input('notes'),
                ];
            }

            $doc = $this->taxDocumentCreationService->createSingleAccountDocument($docAttributes, $linkAttributes);
        }

        $doc->load(['uploader:id,name', 'employmentEntity:id,display_name', 'account:acct_id,acct_name,acct_number', 'accountLinks.account:acct_id,acct_name,acct_number', 'document']);
        $this->taxDocumentParsedDataNormalizer->persistReviewFlagsForDocument($doc);

        return response()->json($this->taxDocumentParsedDataNormalizer->documentForResponse($doc), 201);
    }

    /**
     * @return array<string, string>
     */
    private function statementValidationRules(): array
    {
        return [
            'document_kind' => 'required|string|in:'.implode(',', [
                FinDocument::KIND_STATEMENT,
                FinDocument::KIND_CSV_IMPORT,
                FinDocument::KIND_JSON_IMPORT,
                FinDocument::KIND_TOON_IMPORT,
            ]),
            'original_filename' => 'nullable|string|max:255',
            's3_key' => 'nullable|string',
            'file_size_bytes' => 'nullable|integer|min:0',
            'file_hash' => 'required_with:s3_key|string',
            'mime_type' => 'nullable|string|max:255',
            'gen_ai_job_id' => 'nullable|integer',
            'gen_ai_result_id' => 'nullable|integer|required_with:gen_ai_job_id',
            'accounts' => 'required|array|min:1',
            'accounts.*.acct_id' => 'required|integer',
            'accounts.*.statementInfo' => 'nullable|array',
            'accounts.*.statementInfo.periodStart' => 'nullable|string',
            'accounts.*.statementInfo.periodEnd' => 'nullable|string',
            'accounts.*.statementInfo.closingBalance' => 'nullable|numeric',
            'accounts.*.statementDetails' => 'nullable|array',
            'accounts.*.statementDetails.*.section' => 'required|string',
            'accounts.*.statementDetails.*.line_item' => 'required|string',
            'accounts.*.statementDetails.*.statement_period_value' => 'nullable|numeric',
            'accounts.*.statementDetails.*.ytd_value' => 'nullable|numeric',
            'accounts.*.statementDetails.*.is_percentage' => 'nullable|boolean',
            'accounts.*.transactions' => 'nullable|array',
            'accounts.*.transactions.*.t_date' => 'required|date',
            'accounts.*.transactions.*.t_amt' => 'required|numeric',
            'accounts.*.transactions.*.t_description' => 'nullable|string|max:255',
            'accounts.*.lots' => 'nullable|array',
            'accounts.*.lots.*.symbol' => 'required|string|max:50',
            'accounts.*.lots.*.description' => 'nullable|string|max:255',
            'accounts.*.lots.*.quantity' => 'required|numeric',
            'accounts.*.lots.*.purchaseDate' => 'required|date',
            'accounts.*.lots.*.costBasis' => 'required|numeric',
            'accounts.*.lots.*.costPerUnit' => 'nullable|numeric',
            'accounts.*.lots.*.saleDate' => 'nullable|date',
            'accounts.*.lots.*.proceeds' => 'nullable|numeric',
            'accounts.*.lots.*.realizedGainLoss' => 'nullable|numeric',
        ];
    }

    /**
     * @return array{s3_key: string, stored_filename: string}
     */
    private function validateS3Key(string $s3Key, int $userId, string $documentKind): array
    {
        if (! FinDocument::isValidS3PathForOwner($s3Key, $userId, $documentKind)) {
            abort(422, 'Invalid upload key for this document kind.');
        }

        return [
            's3_key' => $s3Key,
            'stored_filename' => basename($s3Key),
        ];
    }

    private function verifyAccountOwnership(int $accountId, int $userId): void
    {
        FinAccounts::query()
            ->where('acct_id', $accountId)
            ->where('acct_owner', $userId)
            ->firstOrFail();
    }

    private function verifyEmploymentEntityOwnership(int $employmentEntityId, int $userId): void
    {
        FinEmploymentEntity::query()
            ->where('id', $employmentEntityId)
            ->where('user_id', $userId)
            ->firstOrFail();
    }
}
