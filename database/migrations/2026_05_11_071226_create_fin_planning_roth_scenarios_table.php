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
        Schema::create('fin_planning_roth_scenarios', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')
                ->nullable()
                ->constrained('users', indexName: 'fprs_user_fk')
                ->nullOnDelete();
            $table->string('short_code', 10);
            $table->string('title', 120)->nullable();
            $table->json('inputs_json');
            $table->json('computed_json')->nullable();
            $table->timestamps();

            $table->unique('short_code', 'fprs_short_code_unique');
            $table->index('user_id', 'fprs_user_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fin_planning_roth_scenarios');
    }
};
