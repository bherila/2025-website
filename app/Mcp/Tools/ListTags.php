<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\AuthorizesFeatureAccess;
use App\Mcp\Support\FiltersByFeature;
use App\Mcp\Support\RequiresFeature;
use App\Models\FinanceTool\FinAccountTag;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Tool;

#[Description('List all transaction tags for the authenticated user, including label, color, and tax characteristic.')]
class ListTags extends Tool implements RequiresFeature
{
    use AuthorizesFeatureAccess;
    use FiltersByFeature;

    public static function requiredFeature(): ?string
    {
        return 'finance.transactions.view';
    }

    public function handle(Request $request): Response
    {
        if (($denied = $this->requireFeaturePermission('finance.transactions.view')) !== null) {
            return $denied;
        }

        $tags = FinAccountTag::where('tag_userid', Auth::id())
            ->get(['tag_id', 'tag_label', 'tag_color', 'tax_characteristic', 'employment_entity_id']);

        return Response::json($tags);
    }

    /**
     * @return array<string, JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [];
    }
}
