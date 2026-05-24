<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('fin_tax_document_form1116_overrides')) {
            return;
        }

        Schema::create('fin_tax_document_form1116_overrides', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedBigInteger('document_id');
            $table->string('payer_tin', 20)->nullable();
            $table->string('account_identifier', 64)->nullable();
            $table->decimal('gross_foreign_source_income', 18, 4);
            $table->text('override_reason')->nullable();
            $table->timestamps();

            $table->foreign('document_id', 'fin_1116_overrides_doc_fk')
                ->references('id')
                ->on('fin_documents')
                ->cascadeOnDelete();

            $table->index('user_id', 'fin_1116_overrides_user_idx');
            $table->index(['document_id', 'payer_tin'], 'fin_1116_overrides_doc_tin_idx');

            $table->unique(
                ['document_id', 'payer_tin', 'account_identifier'],
                'fin_1116_overrides_doc_tin_acct_unique',
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fin_tax_document_form1116_overrides');
    }
};
