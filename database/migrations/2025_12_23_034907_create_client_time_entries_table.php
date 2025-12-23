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
        Schema::create('client_time_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('client_projects')->onDelete('cascade');
            $table->foreignId('client_company_id')->constrained('client_companies')->onDelete('cascade');
            $table->foreignId('task_id')->nullable()->constrained('client_tasks')->onDelete('set null');
            $table->string('name')->nullable();
            $table->integer('minutes_worked');
            $table->date('date_worked');
            $table->foreignId('user_id')->nullable()->constrained('users')->onDelete('set null');
            $table->foreignId('creator_user_id')->nullable()->constrained('users')->onDelete('set null');
            $table->boolean('is_billable')->default(true);
            $table->string('job_type')->default('Software Development');
            $table->timestamps();
            $table->softDeletes();
            
            $table->index('project_id');
            $table->index('client_company_id');
            $table->index('task_id');
            $table->index('user_id');
            $table->index('date_worked');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('client_time_entries');
    }
};
