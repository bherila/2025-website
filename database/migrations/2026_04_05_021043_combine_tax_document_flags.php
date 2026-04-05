<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('fin_tax_documents', 'is_confirmed') && ! Schema::hasColumn('fin_tax_documents', 'is_reviewed')) {
            Schema::table('fin_tax_documents', function (Blueprint $table) {
                $table->renameColumn('is_confirmed', 'is_reviewed');
            });
        }

        if (Schema::hasColumn('fin_tax_documents', 'is_reconciled')) {
            if (Schema::hasColumn('fin_tax_documents', 'is_reviewed')) {
                DB::table('fin_tax_documents')->update([
                    'is_reviewed' => DB::raw('is_reviewed OR is_reconciled'),
                ]);
            }

            Schema::table('fin_tax_documents', function (Blueprint $table) {
                $table->dropColumn('is_reconciled');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('fin_tax_documents', 'is_reviewed')) {
            Schema::table('fin_tax_documents', function (Blueprint $table) {
                $table->renameColumn('is_reviewed', 'is_confirmed');
                if (! Schema::hasColumn('fin_tax_documents', 'is_reconciled')) {
                    $table->boolean('is_reconciled')->default(false);
                }
            });
        }
    }
};
