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
        if (Schema::hasTable('fin_schedule_d_carryover_inputs')) {
            return;
        }

        Schema::create('fin_schedule_d_carryover_inputs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('tax_year');
            $table->decimal('short_term_loss_carryover', 12, 2)->default(0);
            $table->decimal('long_term_loss_carryover', 12, 2)->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'tax_year'], 'fin_sch_d_carry_user_year_unique');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fin_schedule_d_carryover_inputs');
    }
};
