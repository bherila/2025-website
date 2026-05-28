<?php

namespace App\Http\Resources\FinanceTool;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinDocument;
use App\Models\FinanceTool\FinDocumentAccount;
use App\Models\FinanceTool\FinStatement;
use App\Services\Finance\DocumentCapabilityService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FinDocumentDetailResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $document = $this->resource;
        $capabilityService = app(DocumentCapabilityService::class);

        return [
            'id' => (int) $document->id,
            'document_kind' => (string) $document->document_kind,
            'tax_year' => $document->tax_year,
            'period_start' => $this->dateString($document->period_start),
            'period_end' => $this->dateString($document->period_end),
            'original_filename' => $document->original_filename,
            'stored_filename' => $document->stored_filename,
            'mime_type' => $document->mime_type,
            'file_size_bytes' => $document->file_size_bytes,
            'human_file_size' => $document->human_file_size,
            'genai_job_id' => $document->genai_job_id,
            'genai_status' => $document->genai_status,
            'parsed_data_needs_review' => (bool) $document->parsed_data_needs_review,
            'parsed_data_warnings' => $document->parsed_data_warnings,
            'is_reviewed' => (bool) $document->is_reviewed,
            'notes' => $document->notes,
            'download_count' => (int) $document->download_count,
            'created_at' => $this->dateString($document->created_at),
            'updated_at' => $this->dateString($document->updated_at),
            'accounts' => $this->accountLinks($document),
            'tax_document' => $this->taxDocumentFacet($document),
            'statements' => $this->statementFacet($document),
            'lot_summary' => $this->lotSummary($document),
            'capabilities' => $capabilityService->capabilities($document),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function accountLinks(FinDocument $document): array
    {
        if (! $document->relationLoaded('accounts')) {
            return [];
        }

        return $document->accounts
            ->map(fn (FinDocumentAccount $link): array => [
                'id' => (int) $link->id,
                'document_id' => (int) $link->document_id,
                'account_id' => $link->account_id,
                'statement_id' => $link->statement_id,
                'form_type' => $link->form_type,
                'tax_year' => $link->tax_year,
                'account_section_label' => $link->account_section_label,
                'payload_kind' => $link->payload_kind,
                'ai_identifier' => $link->ai_identifier,
                'ai_account_name' => $link->ai_account_name,
                'is_reviewed' => (bool) $link->is_reviewed,
                'account' => $this->account($link),
            ])
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>|null
     */
    private function account(FinDocumentAccount $link): ?array
    {
        $account = $link->relationLoaded('account') ? $link->account : null;

        if (! $account instanceof FinAccounts) {
            return null;
        }

        return [
            'acct_id' => (int) $account->acct_id,
            'acct_name' => (string) $account->acct_name,
            'acct_number' => $account->acct_number,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function taxDocumentFacet(FinDocument $document): ?array
    {
        $taxDocument = $document->relationLoaded('taxDocument') ? $document->taxDocument : null;

        if (! $taxDocument instanceof FileForTaxDocument) {
            return null;
        }

        return [
            'id' => (int) $taxDocument->id,
            'document_id' => (int) $taxDocument->document_id,
            'form_type' => $taxDocument->form_type,
            'tax_year' => $taxDocument->tax_year,
            'is_reviewed' => (bool) $taxDocument->is_reviewed,
            'genai_status' => $taxDocument->genai_status,
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function statementFacet(FinDocument $document): array
    {
        if (! $document->relationLoaded('statements')) {
            return [];
        }

        return $document->statements
            ->map(fn (FinStatement $stmt): array => [
                'id' => (int) $stmt->statement_id,
                'acct_id' => $stmt->acct_id,
                'statement_closing_date' => $this->dateString($stmt->statement_closing_date),
                'closing_balance' => $stmt->balance,
            ])
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function lotSummary(FinDocument $document): array
    {
        if (! $document->relationLoaded('lots')) {
            return ['count' => 0];
        }

        return [
            'count' => $document->lots->count(),
        ];
    }

    private function dateString(mixed $value): ?string
    {
        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d');
        }

        if (is_string($value) && trim($value) !== '') {
            return $value;
        }

        return null;
    }
}
