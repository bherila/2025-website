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
        Schema::create('client_agreements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_company_id')->constrained('client_companies')->onDelete('cascade');

            // Dates
            $table->dateTime('active_date')->useCurrent();
            $table->dateTime('termination_date')->nullable();

            // Agreement details
            $table->text('agreement_text')->nullable();
            $table->string('agreement_link', 4096)->nullable();

            // Client signature
            $table->dateTime('client_company_signed_date')->nullable();
            $table->foreignId('client_company_signed_user_id')->nullable()->constrained('users')->onDelete('restrict');
            $table->string('client_company_signed_name')->nullable();
            $table->string('client_company_signed_title')->nullable();

            // Retainer terms
            $table->decimal('monthly_retainer_hours', 8, 2)->default(0); // Hours included in retainer
            $table->integer('rollover_months')->default(1); // How many months hours can roll over
            $table->decimal('hourly_rate', 10, 2)->default(0);
            $table->decimal('monthly_retainer_fee', 10, 2)->default(0);

            // Visibility
            $table->boolean('is_visible_to_client')->default(false);

            $table->timestamps();
            $table->softDeletes();

            $table->index('client_company_id');
            $table->index('active_date');
            $table->index('termination_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('client_agreements');
    }
};
