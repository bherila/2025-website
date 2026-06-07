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
        Schema::create('fin_tax_return_pdf_exports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained(table: 'users', indexName: 'ftrpe_user_fk')->cascadeOnDelete();
            $table->unsignedSmallInteger('tax_year');
            $table->string('scope', 20);
            $table->json('form_ids');
            $table->string('mode', 20);
            $table->string('status', 20);
            $table->string('filename')->nullable();
            $table->json('error_summary')->nullable();
            $table->timestamp('exported_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'tax_year'], 'ftrpe_user_year_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fin_tax_return_pdf_exports');
    }
};
