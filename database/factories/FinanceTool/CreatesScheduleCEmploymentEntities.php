<?php

namespace Database\Factories\FinanceTool;

use Illuminate\Support\Facades\DB;

trait CreatesScheduleCEmploymentEntities
{
    protected function scheduleCEntityIdForUser(int $userId): int
    {
        return (int) DB::table('fin_employment_entity')->insertGetId([
            'user_id' => $userId,
            'display_name' => fake()->company(),
            'start_date' => '2024-01-01',
            'is_current' => true,
            'type' => 'sch_c',
            'is_spouse' => false,
            'is_hidden' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
