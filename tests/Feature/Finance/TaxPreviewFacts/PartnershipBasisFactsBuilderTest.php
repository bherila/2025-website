<?php

namespace Tests\Feature\Finance\TaxPreviewFacts;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\User;
use App\Services\Finance\PartnershipBasisService;
use App\Services\Finance\TaxPreviewFacts\Builders\PartnershipBasisFactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Data\PartnershipBasisFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PartnershipBasisFactsBuilderTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private FinAccounts $account;

    private PartnershipBasisService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->actingAs($this->user);
        $this->account = FinAccounts::create(['acct_name' => 'Partnership Account']);
        $this->service = app(PartnershipBasisService::class);
    }

    public function test_section754_step_up_surfaces_separately_from_other_box13_deductions(): void
    {
        $this->k1Document(2024, 'Section754 Facts LP', '47-1234567', [
            'A' => ['value' => '47-1234567'],
            'B' => ['value' => 'Section754 Facts LP'],
            'D' => ['value' => 'false'],
            '5' => ['value' => '100'],
        ], [
            '13' => [
                ['code' => 'W', 'value' => '15'],
                ['code' => 'A', 'value' => '10'],
            ],
        ]);
        $this->service->recomputeForUserYear($this->user->id, 2024);

        $facts = $this->build(2024);

        $this->assertCount(1, $facts->section754StepUpSources);
        $stepUp = $facts->section754StepUpSources[0];
        $this->assertSame(TaxFactSourceType::PartnershipSection754StepUp->value, $stepUp->sourceType);
        $this->assertSame(15.0, $stepUp->amount);
        $this->assertSame('13', $stepUp->box);
        $this->assertSame('W', $stepUp->code);
        $this->assertNotNull($stepUp->taxDocumentId);
        $this->assertSame('needs_review', $stepUp->reviewStatus);

        // The §754 step-up amortization is NOT lumped with the other Box 13 code-L deductions.
        $stepUpEvents = collect($facts->interests[0]->events)
            ->filter(fn ($event): bool => $event->eventType === 'section754_stepup_amortization');
        $this->assertCount(1, $stepUpEvents);
        $this->assertSame(15.0, $stepUpEvents->first()->amount);
    }

    private function build(int $year): PartnershipBasisFacts
    {
        $docs = FileForTaxDocument::query()
            ->where('user_id', $this->user->id)
            ->where('tax_year', $year)
            ->where('form_type', 'k1')
            ->get();

        return app(PartnershipBasisFactsBuilder::class)->build($this->user->id, $year, $docs);
    }

    /**
     * @param  array<string, array<string, mixed>>  $fields
     * @param  array<string, array<int, array<string, string>>>  $codes
     */
    private function k1Document(int $year, string $name, string $ein, array $fields, array $codes): FileForTaxDocument
    {
        $slug = str_replace(' ', '-', strtolower($name));

        return FileForTaxDocument::create([
            'user_id' => $this->user->id,
            'tax_year' => $year,
            'form_type' => 'k1',
            'account_id' => $this->account->acct_id,
            'original_filename' => "{$slug}.pdf",
            'stored_filename' => "{$slug}.pdf",
            'file_size_bytes' => 1,
            'file_hash' => sha1($slug.$ein),
            'is_reviewed' => true,
            'parsed_data' => [
                'schemaVersion' => '2026.1',
                'formType' => 'K-1-1065',
                'fields' => $fields,
                'codes' => $codes,
                'basis' => [],
            ],
        ]);
    }
}
