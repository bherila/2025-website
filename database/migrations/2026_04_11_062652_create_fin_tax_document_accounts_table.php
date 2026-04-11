<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Create fin_tax_document_accounts join table and backfill from existing
 * fin_tax_documents.account_id rows so no data is lost.
 *
 * After this migration:
 * - All document–account associations are canonical on fin_tax_document_accounts.
 * - fin_tax_documents.account_id is a legacy column; app code no longer reads or writes it.
 * - is_reviewed and notes are backfilled to the join row per existing data.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fin_tax_document_accounts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tax_document_id');
            $table->unsignedBigInteger('account_id')->nullable();
            $table->string('form_type', 50);
            $table->integer('tax_year');
            $table->boolean('is_reviewed')->default(false);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->foreign('tax_document_id')
                ->references('id')
                ->on('fin_tax_documents')
                ->cascadeOnDelete();

            $table->foreign('account_id')
                ->references('acct_id')
                ->on('fin_accounts')
                ->nullOnDelete();
        });

        // Backfill: seed one join row per existing document that already has account_id set.
        // Copies is_reviewed and notes so per-account review state is preserved.
        // Use a bound parameter for the timestamp so the query works on both MySQL and SQLite.
        $now = now()->toDateTimeString();
        DB::statement('
            INSERT INTO fin_tax_document_accounts
                (tax_document_id, account_id, form_type, tax_year, is_reviewed, notes, created_at, updated_at)
            SELECT
                id, account_id, form_type, tax_year, is_reviewed, notes,
                ?, ?
            FROM fin_tax_documents
            WHERE account_id IS NOT NULL
        ', [$now, $now]);
    }

    public function down(): void
    {
        Schema::dropIfExists('fin_tax_document_accounts');
    }
};
