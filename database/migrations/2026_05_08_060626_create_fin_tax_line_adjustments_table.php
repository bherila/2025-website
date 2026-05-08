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
        if (Schema::hasTable('fin_tax_line_adjustments')) {
            return;
        }

        Schema::create('fin_tax_line_adjustments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('tax_year');
            $table->string('form', 40);
            $table->foreignId('entity_id')->nullable()->constrained('fin_employment_entity')->nullOnDelete();
            $table->string('line_ref', 40);
            $table->string('kind', 40);
            $table->decimal('amount', 14, 2)->nullable();
            $table->text('description')->nullable();
            $table->string('status', 20)->default('open');
            $table->timestamps();

            $table->index(['user_id', 'tax_year', 'form', 'line_ref'], 'fin_tax_line_adjustments_lookup');
            $table->index(['user_id', 'tax_year', 'form', 'entity_id'], 'fin_tax_line_adjustments_entity_lookup');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fin_tax_line_adjustments');
    }
};
