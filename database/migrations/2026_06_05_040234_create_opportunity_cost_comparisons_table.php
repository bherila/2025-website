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
        Schema::create('opportunity_cost_comparisons', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')
                ->nullable()
                ->constrained('users', indexName: 'occ_user_fk')
                ->nullOnDelete();
            $table->foreignId('current_job_id')
                ->nullable()
                ->constrained('career_jobs', indexName: 'occ_current_job_fk')
                ->nullOnDelete();
            $table->json('hypothetical_job_ids');
            $table->string('short_code', 10);
            $table->boolean('share_includes_current')->default(true);
            $table->json('computed_json')->nullable();
            $table->timestamps();

            $table->unique('short_code', 'occ_short_code_unique');
            $table->index('user_id', 'occ_user_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('opportunity_cost_comparisons');
    }
};
