<?php

namespace App\Mcp\Resources;

use App\Models\Files\FileForTaxDocument;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Uri;
use Laravel\Mcp\Server\Resource;

#[Uri('finance://tax-documents/reviewed')]
#[Description('All reviewed tax documents for the current year with their parsed_data JSON blobs. For year-specific queries, use the list_tax_documents tool with is_reviewed=true.')]
class TaxDocuments extends Resource
{
    public function handle(Request $request): Response
    {
        $userId = Auth::id();
        $year = (int) date('Y');

        $docs = FileForTaxDocument::where('user_id', $userId)
            ->where('is_reviewed', true)
            ->where('tax_year', $year)
            ->with([
                'uploader:id,name',
                'employmentEntity:id,display_name',
                'account:acct_id,acct_name',
            ])
            ->orderBy('tax_year', 'desc')
            ->orderBy('created_at', 'desc')
            ->get();

        return Response::json($docs);
    }
}
