<?php

namespace Database\Seeders\Finance;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class FinanceAccountsSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::query()->where('email', 'test@example.com')->first();

        if (! $user) {
            return;
        }

        $now = now();

        DB::table('fin_accounts')->updateOrInsert(
            ['acct_owner' => $user->id, 'acct_name' => 'Demo Checking'],
            [
                'acct_number' => '1000001111',
                'acct_last_balance' => 8320.15,
                'acct_last_balance_date' => '2026-03-01',
                'acct_is_debt' => 0,
                'acct_is_retirement' => 0,
                'acct_sort_order' => 1,
                'when_deleted' => null,
                'when_closed' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );

        DB::table('fin_accounts')->updateOrInsert(
            ['acct_owner' => $user->id, 'acct_name' => 'Demo Savings'],
            [
                'acct_number' => '1000002222',
                'acct_last_balance' => 25400.00,
                'acct_last_balance_date' => '2026-03-01',
                'acct_is_debt' => 0,
                'acct_is_retirement' => 0,
                'acct_sort_order' => 2,
                'when_deleted' => null,
                'when_closed' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );

        DB::table('fin_accounts')->updateOrInsert(
            ['acct_owner' => $user->id, 'acct_name' => 'Demo Brokerage'],
            [
                'acct_number' => '1000003333',
                'acct_last_balance' => 120450.00,
                'acct_last_balance_date' => '2026-03-01',
                'acct_is_debt' => 0,
                'acct_is_retirement' => 0,
                'acct_sort_order' => 3,
                'when_deleted' => null,
                'when_closed' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );
    }
}
