<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('queue_monitor_controls', function (Blueprint $table) {
            $table->id();
            $table->string('connection')->index();
            $table->string('queue')->index();
            $table->string('type')->index(); // pause, throttle, scale
            $table->json('data')->nullable();
            $table->timestamps();

            $table->unique(['connection', 'queue', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('queue_monitor_controls');
    }
};

