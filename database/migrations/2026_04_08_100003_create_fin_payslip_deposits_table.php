<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Step 1c — Create fin_payslip_deposits child table.
 *
 * Stores bank deposit splits for a payslip. SUM(amount) should equal
 * earnings_net_pay. UI provides an inline CRUD sub-component.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fin_payslip_deposits', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('payslip_id');
            $table->string('bank_name', 100);
            $table->string('account_last4', 4)->nullable();
            $table->decimal('amount', 12, 4);
            $table->timestamps();

            $table->foreign('payslip_id')
                ->references('payslip_id')
                ->on('fin_payslip')
                ->onDelete('cascade');

            $table->index('payslip_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fin_payslip_deposits');
    }
};
