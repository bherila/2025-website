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
        Schema::create('fin_pal_carryforwards', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('tax_year');
            $table->string('activity_name', 255);
            $table->string('activity_ein', 20)->nullable();
            $table->decimal('ordinary_carryover', 12, 2)->default(0);
            $table->decimal('short_term_carryover', 12, 2)->default(0);
            $table->decimal('long_term_carryover', 12, 2)->default(0);
            $table->timestamps();

            $table->index(['user_id', 'tax_year']);
            $table->unique(['user_id', 'tax_year', 'activity_name']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fin_pal_carryforwards');
    }
};
