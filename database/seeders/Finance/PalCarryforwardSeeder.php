<?php

namespace Database\Seeders\Finance;

use App\Models\FinanceTool\PalCarryforward;
use Illuminate\Database\Seeder;

class PalCarryforwardSeeder extends Seeder
{
    public function run(): void
    {
        PalCarryforward::factory()->count(3)->create();
    }
}
