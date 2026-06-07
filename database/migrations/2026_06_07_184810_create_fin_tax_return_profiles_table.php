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
        Schema::create('fin_tax_return_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained(table: 'users', indexName: 'ftrp_user_fk')->cascadeOnDelete();
            $table->unsignedSmallInteger('tax_year');
            $table->string('filing_status', 40)->nullable();
            $table->string('taxpayer_first_name')->nullable();
            $table->string('taxpayer_middle_initial', 10)->nullable();
            $table->string('taxpayer_last_name')->nullable();
            $table->text('taxpayer_ssn')->nullable();
            $table->string('spouse_first_name')->nullable();
            $table->string('spouse_middle_initial', 10)->nullable();
            $table->string('spouse_last_name')->nullable();
            $table->text('spouse_ssn')->nullable();
            $table->string('address_line1')->nullable();
            $table->string('address_line2')->nullable();
            $table->string('city')->nullable();
            $table->string('state', 32)->nullable();
            $table->string('postal_code', 20)->nullable();
            $table->string('country', 80)->nullable();
            $table->string('digital_assets_answer', 8)->nullable();
            $table->string('taxpayer_occupation')->nullable();
            $table->string('spouse_occupation')->nullable();
            $table->string('phone', 40)->nullable();
            $table->string('email')->nullable();
            $table->text('ip_pin')->nullable();
            $table->text('spouse_ip_pin')->nullable();
            $table->text('direct_deposit_routing')->nullable();
            $table->text('direct_deposit_account')->nullable();
            $table->string('direct_deposit_account_type', 20)->nullable();
            $table->json('dependents_json')->nullable();
            $table->json('third_party_designee_json')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'tax_year'], 'ftrp_user_year_unique');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fin_tax_return_profiles');
    }
};
