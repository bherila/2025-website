<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private string $uniqueIndex = 'webauthn_credential_id_hash_unique';

    private string $regularIndex = 'webauthn_credential_id_hash_index';

    public function up(): void
    {
        $tableName = 'webauthn_credentials';

        if (! Schema::hasTable($tableName)) {
            return;
        }

        if (! Schema::hasColumn($tableName, 'credential_id_hash')) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->string('credential_id_hash', 64)->nullable()->after('credential_id');
            });
        }

        DB::table($tableName)
            ->whereNull('credential_id_hash')
            ->whereNotNull('credential_id')
            ->orderBy('id')
            ->select(['id', 'credential_id'])
            ->chunkById(100, function ($credentials) use ($tableName): void {
                foreach ($credentials as $credential) {
                    DB::table($tableName)
                        ->where('id', $credential->id)
                        ->update(['credential_id_hash' => hash('sha256', $credential->credential_id)]);
                }
            });

        if (! $this->hasDuplicateHashes($tableName) && ! Schema::hasIndex($tableName, $this->uniqueIndex)) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->unique('credential_id_hash', $this->uniqueIndex);
            });
        } elseif (! Schema::hasIndex($tableName, ['credential_id_hash'])) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->index('credential_id_hash', $this->regularIndex);
            });
        }
    }

    public function down(): void
    {
        $tableName = 'webauthn_credentials';

        if (! Schema::hasTable($tableName) || ! Schema::hasColumn($tableName, 'credential_id_hash')) {
            return;
        }

        Schema::table($tableName, function (Blueprint $table) use ($tableName) {
            if (Schema::hasIndex($tableName, $this->uniqueIndex)) {
                $table->dropUnique($this->uniqueIndex);
            }

            if (Schema::hasIndex($tableName, $this->regularIndex)) {
                $table->dropIndex($this->regularIndex);
            }

            $table->dropColumn('credential_id_hash');
        });
    }

    private function hasDuplicateHashes(string $tableName): bool
    {
        return DB::table($tableName)
            ->select('credential_id_hash')
            ->whereNotNull('credential_id_hash')
            ->groupBy('credential_id_hash')
            ->havingRaw('COUNT(*) > 1')
            ->limit(1)
            ->exists();
    }
};
