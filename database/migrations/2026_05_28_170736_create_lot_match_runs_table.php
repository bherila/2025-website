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
        Schema::create('lot_match_runs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('document_id');
            $table->unsignedBigInteger('user_id');
            $table->string('status', 24);
            $table->string('mode', 16)->default('preserve');
            $table->dateTime('started_at')->nullable();
            $table->dateTime('finished_at')->nullable();
            $table->json('result_summary')->nullable();
            $table->text('error')->nullable();
            $table->timestamps();

            $table->foreign('document_id', 'lmr_document_fk')
                ->references('id')
                ->on('fin_documents')
                ->cascadeOnDelete();
            $table->foreign('user_id', 'lmr_user_fk')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();

            $table->index(['document_id', 'status'], 'lmr_doc_status_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('lot_match_runs');
    }
};
