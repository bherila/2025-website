<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('fin_tax_documents', 'parsed_data_needs_review')) {
            Schema::table('fin_tax_documents', function (Blueprint $table): void {
                $table->boolean('parsed_data_needs_review')->default(false)->after('parsed_data');
                $table->json('parsed_data_warnings')->nullable()->after('parsed_data_needs_review');
            });
        }

        if (! Schema::hasColumn('fin_tax_document_accounts', 'parsed_data_needs_review')) {
            Schema::table('fin_tax_document_accounts', function (Blueprint $table): void {
                $table->boolean('parsed_data_needs_review')->default(false)->after('misc_routing');
                $table->json('parsed_data_warnings')->nullable()->after('parsed_data_needs_review');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('fin_tax_document_accounts', 'parsed_data_needs_review')) {
            Schema::table('fin_tax_document_accounts', function (Blueprint $table): void {
                $table->dropColumn(['parsed_data_needs_review', 'parsed_data_warnings']);
            });
        }

        if (Schema::hasColumn('fin_tax_documents', 'parsed_data_needs_review')) {
            Schema::table('fin_tax_documents', function (Blueprint $table): void {
                $table->dropColumn(['parsed_data_needs_review', 'parsed_data_warnings']);
            });
        }
    }
};
