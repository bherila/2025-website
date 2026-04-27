<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
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

        // Enforce at most one active config per user at the DB level.
        // SQLite (used in tests) does not support partial unique indexes, so skip there.
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement('CREATE UNIQUE INDEX user_ai_configurations_one_active_per_user ON user_ai_configurations (user_id) WHERE is_active = TRUE');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('user_ai_configurations');
    }
};
