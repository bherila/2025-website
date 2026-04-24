<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('fin_tax_documents', 'misc_routing')) {
            return;
        }

        $driver = Schema::getConnection()->getDriverName();

        Schema::table('fin_tax_documents', function (Blueprint $table) use ($driver): void {
            $column = $table->string('misc_routing', 20)->nullable();

            if ($driver === 'mysql') {
                $column->after('is_reviewed');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('fin_tax_documents', 'misc_routing')) {
            return;
        }

        Schema::table('fin_tax_documents', function (Blueprint $table): void {
            $table->dropColumn('misc_routing');
        });
    }
};
