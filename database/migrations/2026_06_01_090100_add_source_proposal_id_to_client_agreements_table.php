<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('client_agreements') && ! Schema::hasColumn('client_agreements', 'source_proposal_id')) {
            Schema::table('client_agreements', function (Blueprint $table): void {
                $table->unsignedBigInteger('source_proposal_id')->nullable()->after('id')
                    ->comment('The accepted ClientProposal version that materialized this agreement.');
            });
        }

        if (! $this->hasForeignKey('client_agreements', ['source_proposal_id'])) {
            Schema::table('client_agreements', function (Blueprint $table): void {
                $table->foreign('source_proposal_id')
                    ->references('id')
                    ->on('client_proposals')
                    ->nullOnDelete();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('client_agreements') && Schema::hasColumn('client_agreements', 'source_proposal_id')) {
            $hasForeignKey = $this->hasForeignKey('client_agreements', ['source_proposal_id']);

            Schema::table('client_agreements', function (Blueprint $table) use ($hasForeignKey): void {
                if ($hasForeignKey) {
                    $table->dropForeign(['source_proposal_id']);
                }

                $table->dropColumn('source_proposal_id');
            });
        }
    }

    /**
     * @param  list<string>  $columns
     */
    private function hasForeignKey(string $table, array $columns): bool
    {
        if (! Schema::hasTable($table)) {
            return false;
        }

        $columns = array_map('strtolower', $columns);

        foreach (Schema::getForeignKeys($table) as $foreignKey) {
            $foreignKeyColumns = array_map('strtolower', $foreignKey['columns'] ?? []);

            if ($foreignKeyColumns === $columns) {
                return true;
            }
        }

        return false;
    }
};
