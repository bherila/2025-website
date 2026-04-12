<?php

namespace App\Mcp\Tools;

use App\Models\Files\FileForTaxDocument;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Tool;

#[Description('List tax documents (W-2, 1099-INT, 1099-DIV, 1099-MISC, 1099-B, 1099-NEC, 1099-R, broker_1099 consolidated statements, K-1, Form 1116) for the authenticated user. Supports filtering by year, form type, and review status.')]
class ListTaxDocuments extends Tool
{
    public function handle(Request $request): Response
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

        if ($request->has('year')) {
            $query->where('tax_year', (int) $request->input('year'));
        }

        if ($request->has('form_type')) {
            $types = array_filter(array_map('trim', explode(',', (string) $request->input('form_type'))));
            $query->whereIn('form_type', $types);
        }

        if ($request->has('is_reviewed')) {
            $query->where('is_reviewed', filter_var($request->input('is_reviewed'), FILTER_VALIDATE_BOOLEAN));
        }

        return Response::json($query->get());
    }

    /**
     * @return array<string, JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'year' => $schema->integer()->description('Filter by tax year (e.g. 2024)')->nullable(),
            'form_type' => $schema->string()->description('Comma-separated form type(s): w2, w2c, 1099_int, 1099_int_c, 1099_div, 1099_div_c, 1099_misc, 1099_nec, 1099_r, 1099_b, broker_1099, k1, 1116. Use broker_1099 for consolidated brokerage statements.')->nullable(),
            'is_reviewed' => $schema->boolean()->description('Filter to reviewed (true) or unreviewed (false) documents')->nullable(),
        ];
    }
}
