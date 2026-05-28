<?php

namespace App\Services\Finance;

use App\Models\FinanceTool\FinDocument;
use Illuminate\Support\Facades\DB;

class DocumentCapabilityService
{
    /**
     * Return the list of capabilities for a given FinDocument.
     *
     * @return list<string>
     */
    public function capabilities(FinDocument $document): array
    {
        return match ($document->document_kind) {
            FinDocument::KIND_TAX_FORM => $this->taxFormCapabilities($document),
            FinDocument::KIND_STATEMENT => $this->statementCapabilities($document),
            FinDocument::KIND_CSV_IMPORT => $this->csvImportCapabilities($document),
            FinDocument::KIND_JSON_IMPORT => $this->jsonImportCapabilities($document),
            FinDocument::KIND_TOON_IMPORT => $this->toonImportCapabilities($document),
            FinDocument::KIND_MANUAL => $this->manualCapabilities($document),
            default => ['delete'],
        };
    }

    /**
     * @return list<string>
     */
    private function taxFormCapabilities(FinDocument $document): array
    {
        $caps = [];

        if ($document->s3_path) {
            $caps[] = 'view_original';
            $caps[] = 'download_original';
        }

        if ($document->genai_status && $document->genai_status !== 'completed') {
            $caps[] = 'reprocess';
        }

        if ($document->parsed_data_needs_review) {
            $caps[] = 'review_parsed_data';
        }

        if ($this->hasMissingAccounts($document)) {
            $caps[] = 'resolve_accounts';
        }

        $caps[] = 'open_tax_document';
        $caps[] = 'open_tax_reconciliation';

        return $caps;
    }

    /**
     * @return list<string>
     */
    private function statementCapabilities(FinDocument $document): array
    {
        $caps = [];

        if ($document->s3_path) {
            $caps[] = 'view_original';
            $caps[] = 'download_original';
        }

        $caps[] = 'delete';

        if ($document->genai_status && $document->genai_status !== 'completed') {
            $caps[] = 'reprocess';
        }

        if ($document->parsed_data_needs_review) {
            $caps[] = 'review_parsed_data';
        }

        if ($this->hasMissingAccounts($document)) {
            $caps[] = 'resolve_accounts';
        }

        $caps[] = 'open_statement';

        if ($this->hasLots($document)) {
            $caps[] = 'open_lot_workspace';
        }

        return $caps;
    }

    /**
     * @return list<string>
     */
    private function csvImportCapabilities(FinDocument $document): array
    {
        $caps = [];

        if ($document->s3_path) {
            $caps[] = 'view_original';
            $caps[] = 'download_original';
        }

        $caps[] = 'delete';
        $caps[] = 'rollback_import';
        $caps[] = 'reimport_statement';

        if ($document->parsed_data_needs_review) {
            $caps[] = 'review_parsed_data';
        }

        if ($this->hasMissingAccounts($document)) {
            $caps[] = 'resolve_accounts';
        }

        if ($this->hasLots($document)) {
            $caps[] = 'open_lot_workspace';
        }

        return $caps;
    }

    /**
     * @return list<string>
     */
    private function jsonImportCapabilities(FinDocument $document): array
    {
        $caps = [];

        if ($document->s3_path) {
            $caps[] = 'view_original';
            $caps[] = 'download_original';
        }

        $caps[] = 'delete';
        $caps[] = 'rollback_import';
        $caps[] = 'reimport_statement';

        if ($document->parsed_data_needs_review) {
            $caps[] = 'review_parsed_data';
        }

        if ($this->hasMissingAccounts($document)) {
            $caps[] = 'resolve_accounts';
        }

        if ($this->hasLots($document)) {
            $caps[] = 'open_lot_workspace';
        }

        return $caps;
    }

    /**
     * @return list<string>
     */
    private function toonImportCapabilities(FinDocument $document): array
    {
        $caps = [];

        if ($document->s3_path) {
            $caps[] = 'view_original';
            $caps[] = 'download_original';
        }

        $caps[] = 'delete';
        $caps[] = 'rollback_import';
        $caps[] = 'reimport_statement';

        if ($document->parsed_data_needs_review) {
            $caps[] = 'review_parsed_data';
        }

        if ($this->hasMissingAccounts($document)) {
            $caps[] = 'resolve_accounts';
        }

        if ($this->hasLots($document)) {
            $caps[] = 'open_lot_workspace';
        }

        return $caps;
    }

    /**
     * @return list<string>
     */
    private function manualCapabilities(FinDocument $document): array
    {
        $caps = ['delete'];

        if ($document->parsed_data_needs_review) {
            $caps[] = 'review_parsed_data';
        }

        if ($this->hasMissingAccounts($document)) {
            $caps[] = 'resolve_accounts';
        }

        if ($this->hasLots($document)) {
            $caps[] = 'open_lot_workspace';
        }

        return $caps;
    }

    private function hasMissingAccounts(FinDocument $document): bool
    {
        if (! $document->relationLoaded('accounts')) {
            return $document->accounts()->whereNull('account_id')->exists();
        }

        return $document->accounts->contains(fn ($link) => $link->account_id === null);
    }

    private function hasLots(FinDocument $document): bool
    {
        if (! $document->relationLoaded('lots')) {
            return $document->lots()->exists();
        }

        return $document->lots->isNotEmpty();
    }

    /**
     * Compute the impact summary and hash for a document before deletion.
     *
     * Both document_id and user_id are included in the hash payload so that:
     * - Two documents from different users with identical counts produce different hashes.
     * - Two documents from the same user with identical counts produce different hashes.
     *
     * @return array{summary: array{document_id: int, user_id: int, account_links: int, statements: int, statement_details: int, statement_cash_reports: int, statement_nav: int, statement_performance: int, statement_positions: int, statement_securities_lent: int, transactions: int, lots: int, has_tax_document: bool, form1116_overrides: int}, impact_hash: string}
     */
    public function computeImpactSummary(FinDocument $document): array
    {
        $statementIds = $document->statements()->pluck('statement_id');

        $summary = [
            'document_id' => (int) $document->id,
            'user_id' => (int) $document->user_id,
            'account_links' => $document->accounts()->count(),
            'statements' => $statementIds->count(),
            'statement_details' => DB::table('fin_statement_details')->whereIn('statement_id', $statementIds)->count(),
            'statement_cash_reports' => DB::table('fin_statement_cash_report')->whereIn('statement_id', $statementIds)->count(),
            'statement_nav' => DB::table('fin_statement_nav')->whereIn('statement_id', $statementIds)->count(),
            'statement_performance' => DB::table('fin_statement_performance')->whereIn('statement_id', $statementIds)->count(),
            'statement_positions' => DB::table('fin_statement_positions')->whereIn('statement_id', $statementIds)->count(),
            'statement_securities_lent' => DB::table('fin_statement_securities_lent')->whereIn('statement_id', $statementIds)->count(),
            'transactions' => DB::table('fin_account_line_items')->whereIn('statement_id', $statementIds)->count(),
            'lots' => $document->lots()->count(),
            'has_tax_document' => $document->taxDocument()->exists(),
            'form1116_overrides' => DB::table('fin_tax_document_form1116_overrides')->where('document_id', $document->id)->count(),
        ];

        return [
            'summary' => $summary,
            'impact_hash' => hash_hmac('sha256', json_encode([
                'file_hash' => $document->file_hash,
                'summary' => $summary,
            ], JSON_THROW_ON_ERROR), (string) config('app.key')),
        ];
    }
}
