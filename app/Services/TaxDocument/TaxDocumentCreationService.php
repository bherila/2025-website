<?php

namespace App\Services\TaxDocument;

use App\GenAiProcessor\Jobs\ParseImportJob;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\TaxDocumentAccount;
use Illuminate\Support\Facades\DB;

/**
 * Encapsulates the "create tax document + optional account link + optional AI job" workflow.
 *
 * Centralising these steps here means controllers and CLI commands stay thin:
 * - TaxDocumentController::store()          → createSingleAccountDocument()
 * - TaxDocumentController::storeMultiAccount() → createMultiAccountDocument()
 * - FinanceTaxImportCommand::handle()       → createImportedDocument()
 *
 * Benefits:
 * - Single source of truth for document creation logic
 * - Easier to add audit logging, validation, and event dispatching
 * - Testable in isolation without the HTTP layer
 */
class TaxDocumentCreationService
{
    /**
     * Create a single-account tax document, its account link (if applicable), and dispatch
     * an AI parsing job. When $docAttributes already contains 'parsed_data' the AI job is
     * skipped entirely and genai_status is set to 'parsed'.
     *
     * @param  array<string,mixed>  $docAttributes  FileForTaxDocument fillable field values.
     *                                              Required: user_id, tax_year, form_type,
     *                                              original_filename, stored_filename, s3_path,
     *                                              mime_type, file_size_bytes, file_hash,
     *                                              uploaded_by_user_id.
     *                                              Optional: employment_entity_id, account_id,
     *                                              notes, parsed_data (skips AI when present).
     * @param  array<string,mixed>|null  $linkAttributes  When provided, a TaxDocumentAccount row
     *                                                    is created. Required key: account_id.
     *                                                    Optional keys: form_type, tax_year, notes.
     * @return FileForTaxDocument The newly created document (with genai_job_id set if dispatched).
     */
    public function createSingleAccountDocument(
        array $docAttributes,
        ?array $linkAttributes = null,
    ): FileForTaxDocument {
        $hasParsedData = isset($docAttributes['parsed_data']);

        if (! $hasParsedData) {
            $docAttributes['genai_status'] = 'pending';
        }

        $doc = DB::transaction(function () use ($docAttributes, $linkAttributes, $hasParsedData): FileForTaxDocument {
            $taxDoc = FileForTaxDocument::create($docAttributes);

            // Create the account link if link attributes are provided.
            if ($linkAttributes !== null) {
                TaxDocumentAccount::createLink(
                    $taxDoc->id,
                    $linkAttributes['account_id'] ?? null,
                    $linkAttributes['form_type'] ?? $docAttributes['form_type'],
                    $linkAttributes['tax_year'] ?? $docAttributes['tax_year'],
                    notes: $linkAttributes['notes'] ?? null,
                );
            }

            if (! $hasParsedData) {
                $genaiJob = GenAiImportJob::create([
                    'user_id' => $docAttributes['user_id'],
                    'job_type' => 'tax_document',
                    'file_hash' => $docAttributes['file_hash'],
                    'original_filename' => $docAttributes['original_filename'],
                    's3_path' => $docAttributes['s3_path'],
                    'mime_type' => $docAttributes['mime_type'] ?? 'application/pdf',
                    'file_size_bytes' => $docAttributes['file_size_bytes'],
                    'context_json' => json_encode([
                        'tax_year' => (int) $docAttributes['tax_year'],
                        'form_type' => $docAttributes['form_type'],
                        'tax_document_id' => $taxDoc->id,
                    ]),
                    'status' => 'pending',
                ]);

                $taxDoc->update(['genai_job_id' => $genaiJob->id]);
            }

            return $taxDoc;
        });

        if (! $hasParsedData) {
            ParseImportJob::dispatch($doc->genai_job_id);
        }

        return $doc;
    }

    /**
     * Create a multi-account consolidated tax document (e.g. Fidelity Tax Reporting Statement)
     * and dispatch an AI parsing job. Account links are created later, after AI parsing.
     *
     * @param  array<string,mixed>  $docAttributes  FileForTaxDocument fillable field values.
     *                                              Required: user_id, tax_year, form_type,
     *                                              original_filename, stored_filename, s3_path,
     *                                              mime_type, file_size_bytes, file_hash,
     *                                              uploaded_by_user_id.
     * @param  array<array{name?:string,last4?:string}>  $contextAccounts  Account hints embedded
     *                                                                     in the AI job context_json for matching.
     * @return FileForTaxDocument The newly created document.
     */
    public function createMultiAccountDocument(
        array $docAttributes,
        array $contextAccounts = [],
    ): FileForTaxDocument {
        $docAttributes['genai_status'] = 'pending';

        $doc = DB::transaction(function () use ($docAttributes, $contextAccounts): FileForTaxDocument {
            $taxDoc = FileForTaxDocument::create($docAttributes);

            $genaiJob = GenAiImportJob::create([
                'user_id' => $docAttributes['user_id'],
                'job_type' => 'tax_form_multi_account_import',
                'file_hash' => $docAttributes['file_hash'],
                'original_filename' => $docAttributes['original_filename'],
                's3_path' => $docAttributes['s3_path'],
                'mime_type' => $docAttributes['mime_type'] ?? 'application/pdf',
                'file_size_bytes' => $docAttributes['file_size_bytes'],
                'context_json' => json_encode([
                    'tax_document_id' => $taxDoc->id,
                    'tax_year' => (int) $docAttributes['tax_year'],
                    'accounts' => $contextAccounts,
                ]),
                'status' => 'pending',
            ]);

            $taxDoc->update(['genai_job_id' => $genaiJob->id]);

            return $taxDoc;
        });

        ParseImportJob::dispatch($doc->genai_job_id);

        return $doc;
    }

    /**
     * Create a pre-parsed (imported) tax document with optional account links, without
     * dispatching any AI job. Used by FinanceTaxImportCommand for CLI-based imports.
     *
     * @param  array<string,mixed>  $docAttributes  FileForTaxDocument fillable field values.
     *                                              Required: user_id, tax_year, form_type,
     *                                              original_filename, stored_filename, s3_path,
     *                                              mime_type, file_size_bytes, file_hash,
     *                                              uploaded_by_user_id, parsed_data.
     * @param  array<array{account_id?:int|null,form_type?:string,tax_year?:int}>  $accountLinks
     *                                                                                            Optional list of account links to create.
     * @return FileForTaxDocument The newly created document.
     */
    public function createImportedDocument(
        array $docAttributes,
        array $accountLinks = [],
    ): FileForTaxDocument {
        return DB::transaction(function () use ($docAttributes, $accountLinks): FileForTaxDocument {
            $taxDoc = FileForTaxDocument::create($docAttributes);

            foreach ($accountLinks as $link) {
                TaxDocumentAccount::createLink(
                    $taxDoc->id,
                    $link['account_id'] ?? null,
                    $link['form_type'] ?? $docAttributes['form_type'],
                    $link['tax_year'] ?? $docAttributes['tax_year'],
                );
            }

            return $taxDoc;
        });
    }
}
