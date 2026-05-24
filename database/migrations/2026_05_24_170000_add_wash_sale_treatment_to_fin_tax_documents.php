<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('fin_tax_documents')) {
            return;
        }

        if (Schema::hasColumn('fin_tax_documents', 'wash_sale_treatment')) {
            return;
        }

        Schema::table('fin_tax_documents', function (Blueprint $table): void {
            $table->string('wash_sale_treatment', 64)
                ->nullable()
                ->default(null)
                ->after('parsed_data_warnings')
                ->comment('Per-broker Form 8949 wash-sale convention; NULL resolves to gross_of_wash_sales at compute time.');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('fin_tax_documents')) {
            return;
        }

        if (! Schema::hasColumn('fin_tax_documents', 'wash_sale_treatment')) {
            return;
        }

        Schema::table('fin_tax_documents', function (Blueprint $table): void {
            $table->dropColumn('wash_sale_treatment');
        });
    }
};
