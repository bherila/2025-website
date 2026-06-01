<?php

namespace Database\Factories;

use App\Models\InboundEmail;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<InboundEmail>
 */
class InboundEmailFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $subject = $this->faker->sentence();

        return [
            'message_id' => '<'.$this->faker->uuid().'@app.bherila.net>',
            'from_email' => $this->faker->safeEmail(),
            'from_name' => $this->faker->name(),
            'to_email' => 'inbound@app.bherila.net',
            'subject' => $subject,
            'text_body' => $this->faker->paragraph(),
            'html_body' => '<p>'.$this->faker->paragraph().'</p>',
            'headers' => ['Subject' => $subject],
            'attachments' => [],
            'raw_payload' => ['items' => []],
            'status' => 'received',
            'received_at' => now(),
        ];
    }
}
