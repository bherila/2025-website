<?php

namespace App\Support\Agent;

use InvalidArgumentException;

/**
 * Describes one agent-facing capability: a REST endpoint and/or MCP tool with
 * the feature permission required to see and invoke it. A null
 * requiredPermission marks the capability as public (anonymous-visible).
 */
final readonly class Capability
{
    public const RISKS = ['read', 'write', 'destructive', 'upload', 'download'];

    /**
     * @param  array<string, mixed>|null  $requestSchema  OpenAPI schema fragment
     * @param  array<string, mixed>|null  $responseSchema  OpenAPI schema fragment
     * @param  list<string>  $examples
     */
    public function __construct(
        public string $id,
        public string $module,
        public string $label,
        public string $description,
        public ?string $requiredPermission,
        public string $risk,
        public ?string $restMethod = null,
        public ?string $restPath = null,
        public ?string $mcpTool = null,
        public string $openApiTag = '',
        public ?array $requestSchema = null,
        public ?array $responseSchema = null,
        public array $examples = [],
        public ?string $routeName = null,
    ) {
        if (! in_array($risk, self::RISKS, true)) {
            throw new InvalidArgumentException("Unknown capability risk [{$risk}] for [{$id}].");
        }
    }

    public function isPublic(): bool
    {
        return $this->requiredPermission === null;
    }
}
