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
        Schema::create('inbound_emails', function (Blueprint $table) {
            $table->id();
            $table->char('idempotency_key', 64)->nullable()->unique();
            $table->text('message_id')->nullable();
            $table->text('from_email');
            $table->text('from_name')->nullable();
            $table->text('to_email')->nullable();
            $table->text('subject')->nullable();
            $table->longText('text_body')->nullable();
            $table->longText('html_body')->nullable();
            $table->json('headers')->nullable();
            $table->json('attachments')->nullable();
            $table->json('raw_payload');
            $table->string('status')->default('received')->index();
            $table->timestamp('received_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('inbound_emails');
    }
};
