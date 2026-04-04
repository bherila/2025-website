<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Adds '1099_misc' to the fin_tax_documents.form_type constraint.
     *
     * MySQL: ALTER TABLE to modify the ENUM column.
     * SQLite: Recreate the table with an updated CHECK constraint
     *         (SQLite does not support ALTER TABLE ... MODIFY COLUMN).
     */
    public function up(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE fin_tax_documents MODIFY COLUMN form_type ENUM('w2','w2c','1099_int','1099_int_c','1099_div','1099_div_c','1099_misc') NOT NULL");

            return;
        }

        if ($driver === 'sqlite') {
            // SQLite requires dropping and recreating the table to change a CHECK constraint.
            DB::statement('ALTER TABLE `fin_tax_documents` RENAME TO `_fin_tax_documents_backup`');

            DB::statement('CREATE TABLE `fin_tax_documents`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `user_id` INTEGER NOT NULL,
  `tax_year` INTEGER NOT NULL,
  `form_type` TEXT NOT NULL CHECK(`form_type` IN(\'w2\', \'w2c\', \'1099_int\', \'1099_int_c\', \'1099_div\', \'1099_div_c\', \'1099_misc\')),
  `employment_entity_id` INTEGER NULL REFERENCES fin_employment_entity(id) ON DELETE SET NULL,
  `account_id` INTEGER NULL REFERENCES fin_accounts(acct_id) ON DELETE SET NULL,
  `original_filename` TEXT NOT NULL,
  `stored_filename` TEXT NOT NULL,
  `s3_path` TEXT NOT NULL,
  `mime_type` TEXT NOT NULL DEFAULT \'application/pdf\',
  `file_size_bytes` INTEGER NOT NULL,
  `file_hash` TEXT NOT NULL,
  `uploaded_by_user_id` INTEGER NULL,
  `notes` TEXT NULL,
  `is_reconciled` INTEGER NOT NULL DEFAULT 0,
  `genai_job_id` INTEGER NULL,
  `genai_status` TEXT NULL,
  `parsed_data` TEXT NULL,
  `is_confirmed` INTEGER NOT NULL DEFAULT 0,
  `download_history` TEXT NULL,
  `created_at` TEXT,
  `updated_at` TEXT,
  `deleted_at` TEXT,
  FOREIGN KEY(`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
)');

            DB::statement('INSERT INTO `fin_tax_documents` SELECT * FROM `_fin_tax_documents_backup`');
            DB::statement('DROP TABLE `_fin_tax_documents_backup`');

            DB::statement('CREATE INDEX `fin_tax_documents_user_id_index` ON `fin_tax_documents`(`user_id`)');
            DB::statement('CREATE INDEX `fin_tax_documents_tax_year_index` ON `fin_tax_documents`(`tax_year`)');
            DB::statement('CREATE INDEX `fin_tax_documents_employment_entity_id_index` ON `fin_tax_documents`(`employment_entity_id`)');
            DB::statement('CREATE INDEX `fin_tax_documents_account_id_index` ON `fin_tax_documents`(`account_id`)');
            DB::statement('CREATE INDEX `fin_tax_documents_form_type_index` ON `fin_tax_documents`(`form_type`)');
            DB::statement('CREATE INDEX `fin_tax_documents_genai_job_id_index` ON `fin_tax_documents`(`genai_job_id`)');
        }
    }

    public function down(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE fin_tax_documents MODIFY COLUMN form_type ENUM('w2','w2c','1099_int','1099_int_c','1099_div','1099_div_c') NOT NULL");

            return;
        }

        if ($driver === 'sqlite') {
            DB::statement('ALTER TABLE `fin_tax_documents` RENAME TO `_fin_tax_documents_backup`');

            DB::statement('CREATE TABLE `fin_tax_documents`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `user_id` INTEGER NOT NULL,
  `tax_year` INTEGER NOT NULL,
  `form_type` TEXT NOT NULL CHECK(`form_type` IN(\'w2\', \'w2c\', \'1099_int\', \'1099_int_c\', \'1099_div\', \'1099_div_c\')),
  `employment_entity_id` INTEGER NULL REFERENCES fin_employment_entity(id) ON DELETE SET NULL,
  `account_id` INTEGER NULL REFERENCES fin_accounts(acct_id) ON DELETE SET NULL,
  `original_filename` TEXT NOT NULL,
  `stored_filename` TEXT NOT NULL,
  `s3_path` TEXT NOT NULL,
  `mime_type` TEXT NOT NULL DEFAULT \'application/pdf\',
  `file_size_bytes` INTEGER NOT NULL,
  `file_hash` TEXT NOT NULL,
  `uploaded_by_user_id` INTEGER NULL,
  `notes` TEXT NULL,
  `is_reconciled` INTEGER NOT NULL DEFAULT 0,
  `genai_job_id` INTEGER NULL,
  `genai_status` TEXT NULL,
  `parsed_data` TEXT NULL,
  `is_confirmed` INTEGER NOT NULL DEFAULT 0,
  `download_history` TEXT NULL,
  `created_at` TEXT,
  `updated_at` TEXT,
  `deleted_at` TEXT,
  FOREIGN KEY(`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
)');

            DB::statement('INSERT INTO `fin_tax_documents` SELECT * FROM `_fin_tax_documents_backup` WHERE `form_type` != \'1099_misc\'');
            DB::statement('DROP TABLE `_fin_tax_documents_backup`');

            DB::statement('CREATE INDEX `fin_tax_documents_user_id_index` ON `fin_tax_documents`(`user_id`)');
            DB::statement('CREATE INDEX `fin_tax_documents_tax_year_index` ON `fin_tax_documents`(`tax_year`)');
            DB::statement('CREATE INDEX `fin_tax_documents_employment_entity_id_index` ON `fin_tax_documents`(`employment_entity_id`)');
            DB::statement('CREATE INDEX `fin_tax_documents_account_id_index` ON `fin_tax_documents`(`account_id`)');
            DB::statement('CREATE INDEX `fin_tax_documents_form_type_index` ON `fin_tax_documents`(`form_type`)');
            DB::statement('CREATE INDEX `fin_tax_documents_genai_job_id_index` ON `fin_tax_documents`(`genai_job_id`)');
        }
    }
};
