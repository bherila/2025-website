<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Creates a many-to-many link table for transaction relationships.
     * This replaces the legacy parent_t_id column approach with a more flexible
     * link table that can support multiple parent-child relationships.
     */
    public function up(): void
    {
        Schema::create('fin_account_line_item_links', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('parent_t_id')->comment('The parent transaction ID (typically the source/withdrawal)');
            $table->unsignedBigInteger('child_t_id')->comment('The child transaction ID (typically the destination/deposit)');
            $table->timestamp('when_added')->useCurrent();
            $table->timestamp('when_deleted')->nullable();

            // Indexes for efficient lookups
            $table->index('parent_t_id');
            $table->index('child_t_id');

            // Unique constraint to prevent duplicate links
            $table->unique(['parent_t_id', 'child_t_id']);

            // Foreign keys
            $table->foreign('parent_t_id')
                ->references('t_id')
                ->on('fin_account_line_items')
                ->onDelete('cascade');

            $table->foreign('child_t_id')
                ->references('t_id')
                ->on('fin_account_line_items')
                ->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fin_account_line_item_links');
    }
};
