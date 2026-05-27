<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tail-step migration: drops the legacy `lot_source` column from fin_account_lots.
 *
 * DO NOT MOVE TO database/migrations/ UNTIL:
 * 1. The finance:backfill-lot-source command has been applied in production.
 * 2. Form 8949 has read the canonical `source` field for at least one full release cycle.
 * 3. All controllers/services have been verified to not reference `lot_source` (grep at PR review).
 *
 * Portable on MySQL and SQLite (SQLite drops via table-rebuild; no FK on lot_source).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fin_account_lots', function (Blueprint $table) {
            $table->dropColumn('lot_source');
        });
    }

    public function down(): void
    {
        Schema::table('fin_account_lots', function (Blueprint $table) {
            $table->string('lot_source', 50)->nullable()->after('is_short_term');
        });
    }
};
