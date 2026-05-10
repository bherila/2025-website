<?php

namespace Database\Seeders\Finance;

use App\Models\FinanceTool\FinLotReconciliationLink;
use Illuminate\Database\Seeder;

class FinLotReconciliationLinkSeeder extends Seeder
{
    /**
     * Seed one synthetic reconciliation link for test and local fixture use.
     */
    public function run(): void
    {
        FinLotReconciliationLink::factory()->create();
    }
}
