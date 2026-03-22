<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('webauthn_credentials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('credential_id', 2048); // base64url encoded
            $table->text('public_key');             // CBOR encoded credential public key
            $table->unsignedBigInteger('counter')->default(0);
            $table->string('aaguid', 64)->nullable();
            $table->string('name')->default('Passkey'); // user-friendly name
            $table->json('transports')->nullable();
            $table->timestamps();
            $table->index('user_id');
        });

        Schema::create('login_audit_log', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('email')->nullable();     // email attempted (even if user not found)
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->boolean('success')->default(false);
            $table->string('method')->default('password'); // 'password' | 'passkey' | 'dev'
            $table->boolean('is_suspicious')->default(false);
            $table->timestamps();
            $table->index('user_id');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('webauthn_credentials');
        Schema::dropIfExists('login_audit_log');
    }
};
