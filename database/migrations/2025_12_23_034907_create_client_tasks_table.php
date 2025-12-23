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
        Schema::create('client_tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('client_projects')->onDelete('cascade');
            $table->string('name');
            $table->text('description')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->foreignId('assignee_user_id')->nullable()->constrained('users')->onDelete('set null');
            $table->foreignId('creator_user_id')->nullable()->constrained('users')->onDelete('set null');
            $table->boolean('is_high_priority')->default(false);
            $table->boolean('is_hidden_from_clients')->default(false);
            $table->timestamps();
            $table->softDeletes();
            
            $table->index('project_id');
            $table->index('assignee_user_id');
            $table->index('completed_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('client_tasks');
    }
};
