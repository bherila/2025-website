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
        if (Schema::hasTable('fin_schedule_c_inputs')) {
            return;
        }

        Schema::create('fin_schedule_c_inputs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employment_entity_id')->constrained('fin_employment_entity')->cascadeOnDelete();
            $table->unsignedSmallInteger('tax_year');
            $table->decimal('gross_receipts', 18, 4)->default(0);
            $table->decimal('returns_and_allowances', 18, 4)->default(0);
            $table->decimal('other_income', 18, 4)->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'employment_entity_id', 'tax_year'], 'fin_schedule_c_entity_year_unique');
            $table->index(['user_id', 'tax_year']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fin_schedule_c_inputs');
    }
};
