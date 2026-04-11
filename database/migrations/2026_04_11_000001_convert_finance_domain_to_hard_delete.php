<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Convert finance/tax domain from soft-delete to hard-delete.
 *
 * Tables and actions:
 *  - fin_tax_documents         drop deleted_at (S3 cleanup handled by DeleteS3Object job)
 *  - files_for_fin_accounts    drop deleted_at (S3 cleanup handled by DeleteS3Object job)
 *  - fin_rules                 drop deleted_at
 *  - fin_payslip               drop deleted_at
 *  - fin_accounts              drop when_deleted
 *  - fin_account_line_items    drop when_deleted
 *  - fin_account_line_item_links    drop when_deleted
 *  - fin_account_line_item_tag_map  drop when_deleted
 *  - fin_account_tag           drop when_deleted
 *
 * Note: fin_accounts.when_closed is intentionally kept — it marks a closed (retained) account.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Tables that used Laravel SoftDeletes (deleted_at column)
        $softDeleteTables = [
            'fin_tax_documents',
            'files_for_fin_accounts',
            'fin_rules',
            'fin_payslip',
        ];

        foreach ($softDeleteTables as $table) {
            if (Schema::hasColumn($table, 'deleted_at')) {
                Schema::table($table, function (Blueprint $t) {
                    $t->dropColumn('deleted_at');
                });
            }
        }

        // Tables that used homegrown when_deleted pattern
        $whenDeletedTables = [
            'fin_accounts',
            'fin_account_line_items',
            'fin_account_line_item_links',
            'fin_account_line_item_tag_map',
            'fin_account_tag',
        ];

        foreach ($whenDeletedTables as $table) {
            if (Schema::hasColumn($table, 'when_deleted')) {
                Schema::table($table, function (Blueprint $t) {
                    $t->dropColumn('when_deleted');
                });
            }
        }
    }

    public function down(): void
    {
        // Restore deleted_at columns (nullable so existing data is unaffected)
        $softDeleteTables = [
            'fin_tax_documents',
            'files_for_fin_accounts',
            'fin_rules',
            'fin_payslip',
        ];

        foreach ($softDeleteTables as $table) {
            if (! Schema::hasColumn($table, 'deleted_at')) {
                Schema::table($table, function (Blueprint $t) {
                    $t->softDeletes();
                });
            }
        }

        // Restore when_deleted columns
        $whenDeletedTables = [
            'fin_accounts',
            'fin_account_line_items',
            'fin_account_line_item_links',
            'fin_account_line_item_tag_map',
            'fin_account_tag',
        ];

        foreach ($whenDeletedTables as $table) {
            if (! Schema::hasColumn($table, 'when_deleted')) {
                Schema::table($table, function (Blueprint $t) {
                    $t->timestamp('when_deleted')->nullable();
                });
            }
        }
    }
};
