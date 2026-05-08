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
        if (Schema::hasTable('fin_employment_entity_year')) {
            return;
        }

        Schema::create('fin_employment_entity_year', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employment_entity_id')->constrained('fin_employment_entity')->cascadeOnDelete();
            $table->unsignedSmallInteger('tax_year');
            $table->string('accounting_method', 20)->default('cash');
            $table->boolean('materially_participated')->default(true);
            $table->boolean('made_payments_requiring_1099')->default(false);
            $table->boolean('filed_required_1099s')->nullable();
            $table->boolean('started_or_acquired_this_year')->default(false);
            $table->text('principal_product_service')->nullable();
            $table->string('business_code', 6)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['employment_entity_id', 'tax_year'], 'fin_entity_year_unique');
            $table->index('tax_year');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fin_employment_entity_year');
    }
};
