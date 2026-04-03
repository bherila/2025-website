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
  `download_history` TEXT NULL,
  `created_at` TEXT,
  `updated_at` TEXT,
  `deleted_at` TEXT,
  FOREIGN KEY(`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
)');
            DB::statement('CREATE INDEX `fin_tax_documents_user_id_index` ON `fin_tax_documents`(`user_id`)');
            DB::statement('CREATE INDEX `fin_tax_documents_tax_year_index` ON `fin_tax_documents`(`tax_year`)');
            DB::statement('CREATE INDEX `fin_tax_documents_employment_entity_id_index` ON `fin_tax_documents`(`employment_entity_id`)');
            DB::statement('CREATE INDEX `fin_tax_documents_account_id_index` ON `fin_tax_documents`(`account_id`)');
            DB::statement('CREATE INDEX `fin_tax_documents_form_type_index` ON `fin_tax_documents`(`form_type`)');
        } else {
            Schema::create('fin_tax_documents', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id');
                $table->integer('tax_year');
                $table->enum('form_type', ['w2', 'w2c', '1099_int', '1099_int_c', '1099_div', '1099_div_c']);
                $table->unsignedBigInteger('employment_entity_id')->nullable();
                $table->unsignedBigInteger('account_id')->nullable();
                $table->string('original_filename');
                $table->string('stored_filename');
                $table->string('s3_path');
                $table->string('mime_type')->default('application/pdf');
                $table->integer('file_size_bytes');
                $table->string('file_hash');
                $table->integer('uploaded_by_user_id')->nullable();
                $table->text('notes')->nullable();
                $table->boolean('is_reconciled')->default(false);
                $table->json('download_history')->nullable();
                $table->timestamps();
                $table->softDeletes();

                $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
                $table->foreign('employment_entity_id')->references('id')->on('fin_employment_entity')->onDelete('set null');
                $table->foreign('account_id')->references('acct_id')->on('fin_accounts')->onDelete('set null');

                $table->index('user_id');
                $table->index('tax_year');
                $table->index('employment_entity_id');
                $table->index('account_id');
                $table->index('form_type');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('fin_tax_documents');
    }
};
