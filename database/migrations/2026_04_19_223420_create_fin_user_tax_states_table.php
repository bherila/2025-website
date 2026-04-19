<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fin_user_tax_states', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedSmallInteger('tax_year');
            $table->string('state_code', 2); // e.g. 'CA', 'NY'
            $table->timestamps();

            // Unique index on (user_id, tax_year, state_code) also serves (user_id, tax_year) queries.
            $table->unique(['user_id', 'tax_year', 'state_code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fin_user_tax_states');
    }
};
