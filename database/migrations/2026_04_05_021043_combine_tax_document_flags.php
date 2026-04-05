<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'sqlite') {
            Schema::table('fin_tax_documents', function (Blueprint $table) {
                $table->renameColumn('is_confirmed', 'is_reviewed');
            });

            DB::table('fin_tax_documents')->update([
                'is_reviewed' => DB::raw('is_reviewed OR is_reconciled'),
            ]);

            Schema::table('fin_tax_documents', function (Blueprint $table) {
                $table->dropColumn('is_reconciled');
            });
        } else {
            Schema::table('fin_tax_documents', function (Blueprint $table) {
                $table->renameColumn('is_confirmed', 'is_reviewed');
            });

            DB::table('fin_tax_documents')->update([
                'is_reviewed' => DB::raw('is_reviewed OR is_reconciled'),
            ]);

            Schema::table('fin_tax_documents', function (Blueprint $table) {
                $table->dropColumn('is_reconciled');
            });
        }
    }

    public function down(): void
    {
        Schema::table('fin_tax_documents', function (Blueprint $table) {
            $table->renameColumn('is_reviewed', 'is_confirmed');
            $table->boolean('is_reconciled')->default(false);
        });
    }
};
