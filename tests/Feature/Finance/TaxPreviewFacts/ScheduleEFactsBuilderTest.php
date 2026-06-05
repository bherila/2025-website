<?php

namespace Tests\Feature\Finance\TaxPreviewFacts;

use App\Models\Files\FileForTaxDocument;
use App\Services\Finance\DocumentIngestionService;
use App\Services\Finance\TaxPreviewFactsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ScheduleEFactsBuilderTest extends TestCase
{
    use RefreshDatabase;

    public function test_partitions_per_partnership_nonpassive_into_income_and_loss_buckets(): void
    {
        $user = $this->createUser();

        // Partnership #1 — net nonpassive = 5000 (Box1=5000 → income bucket)
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'Income Fund', '1' => '5000', '2' => '0', '3' => '0', '4' => '0'],
                codes: [],
            ),
        ]);

        // Partnership #2 — net nonpassive = -83357 (Box11ZZ -74206, Box13ZZ +8893+258 → -83357)
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'Loss Fund', '1' => '0', '2' => '0', '3' => '0', '4' => '0'],
                codes: [
                    '11' => [['code' => 'ZZ', 'value' => '-74206']],
                    '13' => [
                        ['code' => 'ZZ', 'value' => '8893'],
                        ['code' => 'ZZ', 'value' => '258'],
                    ],
                ],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'scheduleE');

        $this->assertSame(5000.0, $facts['scheduleE']['totalNonpassiveIncome']);
        $this->assertSame(-83357.0, $facts['scheduleE']['totalNonpassiveLoss']);
        $this->assertSame(-78357.0, $facts['scheduleE']['totalNonpassive']);
    }

    public function test_zero_partnerships_returns_zero_for_both_nonpassive_buckets(): void
    {
        $user = $this->createUser();

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'scheduleE');

        $this->assertSame(0.0, $facts['scheduleE']['totalNonpassiveIncome']);
        $this->assertSame(0.0, $facts['scheduleE']['totalNonpassiveLoss']);
        $this->assertSame(0.0, $facts['scheduleE']['totalNonpassive']);
    }

    public function test_single_partnership_with_positive_net_lands_in_income_bucket(): void
    {
        $user = $this->createUser();

        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'Solo Fund', '1' => '100', '4' => '5'],
                codes: [
                    '11' => [['code' => 'ZZ', 'value' => '30']],
                    '13' => [['code' => 'ZZ', 'value' => '12']],
                ],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'scheduleE');

        $this->assertSame(123.0, $facts['scheduleE']['totalNonpassiveIncome']);
        $this->assertSame(0.0, $facts['scheduleE']['totalNonpassiveLoss']);
        $this->assertSame(123.0, $facts['scheduleE']['totalNonpassive']);
    }

    public function test_materially_participating_trader_interest_is_fully_deducted_on_schedule_e(): void
    {
        $user = $this->createUser();

        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: [
                    'B' => 'Trader Fund',
                    'partnershipPosition_traderInSecurities' => 'true',
                    '1' => '1000',
                    '5' => '25',
                ],
                codes: [
                    '13' => [['code' => 'H', 'value' => '200']],
                ],
                sourceValueOverrides: [
                    'k1:material-participation' => [
                        'value' => 'true',
                        'originalValue' => null,
                        'label' => 'Material participation in securities-trading activity',
                    ],
                ],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'scheduleE');

        $this->assertSame(200.0, $facts['scheduleE']['totalMaterialParticipationTraderInterest']);
        $this->assertSame(-200.0, $facts['scheduleE']['materialParticipationTraderInterestSources'][0]['amount']);
        $this->assertSame('schedule_e_line_28', $facts['scheduleE']['materialParticipationTraderInterestSources'][0]['routing']);
        $this->assertSame(1000.0, $facts['scheduleE']['totalNonpassiveIncome']);
        $this->assertSame(-200.0, $facts['scheduleE']['totalNonpassiveLoss']);
        $this->assertSame(800.0, $facts['scheduleE']['totalNonpassive']);
        $this->assertSame(800.0, $facts['scheduleE']['grandTotal']);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createTaxDocument(int $userId, array $overrides): FileForTaxDocument
    {
        return app(DocumentIngestionService::class)->createTaxFormDetail(array_merge([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => '1099_misc',
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
     * @param  array<string, array<string, string|null>>  $sourceValueOverrides
     * @return array<string, mixed>
     */
    private function k1Data(array $fields = [], array $codes = [], array $sourceValueOverrides = []): array
    {
        $data = [
            'schemaVersion' => '2026.1',
            'formType' => 'K-1-1065',
            'fields' => collect($fields)->map(fn (string $value): array => ['value' => $value])->all(),
            'codes' => $codes,
            'warnings' => [],
        ];
        if ($sourceValueOverrides !== []) {
            $data['sourceValueOverrides'] = $sourceValueOverrides;
        }

        return $data;
    }
}
