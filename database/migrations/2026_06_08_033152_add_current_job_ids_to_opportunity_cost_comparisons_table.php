<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('opportunity_cost_comparisons', function (Blueprint $table) {
            $table->json('current_job_ids')->nullable()->after('current_job_id');
        });

        DB::table('opportunity_cost_comparisons')
            ->whereNotNull('current_job_id')
            ->orderBy('id')
            ->select(['id', 'current_job_id'])
            ->chunkById(100, function ($rows): void {
                foreach ($rows as $row) {
                    DB::table('opportunity_cost_comparisons')
                        ->where('id', $row->id)
                        ->update(['current_job_ids' => json_encode([(int) $row->current_job_id])]);
                }
            });

        DB::table('opportunity_cost_comparisons')
            ->whereNull('current_job_id')
            ->whereNull('current_job_ids')
            ->update(['current_job_ids' => json_encode([])]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('opportunity_cost_comparisons', function (Blueprint $table) {
            $table->dropColumn('current_job_ids');
        });
    }
};
