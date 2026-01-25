<?php

namespace Database\Factories\ClientManagement;

use App\Models\ClientManagement\ClientCompany;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\ClientManagement\ClientCompany>
 */
class ClientCompanyFactory extends Factory
{
    protected $model = ClientCompany::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = fake()->company();
        return [
            'company_name' => $name,
            'slug' => Str::slug($name),
            'address' => fake()->address(),
            'website' => fake()->url(),
            'phone_number' => fake()->phoneNumber(),
            'default_hourly_rate' => fake()->randomElement([100, 125, 150, 175, 200, 250]),
            'additional_notes' => fake()->paragraph(),
            'is_active' => true,
        ];
    }
}
