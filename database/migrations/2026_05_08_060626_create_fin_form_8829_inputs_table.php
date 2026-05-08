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
        if (Schema::hasTable('fin_form_8829_inputs')) {
            return;
        }

        Schema::create('fin_form_8829_inputs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employment_entity_id')->constrained('fin_employment_entity')->cascadeOnDelete();
            $table->unsignedSmallInteger('tax_year');
            $table->string('method', 20)->default('regular');
            $table->decimal('office_sqft', 10, 2)->nullable();
            $table->decimal('home_sqft', 10, 2)->nullable();
            $table->unsignedTinyInteger('months_used')->default(12);
            $table->decimal('prior_year_op_carryover', 12, 2)->default(0);
            $table->decimal('prior_year_op_carryover_ca', 12, 2)->default(0);
            $table->decimal('prior_year_depreciation_carryover', 12, 2)->default(0);
            $table->decimal('prior_year_depreciation_carryover_ca', 12, 2)->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'employment_entity_id', 'tax_year'], 'fin_form_8829_entity_year_unique');
            $table->index(['user_id', 'tax_year']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fin_form_8829_inputs');
    }
};
