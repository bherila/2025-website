<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'sqlite') {
            if (! Schema::hasColumn('fin_statements', 'cost_basis')) {
                DB::statement('ALTER TABLE fin_statements ADD COLUMN cost_basis DECIMAL(15,4) NOT NULL DEFAULT 0');
            }
            if (! Schema::hasColumn('fin_statements', 'is_cost_basis_override')) {
                DB::statement('ALTER TABLE fin_statements ADD COLUMN is_cost_basis_override BOOLEAN NOT NULL DEFAULT 0');
            }
        } else {
            if (! Schema::hasColumn('fin_statements', 'cost_basis')) {
                Schema::table('fin_statements', function ($table) {
                    $table->decimal('cost_basis', 15, 4)->default(0)->after('balance');
                });
            }
            if (! Schema::hasColumn('fin_statements', 'is_cost_basis_override')) {
                Schema::table('fin_statements', function ($table) {
                    $table->boolean('is_cost_basis_override')->default(false)->after('cost_basis');
                });
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'sqlite') {
            if (Schema::hasColumn('fin_statements', 'cost_basis')) {
                DB::statement('ALTER TABLE fin_statements DROP COLUMN cost_basis');
            }
            if (Schema::hasColumn('fin_statements', 'is_cost_basis_override')) {
                DB::statement('ALTER TABLE fin_statements DROP COLUMN is_cost_basis_override');
            }
        } else {
            Schema::table('fin_statements', function ($table) {
                $table->dropColumn(['cost_basis', 'is_cost_basis_override']);
            });
        }
    }
};
