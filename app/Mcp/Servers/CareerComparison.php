<?php

namespace App\Mcp\Servers;

use App\Mcp\Tools\Career\GetLatestComparison;
use App\Mcp\Tools\Career\GetPublicShare;
use App\Mcp\Tools\Career\ImportRsu;
use App\Mcp\Tools\Career\SaveLatestComparison;
use Laravel\Mcp\Server;
use Laravel\Mcp\Server\Attributes\Instructions;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Version;

#[Name('BH Career Comparison MCP Server')]
#[Version('1.0.0')]
#[Instructions(
    'Career Comparison: model and compare job offers (salary, bonus, RSU/option grants, vesting, growth bands) over a multi-year horizon. '.
    'Use career_get_public_share to read a shared comparison by short code (read-only, redacted for non-creators). '.
    'Use career_get_latest_comparison / career_save_latest_comparison to read and update the user\'s private scenario, '.
    'and career_import_rsu to build a currentJob from their actual equity awards before saving.'
)]
class CareerComparison extends Server
{
    protected array $tools = [
        GetPublicShare::class,
        GetLatestComparison::class,
        SaveLatestComparison::class,
        ImportRsu::class,
    ];

    protected array $resources = [
        //
    ];

    protected array $prompts = [
        //
    ];
}
