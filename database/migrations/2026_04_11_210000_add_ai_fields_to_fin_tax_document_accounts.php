<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add ai_identifier and ai_account_name to fin_tax_document_accounts.
 *
 * These columns store the AI-detected account identifier and account name
 * directly on each join row so the UI can display them without relying on
 * positional index correlation with the parent parsed_data array.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fin_tax_document_accounts', function (Blueprint $table) {
            $table->string('ai_identifier', 100)->nullable()->after('tax_year');
            $table->string('ai_account_name', 255)->nullable()->after('ai_identifier');
        });
    }

    public function down(): void
    {
        Schema::table('fin_tax_document_accounts', function (Blueprint $table) {
            $table->dropColumn(['ai_identifier', 'ai_account_name']);
        });
    }
};
