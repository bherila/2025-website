<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\AuthorizesFeatureAccess;
use App\Mcp\Support\FiltersByFeature;
use App\Mcp\Support\RequiresFeature;
use App\Services\Finance\Agent\TaxDocumentsQueryService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Tool;

#[Description('Get a single tax document by its ID, including the full parsed_data JSON blob.')]
class GetTaxDocument extends Tool implements RequiresFeature
{
    use AuthorizesFeatureAccess;
    use FiltersByFeature;

    public static function requiredFeature(): ?string
    {
        return 'finance.tax-documents.view';
    }

    public function __construct(
        private TaxDocumentsQueryService $taxDocuments,
    ) {}

    public function handle(Request $request): Response
    {
        if (($denied = $this->requireFeaturePermission('finance.tax-documents.view')) !== null) {
            return $denied;
        }

        $doc = $this->taxDocuments->findForUser((int) Auth::id(), (int) $request->input('id'));

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
