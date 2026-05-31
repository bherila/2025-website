<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('client_companies') || ! Schema::hasColumn('client_companies', 'last_activity')) {
            return;
        }

        Schema::table('client_companies', function (Blueprint $table): void {
            $table->index('last_activity');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('client_companies')) {
            return;
        }

        Schema::table('client_companies', function (Blueprint $table): void {
            $table->dropIndex(['last_activity']);
        });
    }
};
