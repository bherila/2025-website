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
        Schema::create('client_company_payment_methods', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_company_id')
                ->constrained('client_companies')
                ->cascadeOnDelete();
            $table->string('stripe_payment_method_id')->unique();
            $table->string('type', 32);
            $table->string('brand')->nullable();
            $table->string('last4', 4)->nullable();
            $table->unsignedSmallInteger('exp_month')->nullable();
            $table->unsignedSmallInteger('exp_year')->nullable();
            $table->string('bank_name')->nullable();
            $table->boolean('is_default')->default(false);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['client_company_id', 'type']);
            $table->index(['client_company_id', 'is_default']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('client_company_payment_methods');
    }
};
