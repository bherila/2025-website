<?php

namespace App\Mcp\Servers;

use App\Mcp\Tools\CompareReturnLines;
use App\Mcp\Tools\GetTaxPreview;
use Laravel\Mcp\Server;
use Laravel\Mcp\Server\Attributes\Instructions;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Version;

#[Name('BH Tax MCP Server')]
#[Version('1.0.0')]
#[Instructions(
    'Minimal tax reconciliation MCP server. Use get-tax-preview to read the '.
    'tax preview dataset for a year, and tax_compare_return_lines to compare '.
    'CPA-prepared return line amounts (extracted locally by the client — '.
    'never upload the return itself) against the preview. Comparison is '.
    'transient: nothing is stored server-side.'
)]
class Tax extends Server
{
    protected array $tools = [
        GetTaxPreview::class,
        CompareReturnLines::class,
    ];

    protected array $resources = [
        //
    ];

    protected array $prompts = [
        //
    ];
}
