<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const OLD_UNIQUE = 'fin_equity_awards_grant_date_award_id_vest_date_symbol_unique';

    private const NEW_UNIQUE = 'fea_uid_award_vest_symbol_unique';

    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            $this->rebuildSqliteTable(includeGrantPrice: true, userScopedUnique: true);

            return;
        }

        Schema::table('fin_equity_awards', function (Blueprint $table): void {
            if (! Schema::hasColumn('fin_equity_awards', 'grant_price')) {
                $table->decimal('grant_price', 10, 2)->nullable()->after('vest_price');
            }
        });

        if ($this->mysqlIndexExists(self::OLD_UNIQUE)) {
            DB::statement('ALTER TABLE fin_equity_awards DROP INDEX '.self::OLD_UNIQUE);
        }

        if (! $this->mysqlIndexExists(self::NEW_UNIQUE)) {
            Schema::table('fin_equity_awards', function (Blueprint $table): void {
                $table->unique(['uid', 'grant_date', 'award_id', 'vest_date', 'symbol'], self::NEW_UNIQUE);
            });
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            $this->rebuildSqliteTable(includeGrantPrice: false, userScopedUnique: false);

            return;
        }

        if ($this->mysqlIndexExists(self::NEW_UNIQUE)) {
            DB::statement('ALTER TABLE fin_equity_awards DROP INDEX '.self::NEW_UNIQUE);
        }

        Schema::table('fin_equity_awards', function (Blueprint $table): void {
            if (Schema::hasColumn('fin_equity_awards', 'grant_price')) {
                $table->dropColumn('grant_price');
            }
        });

        if (! $this->mysqlIndexExists(self::OLD_UNIQUE)) {
            Schema::table('fin_equity_awards', function (Blueprint $table): void {
                $table->unique(['grant_date', 'award_id', 'vest_date', 'symbol'], self::OLD_UNIQUE);
            });
        }
    }

    private function mysqlIndexExists(string $indexName): bool
    {
        $indexes = DB::select('SHOW INDEX FROM fin_equity_awards WHERE Key_name = ?', [$indexName]);

        return $indexes !== [];
    }

    private function rebuildSqliteTable(bool $includeGrantPrice, bool $userScopedUnique): void
    {
        $existingHasGrantPrice = Schema::hasColumn('fin_equity_awards', 'grant_price');
        $grantPriceColumn = $includeGrantPrice ? ', `grant_price` REAL' : '';
        $uniqueColumns = $userScopedUnique
            ? '`uid`, `grant_date`, `award_id`, `vest_date`, `symbol`'
            : '`grant_date`, `award_id`, `vest_date`, `symbol`';

        DB::statement(<<<SQL
CREATE TABLE `fin_equity_awards_rebuilt`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `award_id` TEXT NOT NULL,
  `grant_date` TEXT NOT NULL,
  `vest_date` TEXT NOT NULL,
  `share_count` INTEGER NOT NULL,
  `symbol` TEXT NOT NULL,
  `uid` TEXT NOT NULL,
  `vest_price` REAL{$grantPriceColumn},
  UNIQUE({$uniqueColumns})
)
SQL);

        $targetColumns = '`id`, `award_id`, `grant_date`, `vest_date`, `share_count`, `symbol`, `uid`, `vest_price`';
        $sourceColumns = $targetColumns;
        if ($includeGrantPrice) {
            $targetColumns .= ', `grant_price`';
            $sourceColumns .= $existingHasGrantPrice ? ', `grant_price`' : ', NULL';
        }

        DB::statement("INSERT INTO `fin_equity_awards_rebuilt` ({$targetColumns}) SELECT {$sourceColumns} FROM `fin_equity_awards`");
        DB::statement('DROP TABLE `fin_equity_awards`');
        DB::statement('ALTER TABLE `fin_equity_awards_rebuilt` RENAME TO `fin_equity_awards`');
    }
};
