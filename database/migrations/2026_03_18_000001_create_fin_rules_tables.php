<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fin_rules', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('user_id');
            $table->integer('order');
            $table->string('title');
            $table->boolean('is_disabled')->default(false);
            $table->boolean('stop_processing_if_match')->default(false);
            $table->timestamps();
            $table->softDeletes();
            $table->index('user_id');
            $table->foreign('user_id')->references('id')->on('users');
        });

        Schema::create('fin_rule_conditions', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('rule_id');
            $table->string('type');
            $table->string('operator');
            $table->string('value')->nullable();
            $table->string('value_extra')->nullable();
            $table->timestamps();
            $table->index('rule_id');
            $table->foreign('rule_id')->references('id')->on('fin_rules')->cascadeOnDelete();
        });

        Schema::create('fin_rule_actions', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('rule_id');
            $table->string('type');
            $table->string('target')->nullable();
            $table->string('payload')->nullable();
            $table->integer('order');
            $table->timestamps();
            $table->index('rule_id');
            $table->foreign('rule_id')->references('id')->on('fin_rules')->cascadeOnDelete();
        });

        Schema::create('fin_rule_logs', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('user_id')->index();
            $table->unsignedBigInteger('rule_id')->index();
            $table->unsignedBigInteger('transaction_id')->index();
            $table->boolean('is_manual_run')->default(false);
            $table->string('action_summary')->nullable();
            $table->text('error')->nullable();
            $table->text('error_details')->nullable();
            $table->integer('processing_time_mtime')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fin_rule_logs');
        Schema::dropIfExists('fin_rule_actions');
        Schema::dropIfExists('fin_rule_conditions');
        Schema::dropIfExists('fin_rules');
    }
};
