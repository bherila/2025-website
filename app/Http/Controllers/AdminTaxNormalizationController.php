<?php

namespace App\Http\Controllers;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\TaxDocumentAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class AdminTaxNormalizationController extends Controller
{
    /**
     * List all tax documents and account links flagged for parsed-data normalization review.
     *
     * Supports filtering by:
     *   - form_type (comma-separated)
     *   - year
     *   - warning_code (matches any warning in the warnings array by code field)
     *   - type: "document" | "link" | "all" (default: all)
     *
     * GET /api/admin/tax-normalization-review
     */
    public function index(Request $request): JsonResponse
    {
        Gate::authorize('admin');

        $formTypes = $request->filled('form_type')
            ? array_filter(array_map('trim', explode(',', (string) $request->input('form_type'))))
            : null;

        $year = $request->filled('year') ? (int) $request->input('year') : null;
        $warningCode = $request->filled('warning_code') ? (string) $request->input('warning_code') : null;
        $type = $request->input('type', 'all');

        /** @var array<int, array<string, mixed>> $documents */
        $documents = [];
        /** @var array<int, array<string, mixed>> $links */
        $links = [];

        if ($type === 'all' || $type === 'document') {
            $docQuery = FileForTaxDocument::where('parsed_data_needs_review', true)
                ->with([
                    'employmentEntity:id,display_name',
                    'account:acct_id,acct_name',
                ])
                ->orderBy('tax_year', 'desc')
                ->orderBy('id', 'desc');

            if ($formTypes !== null) {
                $docQuery->whereIn('form_type', $formTypes);
            }

            if ($year !== null) {
                $docQuery->where('tax_year', $year);
            }

            foreach ($docQuery->get() as $doc) {
                $warnings = $doc->parsed_data_warnings ?? [];

                // Apply warning_code filter in PHP to correctly match any warning object
                // with the given code, regardless of its position or additional fields.
                if ($warningCode !== null && ! $this->hasWarningCode($warnings, $warningCode)) {
                    continue;
                }

                /** @var FinAccounts|null $account */
                $account = $doc->account;
                /** @var FinEmploymentEntity|null $entity */
                $entity = $doc->employmentEntity;

                $documents[] = [
                    'item_type' => 'document',
                    'document_id' => $doc->id,
                    'link_id' => null,
                    'form_type' => $doc->form_type,
                    'tax_year' => $doc->tax_year,
                    'original_filename' => $doc->original_filename,
                    'account_id' => $doc->account_id,
                    'account_name' => $account?->acct_name,
                    'employment_entity_name' => $entity?->display_name,
                    'warnings' => $warnings,
                    'is_reviewed' => (bool) $doc->is_reviewed,
                    'parsed_data_needs_review' => true,
                    'review_url' => "/finance/tax-documents/{$doc->id}/review",
                    'created_at' => $doc->created_at,
                    'updated_at' => $doc->updated_at,
                ];
            }
        }

        if ($type === 'all' || $type === 'link') {
            $linkQuery = TaxDocumentAccount::where('parsed_data_needs_review', true)
                ->with([
                    'document:id,original_filename,tax_year,form_type,user_id',
                    'account:acct_id,acct_name',
                ])
                ->orderBy('tax_year', 'desc')
                ->orderBy('id', 'desc');

            if ($formTypes !== null) {
                $linkQuery->whereIn('form_type', $formTypes);
            }

            if ($year !== null) {
                $linkQuery->where('tax_year', $year);
            }

            foreach ($linkQuery->get() as $link) {
                $warnings = $link->parsed_data_warnings ?? [];

                // Apply warning_code filter in PHP to correctly match any warning object
                // with the given code, regardless of its position or additional fields.
                if ($warningCode !== null && ! $this->hasWarningCode($warnings, $warningCode)) {
                    continue;
                }

                /** @var FileForTaxDocument|null $parentDoc */
                $parentDoc = $link->document;
                /** @var FinAccounts|null $account */
                $account = $link->account;

                $links[] = [
                    'item_type' => 'link',
                    'document_id' => $link->tax_document_id,
                    'link_id' => $link->id,
                    'form_type' => $link->form_type,
                    'tax_year' => $link->tax_year,
                    'original_filename' => $parentDoc?->original_filename,
                    'account_id' => $link->account_id,
                    'account_name' => $account?->acct_name,
                    'ai_identifier' => $link->ai_identifier,
                    'ai_account_name' => $link->ai_account_name,
                    'employment_entity_name' => null,
                    'warnings' => $warnings,
                    'is_reviewed' => (bool) $link->is_reviewed,
                    'parsed_data_needs_review' => true,
                    'review_url' => "/finance/tax-documents/{$link->tax_document_id}/review",
                    'created_at' => $link->created_at,
                    'updated_at' => $link->updated_at,
                ];
            }
        }

        $items = array_merge($documents, $links);

        // Sort merged result by tax_year desc then document_id desc
        usort($items, function (array $a, array $b): int {
            $aYear = (int) ($a['tax_year'] ?? 0);
            $bYear = (int) ($b['tax_year'] ?? 0);

            if ($aYear !== $bYear) {
                return $bYear <=> $aYear;
            }

            return (int) ($b['document_id'] ?? 0) <=> (int) ($a['document_id'] ?? 0);
        });

        return response()->json($items);
    }

    /**
     * Acknowledge (clear) the review flag on a document or account link.
     *
     * POST /api/admin/tax-normalization-review/acknowledge
     *
     * Body:
     *   document_id: int (required when type = "document")
     *   link_id: int (required when type = "link")
     *   type: "document" | "link"
     */
    public function acknowledge(Request $request): JsonResponse
    {
        Gate::authorize('admin');

        $request->validate([
            'type' => 'required|in:document,link',
            'document_id' => 'required_if:type,document|nullable|integer',
            'link_id' => 'required_if:type,link|nullable|integer',
        ]);

        $itemType = $request->input('type');

        if ($itemType === 'document') {
            $doc = FileForTaxDocument::findOrFail((int) $request->input('document_id'));
            $doc->forceFill([
                'parsed_data_needs_review' => false,
                'parsed_data_warnings' => null,
            ])->saveQuietly();

            return response()->json(['success' => true, 'item_type' => 'document', 'id' => $doc->id]);
        }

        $link = TaxDocumentAccount::findOrFail((int) $request->input('link_id'));
        $link->forceFill([
            'parsed_data_needs_review' => false,
            'parsed_data_warnings' => null,
        ])->saveQuietly();

        return response()->json(['success' => true, 'item_type' => 'link', 'id' => $link->id]);
    }

    /**
     * Check whether any warning in the array has the given code.
     *
     * @param  array<int, array<string, mixed>>  $warnings
     */
    private function hasWarningCode(array $warnings, string $code): bool
    {
        foreach ($warnings as $warning) {
            if (($warning['code'] ?? null) === $code) {
                return true;
            }
        }

        return false;
    }
}
