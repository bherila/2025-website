<?php

namespace Tests\Feature\Finance;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class Form1116OverrideMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_normalize_nullable_keys_deduplicates_before_backfilling_empty_strings(): void
    {
        $this->createLegacyOverridesTable();

        DB::table('fin_tax_document_form1116_overrides')->insert([
            $this->overrideRow(123, null, null, 100),
            $this->overrideRow(123, '', null, 200),
            $this->overrideRow(123, null, '', 300),
            $this->overrideRow(123, '12-3456789', null, 400),
            $this->overrideRow(123, '12-3456789', '', 500),
        ]);

        $migration = require database_path('migrations/2026_05_25_024911_normalize_form1116_override_nullable_keys.php');
        $migration->up();

        $rows = DB::table('fin_tax_document_form1116_overrides')
            ->where('document_id', 123)
            ->orderBy('payer_tin')
            ->get(['payer_tin', 'account_identifier', 'gross_foreign_source_income']);

        $this->assertCount(2, $rows);
        $this->assertSame('', $rows[0]->payer_tin);
        $this->assertSame('', $rows[0]->account_identifier);
        $this->assertSame(300.0, (float) $rows[0]->gross_foreign_source_income);
        $this->assertSame('12-3456789', $rows[1]->payer_tin);
        $this->assertSame('', $rows[1]->account_identifier);
        $this->assertSame(500.0, (float) $rows[1]->gross_foreign_source_income);
    }

    public function test_normalize_nullable_keys_preserves_distinct_rows_with_delimiters(): void
    {
        $this->createLegacyOverridesTable();

        DB::table('fin_tax_document_form1116_overrides')->insert([
            $this->overrideRow(123, '12|34', '56', 100),
            $this->overrideRow(123, '12', '34|56', 200),
        ]);

        $migration = require database_path('migrations/2026_05_25_024911_normalize_form1116_override_nullable_keys.php');
        $migration->up();

        $rows = DB::table('fin_tax_document_form1116_overrides')
            ->where('document_id', 123)
            ->orderBy('gross_foreign_source_income')
            ->get(['payer_tin', 'account_identifier', 'gross_foreign_source_income']);

        $this->assertCount(2, $rows);
        $this->assertSame('12|34', $rows[0]->payer_tin);
        $this->assertSame('56', $rows[0]->account_identifier);
        $this->assertSame(100.0, (float) $rows[0]->gross_foreign_source_income);
        $this->assertSame('12', $rows[1]->payer_tin);
        $this->assertSame('34|56', $rows[1]->account_identifier);
        $this->assertSame(200.0, (float) $rows[1]->gross_foreign_source_income);
    }

    private function createLegacyOverridesTable(): void
    {
        Schema::dropIfExists('fin_tax_document_form1116_overrides');
        Schema::create('fin_tax_document_form1116_overrides', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('document_id');
            $table->string('payer_tin', 20)->nullable();
            $table->string('account_identifier', 64)->nullable();
            $table->decimal('gross_foreign_source_income', 18, 4);
            $table->text('override_reason')->nullable();
            $table->timestamps();
            $table->unique(
                ['document_id', 'payer_tin', 'account_identifier'],
                'fin_1116_overrides_doc_tin_acct_unique',
            );
        });
    }

    /**
     * @return array<string, mixed>
     */
    private function overrideRow(int $documentId, ?string $payerTin, ?string $accountIdentifier, float $income): array
    {
        return [
            'user_id' => 1,
            'document_id' => $documentId,
            'payer_tin' => $payerTin,
            'account_identifier' => $accountIdentifier,
            'gross_foreign_source_income' => $income,
            'override_reason' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }
}
