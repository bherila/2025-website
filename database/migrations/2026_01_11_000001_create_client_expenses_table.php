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
        Schema::create('client_expenses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_company_id')->constrained('client_companies')->onDelete('cascade');
            $table->foreignId('project_id')->nullable()->constrained('client_projects')->onDelete('set null');
            $table->unsignedBigInteger('fin_line_item_id')->nullable();
            $table->string('description');
            $table->decimal('amount', 12, 2);
            $table->date('expense_date');
            $table->boolean('is_reimbursable')->default(false);
            $table->boolean('is_reimbursed')->default(false);
            $table->date('reimbursed_date')->nullable();
            $table->string('category')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('creator_user_id')->nullable()->constrained('users')->onDelete('set null');
            $table->foreignId('client_invoice_line_id')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('client_company_id');
            $table->index('project_id');
            $table->index('fin_line_item_id');
            $table->index('expense_date');
            $table->index('is_reimbursable');

            // Foreign key for fin_account_line_items (uses t_id as primary key)
            $table->foreign('fin_line_item_id')
                ->references('t_id')
                ->on('fin_account_line_items')
                ->onDelete('set null');

            // Foreign key for client_invoice_lines
            $table->foreign('client_invoice_line_id')
                ->references('client_invoice_line_id')
                ->on('client_invoice_lines')
                ->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('client_expenses');
    }
};
