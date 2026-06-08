<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fin_accounts', function (Blueprint $table): void {
            if (! Schema::hasColumn('fin_accounts', 'acct_capital_commitment')) {
                $table->decimal('acct_capital_commitment', 18, 4)->nullable()->after('expected_fee_notes');
            }
            if (! Schema::hasColumn('fin_accounts', 'acct_capital_commitment_currency')) {
                $table->string('acct_capital_commitment_currency', 3)->nullable()->default('USD')->after('acct_capital_commitment');
            }
            if (! Schema::hasColumn('fin_accounts', 'acct_capital_commitment_date')) {
                $table->date('acct_capital_commitment_date')->nullable()->after('acct_capital_commitment_currency');
            }
            if (! Schema::hasColumn('fin_accounts', 'acct_capital_commitment_notes')) {
                $table->text('acct_capital_commitment_notes')->nullable()->after('acct_capital_commitment_date');
            }
        });

        Schema::table('fin_documents', function (Blueprint $table): void {
            if (! Schema::hasColumn('fin_documents', 'document_type')) {
                $table->string('document_type', 64)->nullable()->after('document_kind');
            }
            if (! Schema::hasColumn('fin_documents', 'document_date')) {
                $table->date('document_date')->nullable()->after('document_type');
            }
        });

        if (! Schema::hasIndex('fin_documents', 'fin_docs_user_type_date_idx')) {
            Schema::table('fin_documents', function (Blueprint $table): void {
                $table->index(['user_id', 'document_type', 'document_date'], 'fin_docs_user_type_date_idx');
            });
        }

        if (Schema::hasColumn('fin_statements', 'balance')) {
            if (DB::connection()->getDriverName() === 'mysql') {
                DB::statement('ALTER TABLE fin_statements MODIFY balance VARCHAR(20) NULL');
            } else {
                Schema::table('fin_statements', function (Blueprint $table): void {
                    $table->string('balance', 20)->nullable()->change();
                });
            }
        }

        if (! Schema::hasTable('fin_statement_investments')) {
            Schema::create('fin_statement_investments', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('user_id');
                $table->unsignedBigInteger('account_id');
                $table->unsignedBigInteger('statement_id')->nullable();
                $table->unsignedBigInteger('document_id')->nullable();
                $table->date('as_of_date')->nullable();
                $table->string('investment_name');
                $table->string('investment_category')->nullable();
                $table->decimal('quantity', 24, 8)->nullable();
                $table->decimal('ownership_percentage', 12, 8)->nullable();
                $table->decimal('cost_basis', 18, 4)->nullable();
                $table->decimal('fair_value', 18, 4)->nullable();
                $table->decimal('unrealized_gain_loss', 18, 4)->nullable();
                $table->string('currency', 3)->default('USD');
                $table->string('source_line')->nullable();
                $table->json('raw_payload')->nullable();
                $table->timestamps();

                $table->foreign('user_id', 'fin_stmt_inv_user_fk')->references('id')->on('users')->cascadeOnDelete();
                $table->foreign('account_id', 'fin_stmt_inv_account_fk')->references('acct_id')->on('fin_accounts')->cascadeOnDelete();
                $table->foreign('statement_id', 'fin_stmt_inv_statement_fk')->references('statement_id')->on('fin_statements')->nullOnDelete();
                $table->foreign('document_id', 'fin_stmt_inv_document_fk')->references('id')->on('fin_documents')->nullOnDelete();
                $table->index(['account_id', 'as_of_date'], 'fin_stmt_inv_account_date_idx');
                $table->index(['statement_id', 'investment_name'], 'fin_stmt_inv_statement_name_idx');
                $table->index('document_id', 'fin_stmt_inv_document_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('fin_statement_investments');

        if (Schema::hasColumn('fin_statements', 'balance')) {
            DB::table('fin_statements')->whereNull('balance')->update(['balance' => '0']);
            if (DB::connection()->getDriverName() === 'mysql') {
                DB::statement("ALTER TABLE fin_statements MODIFY balance VARCHAR(20) NOT NULL DEFAULT '0'");
            } else {
                Schema::table('fin_statements', function (Blueprint $table): void {
                    $table->string('balance', 20)->nullable(false)->default('0')->change();
                });
            }
        }

        if (Schema::hasTable('fin_documents')) {
            Schema::table('fin_documents', function (Blueprint $table): void {
                if (Schema::hasIndex('fin_documents', 'fin_docs_user_type_date_idx')) {
                    $table->dropIndex('fin_docs_user_type_date_idx');
                }
            });
        }

        foreach (['document_type', 'document_date'] as $column) {
            if (Schema::hasColumn('fin_documents', $column)) {
                Schema::table('fin_documents', function (Blueprint $table) use ($column): void {
                    $table->dropColumn($column);
                });
            }
        }

        if (Schema::hasTable('fin_accounts')) {
            Schema::table('fin_accounts', function (Blueprint $table): void {
                $columns = array_values(array_filter([
                    Schema::hasColumn('fin_accounts', 'acct_capital_commitment') ? 'acct_capital_commitment' : null,
                    Schema::hasColumn('fin_accounts', 'acct_capital_commitment_currency') ? 'acct_capital_commitment_currency' : null,
                    Schema::hasColumn('fin_accounts', 'acct_capital_commitment_date') ? 'acct_capital_commitment_date' : null,
                    Schema::hasColumn('fin_accounts', 'acct_capital_commitment_notes') ? 'acct_capital_commitment_notes' : null,
                ]));

                if ($columns !== []) {
                    $table->dropColumn($columns);
                }
            });
        }
    }
};
