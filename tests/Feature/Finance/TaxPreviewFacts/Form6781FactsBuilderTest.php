<?php

namespace Tests\Feature\Finance\TaxPreviewFacts;

use App\Models\Files\FileForTaxDocument;
use App\Services\Finance\DocumentIngestionService;
use App\Services\Finance\TaxPreviewFacts\Builders\Form6781FactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Form6781FactsBuilderTest extends TestCase
{
    use RefreshDatabase;

    public function test_k1_box_11c_is_split_between_schedule_d_lines_4_and_11(): void
    {
        $user = $this->createUser();
        $document = $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'Section 1256 Fund'],
                codes: [
                    '11' => [
                        ['code' => 'C', 'value' => '32545', 'notes' => 'Section 1256 contracts'],
                    ],
                ],
            ),
        ]);

        $facts = app(Form6781FactsBuilder::class)->build([$document]);

        $this->assertSame(13018.0, $facts->shortTermTotal);
        $this->assertSame(19527.0, $facts->longTermTotal);
        $this->assertSame(32545.0, $facts->netGain);
        $this->assertCount(1, $facts->shortTermSources);
        $this->assertCount(1, $facts->longTermSources);

        $shortTermSource = $facts->shortTermSources[0];
        $this->assertSame("k1-{$document->id}-11C-0-schedule-d-line4", $shortTermSource->id);
        $this->assertSame('Section 1256 Fund — K-1 Box 11C Form 6781 40% S/T allocation', $shortTermSource->label);
        $this->assertSame(13018.0, $shortTermSource->amount);
        $this->assertSame(TaxFactSourceType::K1Section1256ShortTerm->value, $shortTermSource->sourceType);
        $this->assertSame(TaxFactRouting::ScheduleDLine4->value, $shortTermSource->routing);
        $this->assertSame('Section 1256 contracts are split 40% short-term and 60% long-term through Form 6781; the short-term portion flows to Schedule D line 4.', $shortTermSource->routingReason);
        $this->assertSame('Section 1256 contracts', $shortTermSource->notes);
        $this->assertSame($document->id, $shortTermSource->taxDocumentId);
        $this->assertSame('11', $shortTermSource->box);
        $this->assertSame('C', $shortTermSource->code);
        $this->assertTrue($shortTermSource->isReviewed);

        $longTermSource = $facts->longTermSources[0];
        $this->assertSame("k1-{$document->id}-11C-0-schedule-d-line11", $longTermSource->id);
        $this->assertSame('Section 1256 Fund — K-1 Box 11C Form 6781 60% L/T allocation', $longTermSource->label);
        $this->assertSame(19527.0, $longTermSource->amount);
        $this->assertSame(TaxFactSourceType::K1Section1256LongTerm->value, $longTermSource->sourceType);
        $this->assertSame(TaxFactRouting::ScheduleDLine11->value, $longTermSource->routing);
        $this->assertSame('Section 1256 contracts are split 40% short-term and 60% long-term through Form 6781; the long-term portion flows to Schedule D line 11.', $longTermSource->routingReason);
        $this->assertSame('Section 1256 contracts', $longTermSource->notes);
        $this->assertSame($document->id, $longTermSource->taxDocumentId);
        $this->assertSame('11', $longTermSource->box);
        $this->assertSame('C', $longTermSource->code);
        $this->assertTrue($longTermSource->isReviewed);
    }

    public function test_empty_case_has_no_sources_or_totals(): void
    {
        $facts = app(Form6781FactsBuilder::class)->build([]);

        $this->assertSame([], $facts->shortTermSources);
        $this->assertSame([], $facts->longTermSources);
        $this->assertSame(0.0, $facts->shortTermTotal);
        $this->assertSame(0.0, $facts->longTermTotal);
        $this->assertSame(0.0, $facts->netGain);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createTaxDocument(int $userId, array $overrides): FileForTaxDocument
    {
        return app(DocumentIngestionService::class)->createTaxFormDetail(array_merge([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => 'k1',
            'original_filename' => 'tax-doc.pdf',
            'stored_filename' => 'tax-doc.pdf',
            's3_path' => '',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 0,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $userId,
        ], $overrides));
    }

    /**
     * @param  array<int|string, string>  $fields
     * @param  array<int|string, array<int, array<string, string>>>  $codes
     * @return array<string, mixed>
     */
    private function k1Data(array $fields = [], array $codes = []): array
    {
        return [
            'schemaVersion' => '2026.1',
            'formType' => 'K-1-1065',
            'fields' => collect($fields)->map(fn (string $value): array => ['value' => $value])->all(),
            'codes' => $codes,
            'warnings' => [],
        ];
    }
}
