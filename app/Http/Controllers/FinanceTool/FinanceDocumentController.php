<?php

namespace App\Http\Controllers\FinanceTool;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Models\GenAiImportResult;
use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\StoreTaxFormDocumentRequest;
use App\Http\Resources\FinanceTool\FinDocumentResource;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinDocument;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Services\FileStorageService;
use App\Services\Finance\DocumentIngestionService;
use App\Services\Finance\TaxDocumentParsedDataNormalizer;
use App\Services\TaxDocument\TaxDocumentCreationService;
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
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = FinDocument::query()
            ->where('user_id', (int) Auth::id())
            ->with([
                'accounts.account:acct_id,acct_name,acct_number',
                'taxDocument:id,document_id,form_type,tax_year,is_reviewed,genai_status',
            ])
            ->orderByDesc('tax_year')
            ->orderByDesc('period_end')
            ->orderByDesc('created_at');

        if ($request->filled('document_kind')) {
            $kinds = array_filter(array_map('trim', explode(',', (string) $request->query('document_kind'))));
            $query->whereIn('document_kind', $kinds);
        }

        if ($request->filled('tax_year')) {
            $query->where('tax_year', (int) $request->query('tax_year'));
        }

        if ($request->filled('account_id')) {
            $query->whereHas('accounts', fn ($accountQuery) => $accountQuery->where('account_id', (int) $request->query('account_id')));
        }

        return response()->json(FinDocumentResource::collection($query->get())->resolve($request));
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

    public function destroy(int $id): JsonResponse
    {
        $doc = FinDocument::query()
            ->where('id', $id)
            ->where('user_id', (int) Auth::id())
            ->where('document_kind', '!=', FinDocument::KIND_TAX_FORM)
            ->firstOrFail();

        DB::transaction(function () use ($doc): void {
            $doc->lots()->delete();
            $doc->accounts()->delete();
            $doc->statements()->delete();
            $doc->delete();
        });

        return response()->json(['success' => true]);
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
        $request->validate($this->statementValidationRules());

        $result = $this->documentIngestionService->ingestStatementDocument((int) Auth::id(), $request->all());

        $this->markGenAiResultImported($request, (int) Auth::id());

        return response()->json([
            'success' => true,
            'document' => $result['document'],
            'accounts' => $result['accounts'],
        ], 201);
    }

    private function storeCsv(Request $request): JsonResponse
    {
        $request->validate($this->statementValidationRules());

        $result = $this->documentIngestionService->ingestCsvDocument((int) Auth::id(), $request->all());

        $this->markGenAiResultImported($request, (int) Auth::id());

        return response()->json([
            'success' => true,
            'document' => $result['document'],
            'accounts' => $result['accounts'],
        ], 201);
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
        $expectedPrefix = FinDocument::generateS3Path($userId, '', $documentKind);
        if (! str_starts_with($s3Key, $expectedPrefix)) {
            abort(422, 'Invalid upload key for this document kind.');
        }

        $keySuffix = substr($s3Key, strlen($expectedPrefix));
        $storedFilename = basename($s3Key);
        if ($storedFilename === '' || $storedFilename === '.' || $storedFilename === '..' || $keySuffix !== $storedFilename) {
            abort(422, 'Invalid upload key for this document kind.');
        }

        return [
            's3_key' => $s3Key,
            'stored_filename' => $storedFilename,
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
