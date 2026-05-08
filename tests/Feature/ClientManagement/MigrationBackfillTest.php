<?php

namespace Tests\Feature\ClientManagement;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class MigrationBackfillTest extends TestCase
{
    public function test_billing_cadence_migration_backfills_existing_invoices_and_agreements(): void
    {
        $originalConnection = config('database.default');

        config()->set('database.connections.cadence_backfill_fixture', [
            'driver' => 'sqlite',
            'database' => ':memory:',
            'prefix' => '',
            'foreign_key_constraints' => true,
        ]);
        config()->set('database.default', 'cadence_backfill_fixture');

        try {
            $this->createPreCadenceTables();

            DB::table('client_agreements')->insert([
                'id' => 1,
                'is_visible_to_client' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('client_invoices')->insert([
                'client_invoice_id' => 1,
                'client_company_id' => 1,
                'period_start' => '2026-01-01',
                'period_end' => '2026-01-31',
                'notes' => null,
            ]);

            $migration = require database_path('migrations/2026_05_08_074313_add_billing_cadence_to_client_management_tables.php');
            $migration->up();

            $this->assertDatabaseHas('client_agreements', [
                'id' => 1,
                'billing_cadence' => 'monthly',
                'bill_overage_interim' => false,
                'first_cycle_proration' => 'prorate_hours',
            ]);
            $this->assertDatabaseHas('client_invoices', [
                'client_invoice_id' => 1,
                'invoice_kind' => 'cadence_period',
                'cycle_start' => '2026-01-01',
                'cycle_end' => '2026-01-31',
            ]);
        } finally {
            config()->set('database.default', $originalConnection);
            DB::purge('cadence_backfill_fixture');
        }
    }

    private function createPreCadenceTables(): void
    {
        Schema::create('client_agreements', function (Blueprint $table): void {
            $table->id();
            $table->boolean('is_visible_to_client')->default(false);
            $table->timestamps();
        });

        Schema::create('client_invoices', function (Blueprint $table): void {
            $table->id('client_invoice_id');
            $table->unsignedBigInteger('client_company_id');
            $table->date('period_start')->nullable();
            $table->date('period_end')->nullable();
            $table->text('notes')->nullable();
        });

        Schema::create('client_invoice_lines', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('sort_order')->default(0);
        });
    }
}
