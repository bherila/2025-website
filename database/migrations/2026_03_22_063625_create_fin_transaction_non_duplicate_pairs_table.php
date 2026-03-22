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
        Schema::create('fin_transaction_non_duplicate_pairs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('t_id_1');
            $table->unsignedBigInteger('t_id_2');
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['t_id_1', 't_id_2']);
            $table->foreign('t_id_1')->references('t_id')->on('fin_account_line_items')->onDelete('cascade');
            $table->foreign('t_id_2')->references('t_id')->on('fin_account_line_items')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fin_transaction_non_duplicate_pairs');
    }
};
