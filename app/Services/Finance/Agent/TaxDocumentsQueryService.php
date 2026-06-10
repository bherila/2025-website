<?php

namespace App\Services\Finance\Agent;

use App\Models\Files\FileForTaxDocument;
use Illuminate\Database\Eloquent\Collection;

/**
 * Owner-scoped tax document queries shared by the MCP list_tax_documents /
 * get_tax_document tools and the agent REST surface. Extracted
 * behavior-preserving from App\Mcp\Tools\{ListTaxDocuments,GetTaxDocument}.
 */
class TaxDocumentsQueryService
{
    /**
     * @param  list<string>|null  $formTypes
     * @return Collection<int, FileForTaxDocument>
     */
    public function listForUser(
        int $userId,
        ?int $year = null,
        ?array $formTypes = null,
        ?bool $isReviewed = null,
        ?int $limit = null,
        int $offset = 0,
    ): Collection {
        $query = FileForTaxDocument::where('user_id', $userId)
            ->with([
                'uploader:id,name',
                'employmentEntity:id,display_name',
                'account:acct_id,acct_name',
            ])
            ->orderBy('tax_year', 'desc')
            ->orderBy('created_at', 'desc');

        if ($year !== null) {
            $query->where('tax_year', $year);
        }

        if ($formTypes !== null) {
            $query->whereIn('form_type', $formTypes);
        }

        if ($isReviewed !== null) {
            $query->where('is_reviewed', $isReviewed);
        }

        if ($limit !== null) {
            $query->orderBy('id', 'desc')->offset($offset)->limit($limit);
        }

        return $query->get();
    }

    /**
     * Find a single tax document owned by the user, or throw
     * ModelNotFoundException (renders 404; cross-user IDs are never revealed).
     */
    public function findForUser(int $userId, int $id): FileForTaxDocument
    {
        return FileForTaxDocument::where('id', $id)
            ->where('user_id', $userId)
            ->with([
                'uploader:id,name',
                'employmentEntity:id,display_name',
                'account:acct_id,acct_name',
            ])
            ->firstOrFail();
    }
}
