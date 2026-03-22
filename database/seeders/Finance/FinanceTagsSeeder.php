<?php

namespace Database\Seeders\Finance;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class FinanceTagsSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::query()->where('email', 'test@example.com')->first();

        if (! $user) {
            return;
        }

        $scheduleCEntityId = (int) DB::table('fin_employment_entity')
            ->where('user_id', $user->id)
            ->where('display_name', 'Blue Harbor Consulting')
            ->where('type', 'sch_c')
            ->value('id');

        DB::table('fin_account_tag')->updateOrInsert(
            ['tag_userid' => $user->id, 'tag_label' => 'Sched C Office Expense'],
            [
                'tag_color' => 'blue',
                'tax_characteristic' => 'sce_office_expenses',
                'employment_entity_id' => $scheduleCEntityId > 0 ? $scheduleCEntityId : null,
                'when_deleted' => null,
            ],
        );

        DB::table('fin_account_tag')->updateOrInsert(
            ['tag_userid' => $user->id, 'tag_label' => 'Household'],
            [
                'tag_color' => 'green',
                'tax_characteristic' => null,
                'employment_entity_id' => null,
                'when_deleted' => null,
            ],
        );
    }
}
