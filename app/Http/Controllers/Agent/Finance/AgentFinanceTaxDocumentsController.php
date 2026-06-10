<?php

namespace App\Http\Controllers\Agent\Finance;

use App\Http\Controllers\Controller;
use App\Models\Files\FileForTaxDocument;
use App\Services\Finance\Agent\TaxDocumentsQueryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Agent REST tax document reads (finance.tax-documents.view).
 *
 * The list endpoint returns metadata only — parsed_data is deliberately
 * excluded and exposed solely on the detail endpoint. Non-owned IDs render
 * 404 so cross-user document IDs are never confirmed.
 */
class AgentFinanceTaxDocumentsController extends Controller
{
    public function __construct(private readonly TaxDocumentsQueryService $taxDocuments) {}

    /** GET /api/agent/v1/finance/tax-documents — ?year ?form_type ?is_reviewed ?limit ?cursor */
    public function index(Request $request): JsonResponse
    {
        $limit = max(1, min((int) ($request->input('limit') ?? 100), 500));
        $cursor = max(0, (int) $request->input('cursor', 0));

        $formTypes = null;
        if ($request->filled('form_type')) {
            $formTypes = array_values(array_filter(array_map('trim', explode(',', (string) $request->input('form_type')))));
        }

        $docs = $this->taxDocuments->listForUser(
            (int) Auth::id(),
            $request->filled('year') ? (int) $request->input('year') : null,
            $formTypes,
            $request->has('is_reviewed') ? filter_var($request->input('is_reviewed'), FILTER_VALIDATE_BOOLEAN) : null,
            $limit + 1,
            $cursor,
        );

        $hasMore = $docs->count() > $limit;
        $docs = $docs->take($limit);

        return response()->json([
            'tax_documents' => $docs
                ->map(fn (FileForTaxDocument $doc): array => $this->metadata($doc))
                ->values()
                ->all(),
            'next_cursor' => $hasMore ? $cursor + $limit : null,
        ]);
    }

    /** GET /api/agent/v1/finance/tax-documents/{id} — metadata + parsed_data */
    public function show(int $id): JsonResponse
    {
        $doc = $this->taxDocuments->findForUser((int) Auth::id(), $id);

        return response()->json($this->metadata($doc) + [
            'parsed_data' => $doc->parsed_data,
            'parsed_data_warnings' => $doc->parsed_data_warnings,
            'misc_routing' => $doc->misc_routing,
            'wash_sale_treatment' => $doc->wash_sale_treatment,
            'notes' => $doc->notes,
        ]);
    }

    /**
     * Explicit metadata field list — never parsed_data, s3 paths, or hashes.
     *
     * @return array<string, mixed>
     */
    private function metadata(FileForTaxDocument $doc): array
    {
        return [
            'id' => $doc->id,
            'tax_year' => $doc->tax_year,
            'form_type' => $doc->form_type,
            'original_filename' => $doc->original_filename,
            'mime_type' => $doc->mime_type,
            'file_size_bytes' => $doc->file_size_bytes,
            'is_reviewed' => (bool) $doc->is_reviewed,
            'genai_status' => $doc->genai_status,
            'parsed_data_needs_review' => (bool) $doc->parsed_data_needs_review,
            'employment_entity' => $doc->employmentEntity === null ? null : [
                'id' => $doc->employmentEntity->id,
                'display_name' => $doc->employmentEntity->display_name,
            ],
            'account' => $doc->account === null ? null : [
                'acct_id' => $doc->account->acct_id,
                'acct_name' => $doc->account->acct_name,
            ],
            'created_at' => $doc->created_at?->toIso8601String(),
        ];
    }
}
