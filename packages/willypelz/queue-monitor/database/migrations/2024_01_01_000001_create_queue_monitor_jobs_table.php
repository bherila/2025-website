<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('queue_monitor_jobs', function (Blueprint $table) {
            $table->id();
            $table->string('job_id')->index();
            $table->string('uuid')->nullable()->index();
            $table->string('connection')->index();
            $table->string('queue')->index();
            $table->string('name');
            $table->string('status')->index(); // processing, processed, failed
            $table->integer('attempts')->default(0);
            $table->json('payload')->nullable();
            $table->text('exception')->nullable();
            $table->integer('runtime_ms')->nullable();
            $table->timestamp('started_at')->nullable()->index();
            $table->timestamp('finished_at')->nullable()->index();
            $table->timestamps();

            $table->index(['connection', 'queue', 'status']);
            $table->index(['created_at', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('queue_monitor_jobs');
    }
};

