<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('user_ai_configurations')) {
            return;
        }

        Schema::create('user_ai_configurations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 255);
            $table->enum('provider', ['gemini', 'anthropic', 'bedrock']);
            $table->text('api_key');
            $table->string('region', 64)->nullable();
            $table->text('session_token')->nullable();
            $table->string('model', 255);
            $table->boolean('is_active')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_ai_configurations');
    }
};
