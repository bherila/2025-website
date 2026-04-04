<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'sqlite') {
            // Only add columns if they don't already exist (schema dump may already include them)
            $columns = collect(DB::select("PRAGMA table_info('fin_tax_documents')"))->pluck('name')->toArray();

            if (! in_array('genai_job_id', $columns)) {
                DB::statement('ALTER TABLE `fin_tax_documents` ADD COLUMN `genai_job_id` INTEGER NULL');
            }
            if (! in_array('genai_status', $columns)) {
                DB::statement('ALTER TABLE `fin_tax_documents` ADD COLUMN `genai_status` TEXT NULL');
            }
            if (! in_array('parsed_data', $columns)) {
                DB::statement('ALTER TABLE `fin_tax_documents` ADD COLUMN `parsed_data` TEXT NULL');
            }
            if (! in_array('is_confirmed', $columns)) {
                DB::statement('ALTER TABLE `fin_tax_documents` ADD COLUMN `is_confirmed` INTEGER NOT NULL DEFAULT 0');
            }
        } else {
            Schema::table('fin_tax_documents', function (Blueprint $table) {
                // Fix uploaded_by_user_id type to match users.id (bigint unsigned)
                $table->unsignedBigInteger('uploaded_by_user_id')->nullable()->change();

                // GenAI processing fields
                $table->unsignedBigInteger('genai_job_id')->nullable()->after('is_reconciled');
                $table->string('genai_status', 32)->nullable()->after('genai_job_id');
                $table->json('parsed_data')->nullable()->after('genai_status');
                $table->boolean('is_confirmed')->default(false)->after('parsed_data');

                $table->foreign('genai_job_id')->references('id')->on('genai_import_jobs')->onDelete('set null');
                $table->index('genai_job_id');
            });
        }
    }

    public function down(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'sqlite') {
            // SQLite doesn't support DROP COLUMN in older versions; skip
        } else {
            Schema::table('fin_tax_documents', function (Blueprint $table) {
                $table->dropForeign(['genai_job_id']);
                $table->dropColumn(['genai_job_id', 'genai_status', 'parsed_data', 'is_confirmed']);
                $table->integer('uploaded_by_user_id')->nullable()->change();
            });
        }
    }
};
