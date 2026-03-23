<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('genai_import_jobs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('acct_id')->nullable();
            $table->string('job_type', 64);
            $table->string('file_hash', 64);
            $table->string('original_filename');
            $table->string('s3_path');
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('file_size_bytes');
            $table->text('context_json')->nullable();
            $table->string('status', 32)->default('pending');
            $table->text('error_message')->nullable();
            $table->unsignedTinyInteger('retry_count')->default(0);
            $table->date('scheduled_for')->nullable();
            $table->timestamp('parsed_at')->nullable();
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            $table->foreign('acct_id')->references('acct_id')->on('fin_accounts')->onDelete('set null');

            $table->index(['user_id', 'status']);
            $table->index('file_hash');
            $table->index(['scheduled_for', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('genai_import_jobs');
    }
};
