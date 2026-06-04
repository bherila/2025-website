<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('webauthn_credentials') || Schema::hasColumn('webauthn_credentials', 'last_used_at')) {
            return;
        }

        Schema::table('webauthn_credentials', function (Blueprint $table) {
            $table->timestamp('last_used_at')->nullable()->after('transports');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('webauthn_credentials') || ! Schema::hasColumn('webauthn_credentials', 'last_used_at')) {
            return;
        }

        Schema::table('webauthn_credentials', function (Blueprint $table) {
            $table->dropColumn('last_used_at');
        });
    }
};
