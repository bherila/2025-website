<?php

use App\Models\FinanceTool\FinAccountTag;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * On MySQL: adds an ENUM column to enforce valid values at the DB level.
     * On SQLite: adds a TEXT column with a CHECK constraint (SQLite does not support ENUM).
     */
    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();
        $values = FinAccountTag::TAX_CHARACTERISTIC_VALUES;

        if ($driver === 'mysql') {
            Schema::table('fin_account_tag', function (Blueprint $table) use ($values) {
                $table->enum('tax_characteristic', $values)->nullable()->after('tag_label');
            });
        } else {
            // SQLite: use TEXT with CHECK constraint
            // Values are quoted individually via PDO to prevent any future injection risk
            $pdo = DB::connection()->getPdo();
            $quoted = implode(', ', array_map(fn ($v) => $pdo->quote($v), $values));
            DB::statement(
                'ALTER TABLE fin_account_tag ADD COLUMN tax_characteristic TEXT'
                ." CHECK(tax_characteristic IN ({$quoted})) NULL DEFAULT NULL"
            );
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('fin_account_tag', function (Blueprint $table) {
            $table->dropColumn('tax_characteristic');
        });
    }
};
