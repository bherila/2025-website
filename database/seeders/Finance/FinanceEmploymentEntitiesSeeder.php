<?php

namespace Database\Seeders\Finance;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class FinanceEmploymentEntitiesSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::query()->where('email', 'test@example.com')->first();

        if (! $user) {
            return;
        }

        $now = now();

        DB::table('fin_employment_entity')->updateOrInsert(
            ['user_id' => $user->id, 'display_name' => 'Acme Software LLC', 'type' => 'w2'],
            [
                'start_date' => '2022-01-03',
                'end_date' => null,
                'is_current' => 1,
                'ein' => '12-3456789',
                'address' => '123 Main St, San Francisco, CA',
                'sic_code' => 7372,
                'is_spouse' => 0,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );

        DB::table('fin_employment_entity')->updateOrInsert(
            ['user_id' => $user->id, 'display_name' => 'Blue Harbor Consulting', 'type' => 'sch_c'],
            [
                'start_date' => '2023-05-01',
                'end_date' => null,
                'is_current' => 1,
                'ein' => '98-7654321',
                'address' => '456 Market St, San Francisco, CA',
                'sic_code' => 8748,
                'is_spouse' => 0,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );
    }
}
