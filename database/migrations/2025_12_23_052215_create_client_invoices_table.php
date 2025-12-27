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
        Schema::create('client_invoices', function (Blueprint $table) {
            $table->id('client_invoice_id');
            $table->foreignId('client_company_id')->constrained('client_companies')->onDelete('cascade');
            $table->foreignId('client_agreement_id')->nullable()->constrained('client_agreements')->onDelete('set null');

            // Invoice period
            $table->date('period_start')->nullable();
            $table->date('period_end')->nullable();

            // Invoice details
            $table->string('invoice_number')->nullable();
            $table->decimal('invoice_total', 10, 2)->default(0);
            $table->dateTime('issue_date')->nullable();
            $table->dateTime('due_date')->nullable();
            $table->dateTime('paid_date')->nullable();

            // Hours tracking for rollover calculation
            $table->decimal('retainer_hours_included', 10, 4)->default(0);
            $table->decimal('hours_worked', 10, 4)->default(0);
            $table->decimal('rollover_hours_used', 10, 4)->default(0);
            $table->decimal('unused_hours_balance', 10, 4)->default(0);
            $table->decimal('negative_hours_balance', 10, 4)->default(0);
            $table->decimal('hours_billed_at_rate', 10, 4)->default(0);

            // Status
            $table->enum('status', ['draft', 'issued', 'paid', 'void'])->default('draft');
            $table->text('notes')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->index('client_company_id');
            $table->index('client_agreement_id');
            $table->index('issue_date');
            $table->index('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('client_invoices');
    }
};
