<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            if (! Schema::hasColumn('fin_statements', 'genai_job_id')) {
                DB::statement('ALTER TABLE fin_statements ADD COLUMN genai_job_id INTEGER NULL');
                DB::statement('CREATE INDEX IF NOT EXISTS fin_statements_genai_job_id_index ON fin_statements (genai_job_id)');
            }
        } else {
            Schema::table('fin_statements', function (Blueprint $table) {
                $table->unsignedBigInteger('genai_job_id')->nullable()->after('is_cost_basis_override');
                $table->foreign('genai_job_id')->references('id')->on('genai_import_jobs')->onDelete('set null');
            });
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            // SQLite does not support DROP COLUMN on older versions; skip for test environments
        } else {
            Schema::table('fin_statements', function (Blueprint $table) {
                $table->dropForeign(['genai_job_id']);
                $table->dropColumn('genai_job_id');
            });
        }
    }
};
