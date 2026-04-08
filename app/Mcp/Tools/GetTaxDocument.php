<?php

namespace App\Mcp\Tools;

use App\Models\Files\FileForTaxDocument;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Tool;

#[Description('Get a single tax document by its ID, including the full parsed_data JSON blob.')]
class GetTaxDocument extends Tool
{
    public function handle(Request $request): Response
    {
        $userId = Auth::id();
        $id = (int) $request->input('id');

        $doc = FileForTaxDocument::where('id', $id)
            ->where('user_id', $userId)
            ->with([
                'uploader:id,name',
                'employmentEntity:id,display_name',
                'account:acct_id,acct_name',
            ])
            ->firstOrFail();

        return Response::json($doc);
    }

    /**
     * @return array<string, JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'id' => $schema->integer()->description('Tax document ID'),
        ];
    }
}
