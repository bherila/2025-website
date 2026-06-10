<?php

namespace App\Mcp\Support;

/**
 * MCP tools/resources declare the feature permission gating their visibility
 * and invocation. Null means the primitive is public.
 */
interface RequiresFeature
{
    public static function requiredFeature(): ?string;
}
