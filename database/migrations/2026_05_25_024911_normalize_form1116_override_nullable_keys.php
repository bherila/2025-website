<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('fin_tax_document_form1116_overrides')) {
            return;
        }

        DB::table('fin_tax_document_form1116_overrides')
            ->whereNull('payer_tin')
            ->update(['payer_tin' => '']);

        DB::table('fin_tax_document_form1116_overrides')
            ->whereNull('account_identifier')
            ->update(['account_identifier' => '']);

        $this->deleteDuplicateOverrides();

        Schema::table('fin_tax_document_form1116_overrides', function (Blueprint $table): void {
            $table->dropUnique('fin_1116_overrides_doc_tin_acct_unique');
        });

        Schema::table('fin_tax_document_form1116_overrides', function (Blueprint $table): void {
            $table->string('payer_tin', 20)->default('')->nullable(false)->change();
            $table->string('account_identifier', 64)->default('')->nullable(false)->change();
            $table->unique(
                ['document_id', 'payer_tin', 'account_identifier'],
                'fin_1116_doc_tin_acct_unique',
            );
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('fin_tax_document_form1116_overrides')) {
            return;
        }

        Schema::table('fin_tax_document_form1116_overrides', function (Blueprint $table): void {
            $table->dropUnique('fin_1116_doc_tin_acct_unique');
        });

        Schema::table('fin_tax_document_form1116_overrides', function (Blueprint $table): void {
            $table->string('payer_tin', 20)->nullable()->default(null)->change();
            $table->string('account_identifier', 64)->nullable()->default(null)->change();
            $table->unique(
                ['document_id', 'payer_tin', 'account_identifier'],
                'fin_1116_overrides_doc_tin_acct_unique',
            );
        });

        DB::table('fin_tax_document_form1116_overrides')
            ->where('payer_tin', '')
            ->update(['payer_tin' => null]);

        DB::table('fin_tax_document_form1116_overrides')
            ->where('account_identifier', '')
            ->update(['account_identifier' => null]);
    }

    private function deleteDuplicateOverrides(): void
    {
        $seen = [];
        $duplicateIds = [];

        DB::table('fin_tax_document_form1116_overrides')
            ->select(['id', 'document_id', 'payer_tin', 'account_identifier'])
            ->orderByDesc('id')
            ->get()
            ->each(function (object $row) use (&$seen, &$duplicateIds): void {
                $key = implode('|', [
                    (string) $row->document_id,
                    (string) $row->payer_tin,
                    (string) $row->account_identifier,
                ]);

                if (isset($seen[$key])) {
                    $duplicateIds[] = (int) $row->id;

                    return;
                }

                $seen[$key] = true;
            });

        if ($duplicateIds !== []) {
            DB::table('fin_tax_document_form1116_overrides')
                ->whereIn('id', $duplicateIds)
                ->delete();
        }
    }
};
