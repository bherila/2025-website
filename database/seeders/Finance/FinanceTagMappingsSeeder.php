<?php

namespace Database\Seeders\Finance;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class FinanceTagMappingsSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::query()->where('email', 'test@example.com')->first();

        if (! $user) {
            return;
        }

        $scheduleCTagId = (int) DB::table('fin_account_tag')
            ->where('tag_userid', $user->id)
            ->where('tag_label', 'Sched C Office Expense')
            ->value('tag_id');

        $genericTagId = (int) DB::table('fin_account_tag')
            ->where('tag_userid', $user->id)
            ->where('tag_label', 'Household')
            ->value('tag_id');

        if ($scheduleCTagId === 0 || $genericTagId === 0) {
            return;
        }

        $scheduleCBusinessExpenseId = (int) DB::table('fin_account_line_items')
            ->where('t_description', 'OFFICE DEPOT - MONITORS AND CABLES')
            ->where('t_amt', -238.77)
            ->value('t_id');

        $groceryExpenseId = (int) DB::table('fin_account_line_items')
            ->where('t_description', 'SAFEWAY #1234')
            ->where('t_amt', -142.51)
            ->value('t_id');

        $rentExpenseId = (int) DB::table('fin_account_line_items')
            ->where('t_description', 'ACH PAYMENT - MONTHLY RENT')
            ->where('t_amt', -2450.00)
            ->value('t_id');

        foreach ([$scheduleCBusinessExpenseId] as $tId) {
            if ($tId > 0) {
                DB::table('fin_account_line_item_tag_map')->updateOrInsert(
                    ['t_id' => $tId, 'tag_id' => $scheduleCTagId],
                    ['when_deleted' => null],
                );
            }
        }

        foreach ([$groceryExpenseId, $rentExpenseId] as $tId) {
            if ($tId > 0) {
                DB::table('fin_account_line_item_tag_map')->updateOrInsert(
                    ['t_id' => $tId, 'tag_id' => $genericTagId],
                    ['when_deleted' => null],
                );
            }
        }
    }
}
