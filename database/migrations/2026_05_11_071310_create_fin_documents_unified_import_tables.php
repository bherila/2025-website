<?php

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinDocument;
use App\Models\FinanceTool\FinDocumentAccount;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->createDocumentsTable();
        $this->addDocumentIdToTaxDocuments();
        $this->backfillTaxDocuments();
        $this->renameAndRetargetDocumentAccounts();
        $this->addStatementDocumentId();
        $this->backfillStatements();
        $this->retargetLotDocuments();
        $this->retargetReconciliationDocuments();
    }

    public function down(): void
    {
        /*
         * Rollback restores the legacy column names for local development only.
         * Documents created after the cutover cannot be perfectly expanded back
         * into tax_document_id rows because statements and imports now share the
         * unified parent table.
         */
        if (Schema::hasTable('fin_lot_reconciliation_links') && Schema::hasColumn('fin_lot_reconciliation_links', 'document_id')) {
            Schema::table('fin_lot_reconciliation_links', function (Blueprint $table): void {
                $this->dropForeignIfNotSqlite($table, 'flrl_doc_fk', ['document_id']);
                $table->dropIndex('fin_lot_recon_doc_idx');
                $table->unsignedBigInteger('tax_document_id')->nullable();
                $table->foreign('tax_document_id', 'flrl_tax_doc_fk')->references('id')->on('fin_tax_documents')->nullOnDelete();
                $table->index('tax_document_id', 'fin_lot_recon_tax_doc_idx');
                $table->dropColumn('document_id');
            });
        }

        if (Schema::hasTable('fin_account_lots') && Schema::hasColumn('fin_account_lots', 'document_id')) {
            Schema::table('fin_account_lots', function (Blueprint $table): void {
                $this->dropForeignIfNotSqlite($table, 'fin_lots_doc_fk', ['document_id']);
                $table->dropIndex('fin_lots_doc_idx');
                $table->unsignedBigInteger('tax_document_id')->nullable();
                $table->foreign('tax_document_id')->references('id')->on('fin_tax_documents')->nullOnDelete();
                $table->index('tax_document_id');
                $table->dropColumn('document_id');
            });
        }

        if (Schema::hasTable('fin_account_lots') && Schema::hasColumn('fin_account_lots', 'lot_origin')) {
            Schema::table('fin_account_lots', function (Blueprint $table): void {
                $table->dropIndex('fin_lots_origin_idx');
                $table->dropColumn('lot_origin');
            });
        }

        if (Schema::hasTable('fin_statements') && Schema::hasColumn('fin_statements', 'document_id')) {
            Schema::table('fin_statements', function (Blueprint $table): void {
                $this->dropForeignIfNotSqlite($table, 'fin_statements_doc_fk', ['document_id']);
                $table->dropIndex('fin_statements_doc_idx');
                $table->dropColumn('document_id');
            });
        }

        if (Schema::hasTable('fin_document_accounts')) {
            Schema::table('fin_document_accounts', function (Blueprint $table): void {
                $this->dropForeignIfNotSqlite($table, 'fin_doc_accts_doc_fk', ['document_id']);
                $this->dropForeignIfNotSqlite($table, 'fin_doc_accts_stmt_fk', ['statement_id']);
                $table->dropIndex('fin_doc_accts_doc_idx');
                $table->dropIndex('fin_doc_accts_stmt_idx');
                $table->dropIndex('fin_doc_accts_payload_idx');
                $table->dropColumn(['document_id', 'statement_id', 'account_section_label', 'payload_kind']);
                $table->unsignedBigInteger('tax_document_id')->nullable();
                $table->foreign('tax_document_id', 'fin_tax_doc_accts_tax_doc_fk')->references('id')->on('fin_tax_documents')->cascadeOnDelete();
                $table->index('tax_document_id', 'fin_tax_document_accounts_tax_document_id_index');
            });

            Schema::rename('fin_document_accounts', 'fin_tax_document_accounts');
        }

        if (Schema::hasTable('fin_tax_documents') && Schema::hasColumn('fin_tax_documents', 'document_id')) {
            Schema::table('fin_tax_documents', function (Blueprint $table): void {
                $this->dropForeignIfNotSqlite($table, 'fin_tax_docs_doc_fk', ['document_id']);
                $table->dropIndex('fin_tax_docs_doc_idx');
                $table->dropColumn('document_id');
            });
        }

        Schema::dropIfExists('fin_documents');
    }

    private function createDocumentsTable(): void
    {
        Schema::create('fin_documents', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->string('document_kind', 32);
            $table->integer('tax_year')->nullable();
            $table->date('period_start')->nullable();
            $table->date('period_end')->nullable();
            $table->string('original_filename')->nullable();
            $table->string('stored_filename')->nullable();
            $table->string('s3_path')->nullable();
            $table->string('mime_type', 255)->nullable();
            $table->unsignedBigInteger('file_size_bytes')->nullable();
            $table->string('file_hash')->nullable();
            $table->unsignedBigInteger('uploaded_by_user_id')->nullable();
            $table->unsignedBigInteger('genai_job_id')->nullable();
            $table->string('genai_status', 32)->nullable();
            $table->json('parsed_data')->nullable();
            $table->boolean('parsed_data_needs_review')->default(false);
            $table->json('parsed_data_warnings')->nullable();
            $table->text('notes')->nullable();
            $table->boolean('is_reviewed')->default(false);
            $table->json('download_history')->nullable();
            $table->timestamps();

            $table->foreign('user_id', 'fin_docs_user_fk')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('uploaded_by_user_id', 'fin_docs_uploader_fk')->references('id')->on('users')->nullOnDelete();
            $table->foreign('genai_job_id', 'fin_docs_genai_fk')->references('id')->on('genai_import_jobs')->nullOnDelete();
            $table->index(['user_id', 'document_kind'], 'fin_docs_user_kind_idx');
            $table->index(['user_id', 'tax_year'], 'fin_docs_user_year_idx');
            $table->unique(['user_id', 'file_hash'], 'fin_docs_user_hash_unique');
            $table->index('genai_status', 'fin_docs_genai_status_idx');
        });
    }

    private function addDocumentIdToTaxDocuments(): void
    {
        Schema::table('fin_tax_documents', function (Blueprint $table): void {
            $table->unsignedBigInteger('document_id')->nullable()->after('id');
            $table->foreign('document_id', 'fin_tax_docs_doc_fk')->references('id')->on('fin_documents')->cascadeOnDelete();
            $table->index('document_id', 'fin_tax_docs_doc_idx');
        });
    }

    private function backfillTaxDocuments(): void
    {
        DB::table('fin_tax_documents')
            ->orderBy('id')
            ->chunkById(250, function ($taxDocuments): void {
                foreach ($taxDocuments as $taxDocument) {
                    $documentId = $this->firstOrCreateDocument([
                        'user_id' => (int) $taxDocument->user_id,
                        'document_kind' => FinDocument::KIND_TAX_FORM,
                        'tax_year' => $taxDocument->tax_year,
                        'original_filename' => $taxDocument->original_filename,
                        'stored_filename' => $taxDocument->stored_filename,
                        's3_path' => $taxDocument->s3_path,
                        'mime_type' => $taxDocument->mime_type,
                        'file_size_bytes' => $taxDocument->file_size_bytes,
                        'file_hash' => $taxDocument->file_hash,
                        'uploaded_by_user_id' => $taxDocument->uploaded_by_user_id,
                        'genai_job_id' => $taxDocument->genai_job_id,
                        'genai_status' => $taxDocument->genai_status,
                        'parsed_data' => $taxDocument->parsed_data,
                        'parsed_data_needs_review' => (bool) ($taxDocument->parsed_data_needs_review ?? false),
                        'parsed_data_warnings' => $taxDocument->parsed_data_warnings ?? null,
                        'notes' => $taxDocument->notes,
                        'is_reviewed' => (bool) ($taxDocument->is_reviewed ?? false),
                        'download_history' => $taxDocument->download_history,
                        'created_at' => $taxDocument->created_at,
                        'updated_at' => $taxDocument->updated_at,
                    ]);

                    DB::table('fin_tax_documents')
                        ->where('id', $taxDocument->id)
                        ->update(['document_id' => $documentId]);
                }
            });
    }

    private function renameAndRetargetDocumentAccounts(): void
    {
        if (Schema::hasTable('fin_tax_document_accounts') && ! Schema::hasTable('fin_document_accounts')) {
            Schema::rename('fin_tax_document_accounts', 'fin_document_accounts');
        }

        Schema::table('fin_document_accounts', function (Blueprint $table): void {
            $table->unsignedBigInteger('document_id')->nullable()->after('id');
            $table->unsignedBigInteger('statement_id')->nullable()->after('account_id');
            $table->string('account_section_label')->nullable()->after('tax_year');
            $table->string('payload_kind', 64)->nullable()->after('account_section_label');
            $table->index('document_id', 'fin_doc_accts_doc_idx');
            $table->index('statement_id', 'fin_doc_accts_stmt_idx');
            $table->index('payload_kind', 'fin_doc_accts_payload_idx');
        });

        DB::table('fin_document_accounts')
            ->orderBy('id')
            ->chunkById(250, function ($links): void {
                foreach ($links as $link) {
                    $documentId = DB::table('fin_tax_documents')
                        ->where('id', $link->tax_document_id)
                        ->value('document_id');

                    DB::table('fin_document_accounts')
                        ->where('id', $link->id)
                        ->update([
                            'document_id' => $documentId,
                            'payload_kind' => $link->form_type === FileForTaxDocument::FORM_TYPE_1099_B
                                ? FinDocumentAccount::PAYLOAD_DISPOSITIONS
                                : null,
                        ]);
                }
            });

        Schema::table('fin_document_accounts', function (Blueprint $table): void {
            $this->dropForeignIfNotSqlite($table, 'fin_tax_document_accounts_tax_document_id_foreign', ['tax_document_id']);
            $this->dropIndexIfPossible($table, 'fin_tax_document_accounts_tax_document_id_index');
            $table->dropColumn('tax_document_id');
            $table->foreign('document_id', 'fin_doc_accts_doc_fk')->references('id')->on('fin_documents')->cascadeOnDelete();
            $table->foreign('statement_id', 'fin_doc_accts_stmt_fk')->references('statement_id')->on('fin_statements')->nullOnDelete();
        });

        Schema::table('fin_document_accounts', function (Blueprint $table): void {
            $table->string('form_type', 50)->nullable()->change();
            $table->integer('tax_year')->nullable()->change();
        });
    }

    private function addStatementDocumentId(): void
    {
        Schema::table('fin_statements', function (Blueprint $table): void {
            $table->unsignedBigInteger('document_id')->nullable()->after('statement_id');
            $table->foreign('document_id', 'fin_statements_doc_fk')->references('id')->on('fin_documents')->nullOnDelete();
            $table->index('document_id', 'fin_statements_doc_idx');
        });
    }

    private function backfillStatements(): void
    {
        $now = now()->toDateTimeString();
        $filesByStatement = DB::table('files_for_fin_accounts')
            ->whereNotNull('statement_id')
            ->get()
            ->keyBy('statement_id');

        DB::table('fin_statements')
            ->join('fin_accounts', 'fin_accounts.acct_id', '=', 'fin_statements.acct_id')
            ->select('fin_statements.*', 'fin_accounts.acct_owner', 'fin_accounts.acct_name')
            ->orderBy('fin_statements.statement_id')
            ->chunkById(250, function ($statements) use ($filesByStatement, $now): void {
                foreach ($statements as $statement) {
                    $file = $filesByStatement->get($statement->statement_id);
                    $documentId = $this->firstOrCreateDocument([
                        'user_id' => (int) $statement->acct_owner,
                        'document_kind' => FinDocument::KIND_STATEMENT,
                        'period_start' => $statement->statement_opening_date,
                        'period_end' => $statement->statement_closing_date,
                        'original_filename' => $file->original_filename ?? 'Statement '.$statement->statement_id,
                        'stored_filename' => $file->stored_filename ?? null,
                        's3_path' => $file->s3_path ?? null,
                        'mime_type' => $file->mime_type ?? null,
                        'file_size_bytes' => $file->file_size_bytes ?? null,
                        'file_hash' => $file->file_hash ?? null,
                        'uploaded_by_user_id' => $file->uploaded_by_user_id ?? null,
                        'created_at' => $file->created_at ?? $now,
                        'updated_at' => $file->updated_at ?? $now,
                    ]);

                    DB::table('fin_statements')
                        ->where('statement_id', $statement->statement_id)
                        ->update(['document_id' => $documentId]);

                    $hasDispositionLots = DB::table('fin_account_lots')
                        ->where('statement_id', $statement->statement_id)
                        ->whereNotNull('sale_date')
                        ->exists();

                    DB::table('fin_document_accounts')->insert([
                        'document_id' => $documentId,
                        'account_id' => $statement->acct_id,
                        'statement_id' => $statement->statement_id,
                        'account_section_label' => $statement->acct_name,
                        'payload_kind' => $hasDispositionLots
                            ? FinDocumentAccount::PAYLOAD_DISPOSITIONS
                            : FinDocumentAccount::PAYLOAD_POSITIONS,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            }, 'fin_statements.statement_id', 'statement_id');
    }

    private function retargetLotDocuments(): void
    {
        Schema::table('fin_account_lots', function (Blueprint $table): void {
            $table->unsignedBigInteger('document_id')->nullable()->after('close_t_id');
            $table->string('lot_origin', 32)->nullable()->after('document_id');
            $table->index('document_id', 'fin_lots_doc_idx');
            $table->index('lot_origin', 'fin_lots_origin_idx');
        });

        DB::table('fin_account_lots')
            ->select('lot_id', 'tax_document_id', 'statement_id', 'sale_date', 'source')
            ->orderBy('lot_id')
            ->chunkById(500, function ($lots): void {
                foreach ($lots as $lot) {
                    $documentId = null;
                    $lotOrigin = FinAccountLot::ORIGIN_MANUAL;

                    if ($lot->tax_document_id !== null) {
                        $documentId = DB::table('fin_tax_documents')
                            ->where('id', $lot->tax_document_id)
                            ->value('document_id');
                        $lotOrigin = FinAccountLot::ORIGIN_1099B_DISPOSITION;
                    } elseif ($lot->statement_id !== null) {
                        $documentId = DB::table('fin_statements')
                            ->where('statement_id', $lot->statement_id)
                            ->value('document_id');
                        $lotOrigin = $lot->sale_date !== null
                            ? FinAccountLot::ORIGIN_STATEMENT_DISPOSITION
                            : FinAccountLot::ORIGIN_STATEMENT_POSITION;
                    } elseif ((string) ($lot->source ?? '') === FinAccountLot::SOURCE_BROKER_1099B) {
                        $lotOrigin = FinAccountLot::ORIGIN_1099B_DISPOSITION;
                    }

                    DB::table('fin_account_lots')
                        ->where('lot_id', $lot->lot_id)
                        ->update([
                            'document_id' => $documentId,
                            'lot_origin' => $lotOrigin,
                        ]);
                }
            }, 'lot_id');

        Schema::table('fin_account_lots', function (Blueprint $table): void {
            $this->dropForeignIfNotSqlite($table, 'fin_account_lots_tax_document_id_foreign', ['tax_document_id']);
            $this->dropIndexIfPossible($table, 'fin_account_lots_tax_document_id_index');
            $table->dropColumn('tax_document_id');
            $table->foreign('document_id', 'fin_lots_doc_fk')->references('id')->on('fin_documents')->nullOnDelete();
        });
    }

    private function retargetReconciliationDocuments(): void
    {
        Schema::table('fin_lot_reconciliation_links', function (Blueprint $table): void {
            $table->unsignedBigInteger('document_id')->nullable()->after('id');
            $table->index('document_id', 'fin_lot_recon_doc_idx');
        });

        DB::table('fin_lot_reconciliation_links')
            ->select('id', 'tax_document_id')
            ->whereNotNull('tax_document_id')
            ->orderBy('id')
            ->chunkById(500, function ($links): void {
                foreach ($links as $link) {
                    $documentId = DB::table('fin_tax_documents')
                        ->where('id', $link->tax_document_id)
                        ->value('document_id');

                    DB::table('fin_lot_reconciliation_links')
                        ->where('id', $link->id)
                        ->update(['document_id' => $documentId]);
                }
            });

        Schema::table('fin_lot_reconciliation_links', function (Blueprint $table): void {
            $this->dropForeignIfNotSqlite($table, 'flrl_tax_doc_fk', ['tax_document_id']);
            $this->dropIndexIfPossible($table, 'fin_lot_recon_tax_doc_idx');
            $table->dropColumn('tax_document_id');
            $table->foreign('document_id', 'flrl_doc_fk')->references('id')->on('fin_documents')->nullOnDelete();
        });
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function firstOrCreateDocument(array $attributes): int
    {
        $now = now()->toDateTimeString();
        $userId = (int) $attributes['user_id'];
        $fileHash = is_string($attributes['file_hash'] ?? null) && trim($attributes['file_hash']) !== ''
            ? trim((string) $attributes['file_hash'])
            : null;

        if ($fileHash !== null) {
            $existingId = DB::table('fin_documents')
                ->where('user_id', $userId)
                ->where('file_hash', $fileHash)
                ->value('id');

            if (is_numeric($existingId)) {
                return (int) $existingId;
            }
        }

        return (int) DB::table('fin_documents')->insertGetId([
            'user_id' => $userId,
            'document_kind' => $attributes['document_kind'],
            'tax_year' => $attributes['tax_year'] ?? null,
            'period_start' => $attributes['period_start'] ?? null,
            'period_end' => $attributes['period_end'] ?? null,
            'original_filename' => $attributes['original_filename'] ?? null,
            'stored_filename' => $attributes['stored_filename'] ?? null,
            's3_path' => $attributes['s3_path'] ?? null,
            'mime_type' => $attributes['mime_type'] ?? null,
            'file_size_bytes' => $attributes['file_size_bytes'] ?? null,
            'file_hash' => $fileHash,
            'uploaded_by_user_id' => $attributes['uploaded_by_user_id'] ?? null,
            'genai_job_id' => $attributes['genai_job_id'] ?? null,
            'genai_status' => $attributes['genai_status'] ?? null,
            'parsed_data' => $attributes['parsed_data'] ?? null,
            'parsed_data_needs_review' => (bool) ($attributes['parsed_data_needs_review'] ?? false),
            'parsed_data_warnings' => $attributes['parsed_data_warnings'] ?? null,
            'notes' => $attributes['notes'] ?? null,
            'is_reviewed' => (bool) ($attributes['is_reviewed'] ?? false),
            'download_history' => $attributes['download_history'] ?? null,
            'created_at' => $attributes['created_at'] ?? $now,
            'updated_at' => $attributes['updated_at'] ?? $now,
        ]);
    }

    /**
     * @param  list<string>  $sqliteColumns
     */
    private function dropForeignIfNotSqlite(Blueprint $table, string $name, array $sqliteColumns): void
    {
        if (DB::getDriverName() === 'sqlite') {
            $table->dropForeign($sqliteColumns);

            return;
        }

        $table->dropForeign($name);
    }

    private function dropIndexIfPossible(Blueprint $table, string $name): void
    {
        $table->dropIndex($name);
    }
};
