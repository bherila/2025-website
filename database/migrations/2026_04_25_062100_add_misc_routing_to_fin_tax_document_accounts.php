<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('fin_tax_document_accounts', 'misc_routing')) {
            return;
        }

        $driver = Schema::getConnection()->getDriverName();

        Schema::table('fin_tax_document_accounts', function (Blueprint $table) use ($driver): void {
            $column = $table->string('misc_routing', 20)->nullable();

            if ($driver === 'mysql') {
                $column->after('notes');
            }
        });

        // Backfill: copy document-level misc_routing to each 1099_misc link row.
        DB::statement("
            UPDATE fin_tax_document_accounts
            SET misc_routing = (
                SELECT fin_tax_documents.misc_routing
                FROM fin_tax_documents
                WHERE fin_tax_documents.id = fin_tax_document_accounts.tax_document_id
            )
            WHERE form_type = '1099_misc'
              AND EXISTS (
                  SELECT 1 FROM fin_tax_documents
                  WHERE fin_tax_documents.id = fin_tax_document_accounts.tax_document_id
                    AND fin_tax_documents.misc_routing IS NOT NULL
              )
        ");
    }

    public function down(): void
    {
        if (! Schema::hasColumn('fin_tax_document_accounts', 'misc_routing')) {
            return;
        }

        Schema::table('fin_tax_document_accounts', function (Blueprint $table): void {
            $table->dropColumn('misc_routing');
        });
    }
};
