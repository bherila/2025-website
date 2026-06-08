<?php

namespace Tests\Unit\TaxReturnPdf;

use App\Models\FinanceTool\FinTaxReturnProfile;
use App\Services\Finance\TaxReturnPdf\Data\IrsFieldDefinition;
use App\Services\Finance\TaxReturnPdf\IrsFieldMapRepository;
use App\Services\Finance\TaxReturnPdf\IrsReturnPdfBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
