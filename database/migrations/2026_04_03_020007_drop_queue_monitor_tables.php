<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::dropIfExists('queue_monitor_metrics');
        Schema::dropIfExists('queue_monitor_controls');
        Schema::dropIfExists('queue_monitor_jobs');
    }

    /**
     * Reverse the migrations.
     * Intentionally empty — the willypelz/queue-monitor package has been removed
     * and its tables should not be recreated on rollback.
     */
    public function down(): void
    {
        //
    }
};
