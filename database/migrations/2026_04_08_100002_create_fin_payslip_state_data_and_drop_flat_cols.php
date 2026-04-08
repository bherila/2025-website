<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Step 1b — Create fin_payslip_state_data child table, migrate existing flat
 * state-tax columns (ps_state_tax, ps_state_tax_addl, ps_state_disability)
 * from fin_payslip into the new table (state_code = 'CA'), then drop the flat
 * columns from fin_payslip.
 *
 * SQLite note: SQLite does not support ALTER TABLE … DROP COLUMN in older
 * versions, so we use the safe table-rebuild pattern (CREATE new → COPY →
 * DROP old → RENAME new) to remove the three flat columns.
 */
return new class extends Migration
{
    // All fin_payslip columns after migration 1a, excluding the three being dropped.
    // Used by the SQLite table-rebuild path.
    private const PAYSLIP_COLS = '`payslip_id`, `uid`, `period_start`, `period_end`, `pay_date`,
  `earnings_gross`, `earnings_bonus`, `earnings_net_pay`, `earnings_rsu`, `earnings_dividend_equivalent`,
  `imp_other`, `imp_life_choice`, `imp_legal`, `imp_fitness`, `imp_ltd`,
  `ps_oasdi`, `ps_medicare`, `taxable_wages_oasdi`, `taxable_wages_medicare`, `taxable_wages_federal`,
  `ps_fed_tax`, `ps_fed_tax_addl`,
  `ps_401k_pretax`, `ps_401k_aftertax`, `ps_401k_employer`, `ps_fed_tax_refunded`,
  `ps_rsu_tax_offset`, `ps_rsu_excess_refund`,
  `ps_payslip_file_hash`, `ps_is_estimated`, `ps_comment`,
  `ps_pretax_medical`, `ps_pretax_fsa`, `ps_salary`, `ps_vacation_payout`,
  `ps_pretax_dental`, `ps_pretax_vision`,
  `pto_accrued`, `pto_used`, `pto_available`, `pto_statutory_available`, `hours_worked`,
  `other`, `created_at`, `updated_at`, `deleted_at`, `employment_entity_id`';

    public function up(): void
    {
        // 1. Create fin_payslip_state_data child table
        Schema::create('fin_payslip_state_data', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('payslip_id');
            $table->char('state_code', 2);
            $table->decimal('taxable_wages', 12, 4)->nullable();
            $table->decimal('state_tax', 12, 4)->nullable();
            $table->decimal('state_tax_addl', 12, 4)->nullable();
            $table->decimal('state_disability', 12, 4)->nullable();
            $table->timestamps();

            $table->foreign('payslip_id')
                ->references('payslip_id')
                ->on('fin_payslip')
                ->onDelete('cascade');

            $table->index('payslip_id');
        });

        // 2. Migrate existing flat state data → child rows (assume CA for all existing data)
        DB::statement("
            INSERT INTO fin_payslip_state_data (payslip_id, state_code, state_tax, state_tax_addl, state_disability, created_at, updated_at)
            SELECT payslip_id, 'CA', ps_state_tax, ps_state_tax_addl, ps_state_disability, created_at, updated_at
            FROM fin_payslip
            WHERE ps_state_tax IS NOT NULL
               OR ps_state_tax_addl IS NOT NULL
               OR ps_state_disability IS NOT NULL
        ");

        // 3. Drop the three flat columns from fin_payslip
        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            DB::statement('ALTER TABLE fin_payslip
                DROP COLUMN ps_state_tax,
                DROP COLUMN ps_state_tax_addl,
                DROP COLUMN ps_state_disability
            ');
        } elseif ($driver === 'sqlite') {
            $this->rebuildPayslipTableSQLite();
        }
    }

    public function down(): void
    {
        $driver = DB::getDriverName();

        // Restore the flat columns on fin_payslip
        Schema::table('fin_payslip', function (Blueprint $table) {
            $table->decimal('ps_state_tax', 12, 4)->nullable();
            $table->decimal('ps_state_tax_addl', 12, 4)->nullable();
            $table->decimal('ps_state_disability', 12, 4)->nullable();
        });

        // Reverse-migrate: copy back from child table to flat columns (first row per payslip)
        if ($driver === 'mysql') {
            DB::statement('
                UPDATE fin_payslip p
                INNER JOIN fin_payslip_state_data s ON s.payslip_id = p.payslip_id
                SET p.ps_state_tax       = s.state_tax,
                    p.ps_state_tax_addl  = s.state_tax_addl,
                    p.ps_state_disability = s.state_disability
                WHERE s.id = (
                    SELECT MIN(id) FROM fin_payslip_state_data WHERE payslip_id = p.payslip_id
                )
            ');
        } else {
            DB::statement('
                UPDATE fin_payslip
                SET ps_state_tax = (SELECT state_tax FROM fin_payslip_state_data WHERE payslip_id = fin_payslip.payslip_id LIMIT 1),
                    ps_state_tax_addl = (SELECT state_tax_addl FROM fin_payslip_state_data WHERE payslip_id = fin_payslip.payslip_id LIMIT 1),
                    ps_state_disability = (SELECT state_disability FROM fin_payslip_state_data WHERE payslip_id = fin_payslip.payslip_id LIMIT 1)
            ');
        }

        Schema::dropIfExists('fin_payslip_state_data');
    }

    /**
     * Rebuilds fin_payslip for SQLite, dropping the three flat state columns.
     *
     * SQLite does not support ALTER TABLE … DROP COLUMN in older versions.
     * Safe pattern: CREATE new → INSERT data → PRAGMA foreign_keys=OFF →
     * DROP original → RENAME new → PRAGMA foreign_keys=ON.
     */
    private function rebuildPayslipTableSQLite(): void
    {
        $cols = self::PAYSLIP_COLS;

        DB::statement('CREATE TABLE `fin_payslip_new`(
  `payslip_id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `uid` INTEGER NOT NULL,
  `period_start` TEXT,
  `period_end` TEXT,
  `pay_date` TEXT,
  `earnings_gross` REAL,
  `earnings_bonus` REAL,
  `earnings_net_pay` REAL NOT NULL DEFAULT 0.0000,
  `earnings_rsu` REAL,
  `earnings_dividend_equivalent` REAL,
  `imp_other` REAL,
  `imp_life_choice` REAL,
  `imp_legal` REAL NOT NULL DEFAULT 0.0000,
  `imp_fitness` REAL NOT NULL DEFAULT 0.0000,
  `imp_ltd` REAL NOT NULL DEFAULT 0.0000,
  `ps_oasdi` REAL,
  `ps_medicare` REAL,
  `taxable_wages_oasdi` REAL,
  `taxable_wages_medicare` REAL,
  `taxable_wages_federal` REAL,
  `ps_fed_tax` REAL,
  `ps_fed_tax_addl` REAL,
  `ps_401k_pretax` REAL,
  `ps_401k_aftertax` REAL,
  `ps_401k_employer` REAL,
  `ps_fed_tax_refunded` REAL,
  `ps_rsu_tax_offset` REAL,
  `ps_rsu_excess_refund` REAL,
  `ps_payslip_file_hash` TEXT,
  `ps_is_estimated` INTEGER NOT NULL DEFAULT 1,
  `ps_comment` TEXT,
  `ps_pretax_medical` REAL NOT NULL DEFAULT 0.0000,
  `ps_pretax_fsa` REAL NOT NULL DEFAULT 0.0000,
  `ps_salary` REAL NOT NULL DEFAULT 0.0000,
  `ps_vacation_payout` REAL NOT NULL DEFAULT 0.0000,
  `ps_pretax_dental` REAL NOT NULL DEFAULT 0.0000,
  `ps_pretax_vision` REAL NOT NULL DEFAULT 0.0000,
  `pto_accrued` REAL,
  `pto_used` REAL,
  `pto_available` REAL,
  `pto_statutory_available` REAL,
  `hours_worked` REAL,
  `other` TEXT,
  `created_at` TEXT,
  `updated_at` TEXT,
  `deleted_at` TEXT,
  `employment_entity_id` INTEGER NULL REFERENCES fin_employment_entity(id) ON DELETE SET NULL,
  UNIQUE(`uid`, `period_start`, `period_end`, `pay_date`)
)');

        DB::statement("INSERT INTO `fin_payslip_new` ({$cols}) SELECT {$cols} FROM `fin_payslip`");

        DB::statement('PRAGMA foreign_keys = OFF');

        try {
            DB::statement('DROP TABLE `fin_payslip`');
            DB::statement('ALTER TABLE `fin_payslip_new` RENAME TO `fin_payslip`');
        } finally {
            DB::statement('PRAGMA foreign_keys = ON');
        }
    }
};
