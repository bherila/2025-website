<?php

namespace Database\Factories\ClientManagement;

use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\ClientManagement\ClientTimeEntry>
 */
class ClientTimeEntryFactory extends Factory
{
    protected $model = ClientTimeEntry::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'project_id' => ClientProject::factory(),
            'client_company_id' => function (array $attributes) {
                return ClientProject::find($attributes['project_id'])->client_company_id;
            },
            'task_id' => null,
            'name' => fake()->sentence(),
            'minutes_worked' => fake()->randomElement([15, 30, 45, 60, 90, 120, 180, 240]),
            'date_worked' => fake()->dateTimeBetween('-1 month', 'now')->format('Y-m-d'),
            'user_id' => User::factory(),
            'creator_user_id' => function (array $attributes) {
                return $attributes['user_id'];
            },
            'is_billable' => true,
            'job_type' => fake()->randomElement([
                'Software Development', 
                'Project Management', 
                'Support', 
                'Meeting', 
                'Other'
            ]),
            'client_invoice_line_id' => null,
        ];
    }
}
