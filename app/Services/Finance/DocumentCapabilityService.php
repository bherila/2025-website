<?php

namespace App\Services\Finance;

use App\Models\FinanceTool\FinDocument;

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
}
