<?php

namespace Database\Seeders\Finance;

use Illuminate\Database\Seeder;

class FinanceDemoDataSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            FinanceAccountsSeeder::class,
            FinanceEmploymentEntitiesSeeder::class,
            FinanceTagsSeeder::class,
            FinanceTransactionsSeeder::class,
            FinanceTagMappingsSeeder::class,
            FinanceTaxDocumentsSeeder::class,
        ]);
    }
}
