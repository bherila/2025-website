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
        Schema::create('fin_statement_details', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('snapshot_id');
            $table->string('section');
            $table->string('line_item');
            $table->decimal('statement_period_value', 16, 4);
            $table->decimal('ytd_value', 16, 4);
            $table->boolean('is_percentage')->default(false);
            $table->timestamps();

            $table->foreign('snapshot_id')->references('snapshot_id')->on('fin_account_balance_snapshot')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fin_statement_details');
    }
};
