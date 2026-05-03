<?php

namespace App\Http\Controllers;

use App\Http\Requests\AcknowledgeTaxNormalizationRequest;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\TaxDocumentAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class AdminTaxNormalizationController extends Controller
{
    private const MAX_REVIEW_ITEMS = 500;

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
            $documentWarningCode = $warningCode;
            $docQuery = FileForTaxDocument::where('parsed_data_needs_review', true)
                ->with([
                    'employmentEntity:id,display_name',
                    'account:acct_id,acct_name',
                ])
                ->orderBy('tax_year', 'desc')
                ->orderBy('id', 'desc')
                ->limit(self::MAX_REVIEW_ITEMS);

            if ($formTypes !== null) {
                $docQuery->whereIn('form_type', $formTypes);
            }

            if ($year !== null) {
                $docQuery->where('tax_year', $year);
            }

            if ($documentWarningCode !== null && $this->supportsJsonWarningCodePredicate($docQuery->getModel()->getConnection()->getDriverName())) {
                $docQuery->whereRaw("JSON_SEARCH(parsed_data_warnings, 'one', ?, null, '$[*].code') IS NOT NULL", [$documentWarningCode]);
                $documentWarningCode = null;
            }

            foreach ($docQuery->get() as $doc) {
                $warnings = $doc->parsed_data_warnings ?? [];

                // Apply warning_code filter in PHP to correctly match any warning object
                // with the given code, regardless of its position or additional fields.
                if ($documentWarningCode !== null && ! $this->hasWarningCode($warnings, $documentWarningCode)) {
                    continue;
                }

                $documents[] = $this->documentPayload($doc, $warnings);
            }
        }

        if ($type === 'all' || $type === 'link') {
            $linkWarningCode = $warningCode;
            $linkQuery = TaxDocumentAccount::where('parsed_data_needs_review', true)
                ->with([
                    'document:id,original_filename,tax_year,form_type,user_id',
                    'account:acct_id,acct_name',
                ])
                ->orderBy('tax_year', 'desc')
                ->orderBy('id', 'desc')
                ->limit(self::MAX_REVIEW_ITEMS);

            if ($formTypes !== null) {
                $linkQuery->whereIn('form_type', $formTypes);
            }

            if ($year !== null) {
                $linkQuery->where('tax_year', $year);
            }

            if ($linkWarningCode !== null && $this->supportsJsonWarningCodePredicate($linkQuery->getModel()->getConnection()->getDriverName())) {
                $linkQuery->whereRaw("JSON_SEARCH(parsed_data_warnings, 'one', ?, null, '$[*].code') IS NOT NULL", [$linkWarningCode]);
                $linkWarningCode = null;
            }

            foreach ($linkQuery->get() as $link) {
                $warnings = $link->parsed_data_warnings ?? [];

                // Apply warning_code filter in PHP to correctly match any warning object
                // with the given code, regardless of its position or additional fields.
                if ($linkWarningCode !== null && ! $this->hasWarningCode($warnings, $linkWarningCode)) {
                    continue;
                }

                $links[] = $this->linkPayload($link, $warnings);
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

        return response()->json(array_slice($items, 0, self::MAX_REVIEW_ITEMS));
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
    public function acknowledge(AcknowledgeTaxNormalizationRequest $request): JsonResponse
    {
        $itemType = $request->input('type');

        if ($itemType === 'document') {
            $doc = FileForTaxDocument::findOrFail((int) $request->input('document_id'));
            $this->clearNormalizationReviewFlag($doc);

            return response()->json(['success' => true, 'item_type' => 'document', 'id' => $doc->id]);
        }

        $link = TaxDocumentAccount::findOrFail((int) $request->input('link_id'));
        $this->clearNormalizationReviewFlag($link);

        return response()->json(['success' => true, 'item_type' => 'link', 'id' => $link->id]);
    }

    /**
     * @param  array<int, array<string, mixed>>  $warnings
     * @return array<string, mixed>
     */
    private function documentPayload(FileForTaxDocument $doc, array $warnings): array
    {
        /** @var FinAccounts|null $account */
        $account = $doc->account;
        /** @var FinEmploymentEntity|null $entity */
        $entity = $doc->employmentEntity;

        return [
            'item_type' => 'document',
            'document_id' => $doc->id,
            'link_id' => null,
            'form_type' => $doc->form_type,
            'tax_year' => $doc->tax_year,
            'original_filename' => $doc->original_filename,
            'account_id' => $doc->account_id,
            'account_name' => $account?->acct_name,
            'ai_identifier' => null,
            'ai_account_name' => null,
            'employment_entity_name' => $entity?->display_name,
            'warnings' => $warnings,
            'is_reviewed' => (bool) $doc->is_reviewed,
            'parsed_data_needs_review' => true,
            'review_url' => $this->reviewUrl($doc->tax_year, $doc->id),
            'created_at' => $doc->created_at,
            'updated_at' => $doc->updated_at,
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $warnings
     * @return array<string, mixed>
     */
    private function linkPayload(TaxDocumentAccount $link, array $warnings): array
    {
        /** @var FileForTaxDocument|null $parentDoc */
        $parentDoc = $link->document;
        /** @var FinAccounts|null $account */
        $account = $link->account;

        return [
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
            'review_url' => $this->reviewUrl($link->tax_year, $link->tax_document_id),
            'created_at' => $link->created_at,
            'updated_at' => $link->updated_at,
        ];
    }

    private function reviewUrl(?int $taxYear, int $documentId): string
    {
        return '/finance/tax-preview?'.http_build_query([
            'year' => $taxYear,
            'review_document_id' => $documentId,
        ]);
    }

    private function supportsJsonWarningCodePredicate(string $driver): bool
    {
        return in_array($driver, ['mysql', 'mariadb'], true);
    }

    /**
     * Use forceFill because these admin-only review fields are operational flags
     * rather than normal mass-assignable form input; save quietly avoids retriggering
     * document parsing or review side effects while only clearing the flag.
     */
    private function clearNormalizationReviewFlag(FileForTaxDocument|TaxDocumentAccount $item): void
    {
        $item->forceFill([
            'parsed_data_needs_review' => false,
            'parsed_data_warnings' => null,
        ])->saveQuietly();
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
