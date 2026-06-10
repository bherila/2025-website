<?php

namespace App\Http\Controllers\Agent;

use App\Http\Controllers\Controller;
use App\Support\Agent\AgentContext;
use App\Support\Agent\Capability;
use App\Support\Agent\CapabilityRegistry;
use App\Support\Payload\AgentPayload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * Compact capability manifests for agent clients.
 *
 * Visibility is filtered through CapabilityRegistry::visibleTo() — anonymous
 * callers only see public capabilities, and token scopes shrink the list
 * further. The `.toon` variants always return `text/toon`; the plain variants
 * default to JSON (still TOON-negotiable via Accept / ?format=toon).
 */
class AgentCapabilitiesController extends Controller
{
    /** Modules with an agent manifest endpoint. */
    public const MODULES = ['finance', 'career-comparison', 'tax', 'imports'];

    public function __construct(
        private readonly CapabilityRegistry $registry,
    ) {}

    public function index(AgentContext $context): JsonResponse
    {
        return response()->json($this->manifest($context, null));
    }

    public function indexToon(AgentContext $context): Response
    {
        return $this->toonResponse($this->manifest($context, null));
    }

    public function show(AgentContext $context, string $module): JsonResponse
    {
        abort_unless(in_array($module, self::MODULES, true), 404);

        return response()->json($this->manifest($context, $module));
    }

    public function showToon(AgentContext $context, string $module): Response
    {
        abort_unless(in_array($module, self::MODULES, true), 404);

        return $this->toonResponse($this->manifest($context, $module));
    }

    /** @return array<string, mixed> */
    private function manifest(AgentContext $context, ?string $module): array
    {
        $visible = $this->registry->visibleTo($context);

        if ($module !== null) {
            $visible = array_values(array_filter(
                $visible,
                fn (Capability $capability): bool => $capability->module === $module,
            ));
        }

        usort($visible, fn (Capability $a, Capability $b): int => strcmp($a->id, $b->id));

        return [
            'module' => $module,
            'base_url' => url('/api/agent/v1'),
            'auth' => 'bearer',
            'capabilities' => array_map(
                fn (Capability $capability): array => [
                    'id' => $capability->id,
                    'method' => $capability->restMethod,
                    'path' => $capability->restPath,
                    'permission' => $capability->requiredPermission,
                    'risk' => $capability->risk,
                    'description' => $capability->description,
                    'content_types' => ['application/json', AgentPayload::TOON_MEDIA_TYPE],
                ],
                $visible,
            ),
        ];
    }

    /** @param  array<string, mixed>  $payload */
    private function toonResponse(array $payload): Response
    {
        return response(AgentPayload::encode($payload), 200, [
            'Content-Type' => AgentPayload::TOON_CONTENT_TYPE,
        ]);
    }
}
