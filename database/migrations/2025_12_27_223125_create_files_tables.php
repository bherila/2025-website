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
        // Files for Projects
        Schema::create('files_for_projects', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('client_projects')->onDelete('cascade');
            $table->string('original_filename');
            $table->string('stored_filename');
            $table->string('s3_path');
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('file_size_bytes');
            $table->foreignId('uploaded_by_user_id')->nullable()->constrained('users')->onDelete('set null');
            $table->json('download_history')->nullable()->comment('Array of {user_id, downloaded_at}');
            $table->timestamps();
            $table->softDeletes();

            $table->index('project_id');
        });

        // Files for Client Companies
        Schema::create('files_for_client_companies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_company_id')->constrained('client_companies')->onDelete('cascade');
            $table->string('original_filename');
            $table->string('stored_filename');
            $table->string('s3_path');
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('file_size_bytes');
            $table->foreignId('uploaded_by_user_id')->nullable()->constrained('users')->onDelete('set null');
            $table->json('download_history')->nullable()->comment('Array of {user_id, downloaded_at}');
            $table->timestamps();
            $table->softDeletes();

            $table->index('client_company_id');
        });

        // Files for Agreements
        Schema::create('files_for_agreements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agreement_id')->constrained('client_agreements')->onDelete('cascade');
            $table->string('original_filename');
            $table->string('stored_filename');
            $table->string('s3_path');
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('file_size_bytes');
            $table->foreignId('uploaded_by_user_id')->nullable()->constrained('users')->onDelete('set null');
            $table->json('download_history')->nullable()->comment('Array of {user_id, downloaded_at}');
            $table->timestamps();
            $table->softDeletes();

            $table->index('agreement_id');
        });

        // Files for Tasks
        Schema::create('files_for_tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained('client_tasks')->onDelete('cascade');
            $table->string('original_filename');
            $table->string('stored_filename');
            $table->string('s3_path');
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('file_size_bytes');
            $table->foreignId('uploaded_by_user_id')->nullable()->constrained('users')->onDelete('set null');
            $table->json('download_history')->nullable()->comment('Array of {user_id, downloaded_at}');
            $table->timestamps();
            $table->softDeletes();

            $table->index('task_id');
        });

        // Files for Financial Accounts (statement uploads)
        Schema::create('files_for_fin_accounts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('acct_id');
            $table->unsignedBigInteger('statement_id')->nullable()->comment('Optional link to parsed statement');
            $table->string('original_filename');
            $table->string('stored_filename');
            $table->string('s3_path');
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('file_size_bytes');
            $table->foreignId('uploaded_by_user_id')->nullable()->constrained('users')->onDelete('set null');
            $table->json('download_history')->nullable()->comment('Array of {user_id, downloaded_at}');
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('acct_id')->references('acct_id')->on('fin_accounts')->onDelete('cascade');
            $table->index('acct_id');
            $table->index('statement_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('files_for_fin_accounts');
        Schema::dropIfExists('files_for_tasks');
        Schema::dropIfExists('files_for_agreements');
        Schema::dropIfExists('files_for_client_companies');
        Schema::dropIfExists('files_for_projects');
    }
};
