<?php

namespace Tests\Unit\TaxReturnPdf;

use App\Models\FinanceTool\FinTaxReturnProfile;
use App\Models\User;
use App\Services\Finance\TaxPreviewFactsService;
use App\Services\Finance\TaxReturnPdf\Data\IrsFieldDefinition;
use App\Services\Finance\TaxReturnPdf\Data\TaxReturnPdfOptions;
use App\Services\Finance\TaxReturnPdf\IrsAcroFormFillEngine;
use App\Services\Finance\TaxReturnPdf\IrsFieldMapRepository;
use App\Services\Finance\TaxReturnPdf\IrsReturnPdfBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class IrsReturnPdfBuilderTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @param  array<string, string>  $expectedValues
     */
    #[DataProvider('filingStatusProvider')]
    public function test_filing_status_radio_values_are_not_overwritten_by_later_unchecked_mappings(string $filingStatus, array $expectedValues): void
    {
        $builder = app(IrsReturnPdfBuilder::class);
        $map = app(IrsFieldMapRepository::class)->map(2025, 'form-1040');
        $profile = new FinTaxReturnProfile(['filing_status' => $filingStatus]);

        $values = $builder->fieldValues($this->filingStatusMappings($map->mappings), $this->filingStatusFields(), [], $profile);

        $this->assertSame($expectedValues, $values);
    }

    public function test_return_build_assembles_required_supported_forms_into_one_fill_job_packet(): void
    {
        $user = User::factory()->create();
        FinTaxReturnProfile::factory()->for($user, 'user')->create([
            'tax_year' => 2025,
            'taxpayer_first_name' => 'Taxpayer',
            'taxpayer_last_name' => 'Example',
            'taxpayer_ssn' => '123-45-6789',
            'address_line1' => '1 Main St',
            'city' => 'Sampletown',
            'state' => 'CA',
            'postal_code' => '94105',
            'digital_assets_answer' => 'no',
        ]);
        $this->mock(TaxPreviewFactsService::class, function (MockInterface $mock) use ($user): void {
            $mock->shouldReceive('arrayForYear')
                ->once()
                ->with((int) $user->id, 2025)
                ->andReturn($this->multiFormPacketFacts());
        });
        $this->mock(IrsAcroFormFillEngine::class, function (MockInterface $mock): void {
            $mock->shouldReceive('supportsEditableOutput')
                ->once()
                ->andReturn(true);
            $mock->shouldReceive('fillForms')
                ->once()
                ->withArgs(function (array $forms, TaxReturnPdfOptions $options): bool {
                    $this->assertSame('return', $options->scope);
                    $this->assertSame(['form-1040', 'schedule-1', 'schedule-3', 'schedule-d', 'form-8949', 'form-8949'], array_column($forms, 'formId'));
                    $this->assertSame(array_column($forms, 'instanceKey'), array_values(array_unique(array_column($forms, 'instanceKey'))));
                    $this->assertSame('Packet credit 25', $forms[2]['fieldValues']['f2_22[0]'] ?? null);
                    $this->assertSame('25', $forms[2]['fieldValues']['f1_23[0]'] ?? null);
                    $this->assertNull($forms[3]['fieldValues']['f2_4[0]'] ?? null);
                    $this->assertSame('Short lot', $forms[4]['fieldValues']['f1_03[0]'] ?? null);
                    $this->assertSame('Long lot', $forms[5]['fieldValues']['f2_03[0]'] ?? null);

                    return true;
                })
                ->andReturn("%PDF-1.4\n%packet");
        });

        $result = app(IrsReturnPdfBuilder::class)->buildResultForUser(
            $user,
            new TaxReturnPdfOptions(2025, 'return', 'editable', null, 'packet.pdf'),
        );

        $this->assertSame("%PDF-1.4\n%packet", $result->content);
        $this->assertSame(['form-1040', 'schedule-1', 'schedule-3', 'schedule-d', 'form-8949'], $result->formIds);
    }

    public function test_schedule_d_part_iii_lines_18_and_19_are_filled_from_line_12_sources(): void
    {
        $user = User::factory()->create();
        $this->mock(TaxPreviewFactsService::class, function (MockInterface $mock) use ($user): void {
            $mock->shouldReceive('arrayForYear')
                ->once()
                ->with((int) $user->id, 2025)
                ->andReturn([
                    'scheduleD' => [
                        'line12Sources' => [
                            ['sourceType' => 'k1_collectibles_gain', 'amount' => 17.0],
                            ['sourceType' => 'k1_unrecaptured_1250_gain', 'amount' => 23.0],
                        ],
                        'line12GainLoss' => 40.0,
                        'line16Combined' => 40.0,
                    ],
                ]);
        });
        $this->mock(IrsAcroFormFillEngine::class, function (MockInterface $mock): void {
            $mock->shouldReceive('fillForms')
                ->once()
                ->withArgs(function (array $forms): bool {
                    $this->assertSame('schedule-d', $forms[0]['formId']);
                    $this->assertSame('17', $forms[0]['fieldValues']['f2_2[0]'] ?? null);
                    $this->assertSame('23', $forms[0]['fieldValues']['f2_3[0]'] ?? null);

                    return true;
                })
                ->andReturn("%PDF-1.4\n%schedule-d");
        });

        $result = app(IrsReturnPdfBuilder::class)->buildResultForUser(
            $user,
            new TaxReturnPdfOptions(2025, 'form', 'print', 'schedule-d', 'schedule-d.pdf'),
        );

        $this->assertSame(['schedule-d'], $result->formIds);
    }

    public function test_schedule_d_part_iii_lines_18_and_19_are_capped_by_net_long_term_gain(): void
    {
        $user = User::factory()->create();
        $this->mock(TaxPreviewFactsService::class, function (MockInterface $mock) use ($user): void {
            $mock->shouldReceive('arrayForYear')
                ->once()
                ->with((int) $user->id, 2025)
                ->andReturn([
                    'scheduleD' => [
                        'line12Sources' => [
                            ['sourceType' => 'k1_collectibles_gain', 'amount' => 17.0],
                            ['sourceType' => 'k1_unrecaptured_1250_gain', 'amount' => 23.0],
                        ],
                        'line12GainLoss' => 40.0,
                        'line15NetLongTerm' => 10.0,
                        'line16Combined' => 8.0,
                    ],
                ]);
        });
        $this->mock(IrsAcroFormFillEngine::class, function (MockInterface $mock): void {
            $mock->shouldReceive('fillForms')
                ->once()
                ->withArgs(function (array $forms): bool {
                    $this->assertSame('schedule-d', $forms[0]['formId']);
                    $this->assertSame('8', $forms[0]['fieldValues']['f2_2[0]'] ?? null);
                    $this->assertSame('8', $forms[0]['fieldValues']['f2_3[0]'] ?? null);

                    return true;
                })
                ->andReturn("%PDF-1.4\n%schedule-d");
        });

        app(IrsReturnPdfBuilder::class)->buildResultForUser(
            $user,
            new TaxReturnPdfOptions(2025, 'form', 'print', 'schedule-d', 'schedule-d.pdf'),
        );
    }

    public function test_schedule_d_part_iii_lines_18_and_19_are_blank_when_net_long_term_gain_is_offset(): void
    {
        $user = User::factory()->create();
        $this->mock(TaxPreviewFactsService::class, function (MockInterface $mock) use ($user): void {
            $mock->shouldReceive('arrayForYear')
                ->once()
                ->with((int) $user->id, 2025)
                ->andReturn([
                    'scheduleD' => [
                        'line12Sources' => [
                            ['sourceType' => 'k1_collectibles_gain', 'amount' => 17.0],
                            ['sourceType' => 'k1_unrecaptured_1250_gain', 'amount' => 23.0],
                        ],
                        'line12GainLoss' => 40.0,
                        'line15NetLongTerm' => -10.0,
                        'line16Combined' => 30.0,
                    ],
                ]);
        });
        $this->mock(IrsAcroFormFillEngine::class, function (MockInterface $mock): void {
            $mock->shouldReceive('fillForms')
                ->once()
                ->withArgs(function (array $forms): bool {
                    $this->assertSame('schedule-d', $forms[0]['formId']);
                    $this->assertNull($forms[0]['fieldValues']['f2_2[0]'] ?? null);
                    $this->assertNull($forms[0]['fieldValues']['f2_3[0]'] ?? null);

                    return true;
                })
                ->andReturn("%PDF-1.4\n%schedule-d");
        });

        app(IrsReturnPdfBuilder::class)->buildResultForUser(
            $user,
            new TaxReturnPdfOptions(2025, 'form', 'print', 'schedule-d', 'schedule-d.pdf'),
        );
    }

    public function test_schedule_3_line_6_details_are_filled_from_supported_sources(): void
    {
        $user = User::factory()->create();
        $this->mock(TaxPreviewFactsService::class, function (MockInterface $mock) use ($user): void {
            $mock->shouldReceive('arrayForYear')
                ->once()
                ->with((int) $user->id, 2025)
                ->andReturn([
                    'schedule3' => [
                        'line6Sources' => [
                            ['label' => 'General business credit', 'amount' => 30.0, 'box' => '6a'],
                            ['label' => 'Prior-year minimum tax', 'amount' => 20.0, 'box' => '6b'],
                            ['label' => 'Other credit', 'amount' => 25.0, 'box' => '6z'],
                        ],
                        'line7OtherNonrefundableCredits' => 75.0,
                        'line8TotalNonrefundableCredits' => 75.0,
                    ],
                ]);
        });
        $this->mock(IrsAcroFormFillEngine::class, function (MockInterface $mock): void {
            $mock->shouldReceive('fillForms')
                ->once()
                ->withArgs(function (array $forms): bool {
                    $this->assertSame('schedule-3', $forms[0]['formId']);
                    $this->assertSame('30', $forms[0]['fieldValues']['f1_09[0]'] ?? null);
                    $this->assertSame('20', $forms[0]['fieldValues']['f1_10[0]'] ?? null);
                    $this->assertSame('Other credit 25', $forms[0]['fieldValues']['f2_22[0]'] ?? null);
                    $this->assertSame('25', $forms[0]['fieldValues']['f1_23[0]'] ?? null);
                    $this->assertSame('75', $forms[0]['fieldValues']['f1_24[0]'] ?? null);

                    return true;
                })
                ->andReturn("%PDF-1.4\n%schedule-3");
        });

        $result = app(IrsReturnPdfBuilder::class)->buildResultForUser(
            $user,
            new TaxReturnPdfOptions(2025, 'form', 'print', 'schedule-3', 'schedule-3.pdf'),
        );

        $this->assertSame(['schedule-3'], $result->formIds);
    }

    /**
     * @return array<string, array{0: string, 1: array<string, string>}>
     */
    public static function filingStatusProvider(): array
    {
        return [
            'single' => ['single', ['c1_8[0]' => '1']],
            'married filing jointly' => ['married_filing_jointly', ['c1_8[1]' => '2']],
            'married filing separately' => ['married_filing_separately', ['c1_8[2]' => '3']],
            'head of household' => ['head_of_household', ['c1_8[0]' => '4']],
            'qualifying surviving spouse' => ['qualifying_surviving_spouse', ['c1_8[1]' => '5']],
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $mappings
     * @return array<int, array<string, mixed>>
     */
    private function filingStatusMappings(array $mappings): array
    {
        return array_values(array_filter(
            $mappings,
            static fn (array $mapping): bool => str_starts_with((string) ($mapping['key'] ?? ''), 'filing_status.'),
        ));
    }

    /**
     * @return array<string, IrsFieldDefinition>
     */
    private function filingStatusFields(): array
    {
        return [
            'c1_8[0]' => new IrsFieldDefinition(name: 'c1_8[0]', type: 'Btn', page: 1, onValues: ['1', '4']),
            'c1_8[1]' => new IrsFieldDefinition(name: 'c1_8[1]', type: 'Btn', page: 1, onValues: ['2', '5']),
            'c1_8[2]' => new IrsFieldDefinition(name: 'c1_8[2]', type: 'Btn', page: 1, onValues: ['3']),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function multiFormPacketFacts(): array
    {
        return [
            'form1040' => [
                'line7' => 60.0,
                'line8' => 42.0,
                'line10' => 0.0,
                'line17' => 0.0,
                'line20' => 25.0,
                'line31' => 0.0,
            ],
            'schedule1' => [
                'line1aTotal' => 0.0,
                'line2aTotal' => 0.0,
                'line3Total' => 0.0,
                'line4Total' => 0.0,
                'line5Total' => 0.0,
                'line6Total' => 0.0,
                'line7Total' => 0.0,
                'line8bTotal' => 0.0,
                'line8hTotal' => 0.0,
                'line8iTotal' => 0.0,
                'line8zTotal' => 42.0,
                'line9TotalOtherIncome' => 42.0,
                'line15Total' => 0.0,
            ],
            'schedule3' => [
                'line1ForeignTaxCredit' => 0.0,
                'line2ChildDependentCareCredit' => 0.0,
                'line3EducationCredits' => 0.0,
                'line4RetirementSavingsCredit' => 0.0,
                'line5aResidentialCleanEnergyCredit' => 0.0,
                'line5bEnergyEfficientHomeImprovementCredit' => 0.0,
                'line6Sources' => [
                    [
                        'label' => 'Packet credit',
                        'amount' => 25.0,
                        'box' => '6z',
                    ],
                ],
                'line7OtherNonrefundableCredits' => 25.0,
                'line8TotalNonrefundableCredits' => 25.0,
                'line9NetPremiumTaxCredit' => 0.0,
                'line10ExtensionPayment' => 0.0,
                'line11ExcessSocialSecurityWithheld' => 0.0,
                'line12FuelTaxCredit' => 0.0,
                'line14OtherPaymentsRefundableCredits' => 0.0,
                'line15TotalPaymentsRefundableCredits' => 0.0,
            ],
            'scheduleD' => [
                'line1aGainLoss' => 0.0,
                'line1bGainLoss' => 25.0,
                'line2GainLoss' => 0.0,
                'line3GainLoss' => 25.0,
                'line4GainLoss' => 0.0,
                'line5GainLoss' => 0.0,
                'line6Carryover' => 0.0,
                'line7NetShortTerm' => 25.0,
                'line8aGainLoss' => 0.0,
                'line8bGainLoss' => 35.0,
                'line9GainLoss' => 0.0,
                'line10GainLoss' => 0.0,
                'line11GainLoss' => 0.0,
                'line12GainLoss' => 0.0,
                'line13CapitalGainDistributions' => 0.0,
                'line14Carryover' => 0.0,
                'line15NetLongTerm' => 35.0,
                'line16Combined' => 60.0,
                'line21LimitedLossOrGain' => 60.0,
                'form8949Rollups' => [
                    [
                        'form8949Box' => 'A',
                        'isShortTerm' => true,
                        'scheduleDLine' => '1b',
                        'totalProceeds' => 100.0,
                        'totalCostBasis' => 80.0,
                        'totalAdjustment' => 5.0,
                        'netGainOrLoss' => 25.0,
                        'rowCount' => 1,
                    ],
                    [
                        'form8949Box' => 'D',
                        'isShortTerm' => false,
                        'scheduleDLine' => '8b',
                        'totalProceeds' => 200.0,
                        'totalCostBasis' => 160.0,
                        'totalAdjustment' => -5.0,
                        'netGainOrLoss' => 35.0,
                        'rowCount' => 1,
                    ],
                ],
            ],
            'form8949' => [
                'rowCount' => 2,
                'rows' => [
                    [
                        'form8949Box' => 'A',
                        'description' => 'Short lot',
                        'dateAcquired' => '2025-01-02',
                        'dateSold' => '2025-02-03',
                        'proceeds' => 100.0,
                        'costBasis' => 80.0,
                        'adjustmentCode' => 'W',
                        'adjustmentAmount' => 5.0,
                        'gainOrLoss' => 25.0,
                    ],
                    [
                        'form8949Box' => 'D',
                        'description' => 'Long lot',
                        'dateAcquired' => '2024-01-02',
                        'dateSold' => '2025-03-04',
                        'proceeds' => 200.0,
                        'costBasis' => 160.0,
                        'adjustmentCode' => null,
                        'adjustmentAmount' => -5.0,
                        'gainOrLoss' => 35.0,
                    ],
                ],
            ],
        ];
    }
}
