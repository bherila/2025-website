<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const COLS = '`id`, `user_id`, `tax_year`, `form_type`, `employment_entity_id`, `account_id`,
  `original_filename`, `stored_filename`, `s3_path`, `mime_type`, `file_size_bytes`,
  `file_hash`, `uploaded_by_user_id`, `notes`, `is_reviewed`, `genai_job_id`,
  `genai_status`, `parsed_data`, `download_history`,
  `created_at`, `updated_at`, `deleted_at`';

    /**
     * Rebuilds fin_tax_documents with an updated form_type CHECK constraint.
     *
     * Uses the safe pattern: CREATE new → COPY data → PRAGMA foreign_keys=OFF
     * → DROP old → RENAME new → PRAGMA foreign_keys=ON.
     *
     * Do NOT use "RENAME original → backup" first: SQLite 3.45+ remaps FK
     * references in dependent tables (e.g. genai_import_jobs.id) to the backup
     * name, which breaks them after the backup is dropped.
     */
    private function rebuildTable(string $checkValues): void
    {
        DB::statement("CREATE TABLE `fin_tax_documents_new`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `user_id` INTEGER NOT NULL,
  `tax_year` INTEGER NOT NULL,
  `form_type` TEXT NOT NULL CHECK(`form_type` IN({$checkValues})),
  `employment_entity_id` INTEGER NULL REFERENCES fin_employment_entity(id) ON DELETE SET NULL,
  `account_id` INTEGER NULL REFERENCES fin_accounts(acct_id) ON DELETE SET NULL,
  `original_filename` TEXT NOT NULL,
  `stored_filename` TEXT NOT NULL,
  `s3_path` TEXT NOT NULL,
  `mime_type` TEXT NOT NULL DEFAULT 'application/pdf',
  `file_size_bytes` INTEGER NOT NULL,
  `file_hash` TEXT NOT NULL,
  `uploaded_by_user_id` INTEGER NULL,
  `notes` TEXT NULL,
  `is_reviewed` INTEGER NOT NULL DEFAULT 0,
  `genai_job_id` INTEGER NULL,
  `genai_status` TEXT NULL,
  `parsed_data` TEXT NULL,
  `download_history` TEXT NULL,
  `created_at` TEXT,
  `updated_at` TEXT,
  `deleted_at` TEXT,
  FOREIGN KEY(`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
)");
    }

    private function copyDropRenameAndIndex(string $whereClause = ''): void
    {
        $cols = self::COLS;
        $where = $whereClause ? "WHERE {$whereClause}" : '';
        DB::statement("INSERT INTO `fin_tax_documents_new` ({$cols}) SELECT {$cols} FROM `fin_tax_documents` {$where}");

        DB::statement('PRAGMA foreign_keys = OFF');

        try {
            DB::statement('DROP TABLE `fin_tax_documents`');
            DB::statement('ALTER TABLE `fin_tax_documents_new` RENAME TO `fin_tax_documents`');
        } finally {
            DB::statement('PRAGMA foreign_keys = ON');
        }

        DB::statement('CREATE INDEX `fin_tax_documents_user_id_index` ON `fin_tax_documents`(`user_id`)');
        DB::statement('CREATE INDEX `fin_tax_documents_tax_year_index` ON `fin_tax_documents`(`tax_year`)');
        DB::statement('CREATE INDEX `fin_tax_documents_employment_entity_id_index` ON `fin_tax_documents`(`employment_entity_id`)');
        DB::statement('CREATE INDEX `fin_tax_documents_account_id_index` ON `fin_tax_documents`(`account_id`)');
        DB::statement('CREATE INDEX `fin_tax_documents_form_type_index` ON `fin_tax_documents`(`form_type`)');
        DB::statement('CREATE INDEX `fin_tax_documents_genai_job_id_index` ON `fin_tax_documents`(`genai_job_id`)');
    }

    /**
     * Adds '1116' to the fin_tax_documents.form_type constraint.
     * IRS Form 1116 (Foreign Tax Credit) documents can now be uploaded and reviewed.
     *
     * MySQL: ALTER TABLE to modify the ENUM column.
     * SQLite: Recreate the table with an updated CHECK constraint
     *         (SQLite does not support ALTER TABLE ... MODIFY COLUMN).
     */
    public function up(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE fin_tax_documents MODIFY COLUMN form_type ENUM('w2','w2c','1099_int','1099_int_c','1099_div','1099_div_c','1099_misc','k1','1116') NOT NULL");

            return;
        }

        if ($driver === 'sqlite') {
            $this->rebuildTable("'w2', 'w2c', '1099_int', '1099_int_c', '1099_div', '1099_div_c', '1099_misc', 'k1', '1116'");
            $this->copyDropRenameAndIndex();
        }
    }

    public function down(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE fin_tax_documents MODIFY COLUMN form_type ENUM('w2','w2c','1099_int','1099_int_c','1099_div','1099_div_c','1099_misc','k1') NOT NULL");

            return;
        }

        if ($driver === 'sqlite') {
            $this->rebuildTable("'w2', 'w2c', '1099_int', '1099_int_c', '1099_div', '1099_div_c', '1099_misc', 'k1'");
            $this->copyDropRenameAndIndex("`form_type` != '1116'");
        }
    }
};
