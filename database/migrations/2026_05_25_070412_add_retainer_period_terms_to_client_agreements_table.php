<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('client_agreements')) {
            return;
        }

        Schema::table('client_agreements', function (Blueprint $table): void {
            if (! Schema::hasColumn('client_agreements', 'retainer_fee')) {
                $table->decimal('retainer_fee', 10, 2)->nullable()->after('monthly_retainer_fee');
            }

            if (! Schema::hasColumn('client_agreements', 'retainer_hours')) {
                $table->decimal('retainer_hours', 10, 4)->nullable()->after('retainer_fee');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('client_agreements')) {
            return;
        }

        Schema::table('client_agreements', function (Blueprint $table): void {
            if (Schema::hasColumn('client_agreements', 'retainer_hours')) {
                $table->dropColumn('retainer_hours');
            }

            if (Schema::hasColumn('client_agreements', 'retainer_fee')) {
                $table->dropColumn('retainer_fee');
            }
        });
    }
};
