<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('queue_monitor_metrics', function (Blueprint $table) {
            $table->id();
            $table->string('connection')->index();
            $table->string('queue')->index();
            $table->string('period_type')->index(); // hourly, daily
            $table->timestamp('period')->index();
            $table->integer('total_jobs')->default(0);
            $table->integer('processed')->default(0);
            $table->integer('failed')->default(0);
            $table->decimal('avg_runtime', 10, 2)->nullable();
            $table->integer('max_runtime')->nullable();
            $table->integer('min_runtime')->nullable();
            $table->timestamps();

            $table->unique(['connection', 'queue', 'period', 'period_type'], 'queue_metrics_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('queue_monitor_metrics');
    }
};
