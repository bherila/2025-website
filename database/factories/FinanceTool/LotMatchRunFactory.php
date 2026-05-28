<?php

namespace Database\Factories\FinanceTool;

use App\Models\FinanceTool\FinDocument;
use App\Models\FinanceTool\LotMatchRun;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<LotMatchRun>
 */
class LotMatchRunFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $user = User::factory()->create();
        $document = FinDocument::create([
            'user_id' => $user->id,
            'document_kind' => FinDocument::KIND_TAX_FORM,
            'tax_year' => 2025,
            'original_filename' => 'broker-1099.pdf',
            'stored_filename' => fake()->uuid().'.pdf',
            's3_path' => "fin_documents/{$user->id}/tax_form/broker-1099.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $user->id,
            'is_reviewed' => true,
        ]);

        return [
            'document_id' => $document->id,
            'user_id' => $user->id,
            'status' => LotMatchRun::STATUS_SUCCEEDED,
            'mode' => LotMatchRun::MODE_PRESERVE,
            'started_at' => now()->subMinute(),
            'finished_at' => now(),
            'result_summary' => [
                'counts' => [],
                'linkIdsCount' => 0,
                'proposalCount' => 0,
            ],
            'error' => null,
        ];
    }
}
