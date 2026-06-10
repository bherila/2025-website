<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agent_api_tokens', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained(table: 'users', indexName: 'agent_tokens_user_fk')->cascadeOnDelete();
            $table->string('name', 128);
            $table->string('purpose', 32);
            $table->string('client_hint', 64)->nullable();
            $table->string('module', 64)->nullable();
            $table->string('token_hash', 64)->unique('agent_tokens_hash_unique');
            $table->string('token_prefix', 16)->nullable();
            $table->json('allowed_permissions')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'purpose'], 'agent_tokens_user_purpose_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agent_api_tokens');
    }
};
