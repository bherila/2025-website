<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('fin_account_lots', function (Blueprint $table) {
            $table->bigIncrements('lot_id');
            $table->unsignedBigInteger('acct_id');
            $table->string('symbol', 50);
            $table->string('description', 255)->nullable();
            $table->decimal('quantity', 18, 8);
            $table->date('purchase_date');
            $table->decimal('cost_basis', 18, 4);
            $table->decimal('cost_per_unit', 18, 8)->nullable();
            $table->date('sale_date')->nullable()->comment('NULL = open lot');
            $table->decimal('proceeds', 18, 4)->nullable();
            $table->decimal('realized_gain_loss', 18, 4)->nullable();
            $table->boolean('is_short_term')->nullable()->comment('sale_date - purchase_date <= 1 year');
            $table->string('lot_source', 50)->nullable()->comment('import, manual, etc.');
            $table->unsignedBigInteger('statement_id')->nullable()->comment('Statement this lot was imported from');
            $table->timestamps();

            $table->foreign('acct_id')->references('acct_id')->on('fin_accounts')->onDelete('cascade');
            $table->foreign('statement_id')->references('statement_id')->on('fin_statements')->onDelete('set null');
            $table->index('acct_id');
            $table->index('symbol');
            $table->index('sale_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fin_account_lots');
    }
};
