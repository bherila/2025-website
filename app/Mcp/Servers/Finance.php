<?php

namespace App\Mcp\Servers;

use App\Mcp\Resources\Accounts;
use App\Mcp\Resources\EmploymentEntities;
use App\Mcp\Resources\TaxDocuments;
use App\Mcp\Tools\GetAccountSummary;
use App\Mcp\Tools\GetMarriageStatus;
use App\Mcp\Tools\GetScheduleC;
use App\Mcp\Tools\GetTaxDocument;
use App\Mcp\Tools\GetTaxPreview;
use App\Mcp\Tools\ListAccounts;
use App\Mcp\Tools\ListEmploymentEntities;
use App\Mcp\Tools\ListLots;
use App\Mcp\Tools\ListPayslips;
use App\Mcp\Tools\ListTags;
use App\Mcp\Tools\ListTaxDocuments;
use App\Mcp\Tools\ListTransactions;
use Laravel\Mcp\Server;
use Laravel\Mcp\Server\Attributes\Instructions;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Version;

#[Name('BH Finance MCP Server')]
#[Version('1.0.0')]
#[Instructions(
    'This MCP server exposes live finance tool and tax management data. '.
    'Use the tools to query tax previews, tax documents, accounts, transactions, lots, '.
    'Schedule C summaries, employment entities, tags, marriage status, and payslips. '.
    'Always prefer these tools over database-query when the question is about user-facing financial data.'
)]
class Finance extends Server
{
    protected array $tools = [
        GetTaxPreview::class,
        ListTaxDocuments::class,
        GetTaxDocument::class,
        ListAccounts::class,
        GetAccountSummary::class,
        ListTransactions::class,
        ListLots::class,
        GetScheduleC::class,
        ListEmploymentEntities::class,
        ListTags::class,
        GetMarriageStatus::class,
        ListPayslips::class,
    ];

    protected array $resources = [
        TaxDocuments::class,
        Accounts::class,
        EmploymentEntities::class,
    ];

    protected array $prompts = [
        //
    ];
}
