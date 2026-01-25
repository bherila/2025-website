<?php

namespace Database\Factories\ClientManagement;

use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientProject;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\ClientManagement\ClientProject>
 */
class ClientProjectFactory extends Factory
{
    protected $model = ClientProject::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = fake()->words(3, true);
        return [
            'client_company_id' => ClientCompany::factory(),
            'name' => ucfirst($name),
            'slug' => ClientProject::generateSlug($name),
            'description' => fake()->sentence(),
            'creator_user_id' => User::factory(),
        ];
    }
}
