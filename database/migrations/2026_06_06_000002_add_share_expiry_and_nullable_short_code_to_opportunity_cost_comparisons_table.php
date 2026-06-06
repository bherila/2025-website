<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The owner's private "latest" scenario has a NULL short_code; only shared forks carry a code.
     * Shared forks may also carry an expiration after which they are treated as not found.
     */
    public function up(): void
    {
        Schema::table('opportunity_cost_comparisons', function (Blueprint $table): void {
            $table->dropUnique('occ_short_code_unique');
        });

        Schema::table('opportunity_cost_comparisons', function (Blueprint $table): void {
            $table->string('short_code', 10)->nullable()->change();
            $table->timestamp('expires_at')->nullable()->after('share_includes_current');
        });

        Schema::table('opportunity_cost_comparisons', function (Blueprint $table): void {
            $table->unique('short_code', 'occ_short_code_unique');
        });
    }

    public function down(): void
    {
        Schema::table('opportunity_cost_comparisons', function (Blueprint $table): void {
            $table->dropColumn('expires_at');
        });
    }
};
