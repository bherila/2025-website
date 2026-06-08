<?php

namespace Database\Factories\FinanceTool;

use App\Models\FinanceTool\FinTaxReturnPdfExport;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<FinTaxReturnPdfExport>
 */
class FinTaxReturnPdfExportFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'tax_year' => 2025,
            'scope' => 'form',
            'form_ids' => ['form-1040'],
            'mode' => 'editable',
            'status' => 'blocked',
            'filename' => '2025-form-1040.pdf',
            'error_summary' => [],
            'exported_at' => now(),
        ];
    }
}
