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
        Schema::create('toon_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')
                ->nullable()
                ->constrained('users', indexName: 'toon_user_fk')
                ->nullOnDelete();
            $table->string('short_code', 10);
            $table->string('title', 120)->nullable();
            $table->mediumText('toon_content');
            $table->timestamps();

            $table->unique('short_code', 'toon_short_code_unique');
            $table->index('user_id', 'toon_user_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('toon_documents');
    }
};
