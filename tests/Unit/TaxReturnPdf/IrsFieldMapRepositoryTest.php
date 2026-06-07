<?php

namespace Tests\Unit\TaxReturnPdf;

use App\Services\Finance\TaxReturnPdf\Data\IrsFieldMap;
use App\Services\Finance\TaxReturnPdf\IrsFieldMapRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class IrsFieldMapRepositoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_loads_and_validates_form_1040_map_against_dumped_fields(): void
    {
        $map = app(IrsFieldMapRepository::class)->map(2025, 'form-1040');

        $this->assertSame('form-1040', $map->formId);
        $this->assertNotEmpty($map->mappings);
    }

    public function test_form_1040_profile_map_uses_xfa_captioned_identity_and_address_fields(): void
    {
        $map = app(IrsFieldMapRepository::class)->map(2025, 'form-1040');
        $mappings = collect($map->mappings)->keyBy('key');

        $this->assertSame('f1_14[0]', $mappings->get('taxpayer.first_name')['pdfField'] ?? null);
        $this->assertSame('f1_15[0]', $mappings->get('taxpayer.last_name')['pdfField'] ?? null);
        $this->assertSame('f1_16[0]', $mappings->get('taxpayer.ssn')['pdfField'] ?? null);
        $this->assertSame('ssn', $mappings->get('taxpayer.ssn')['format'] ?? null);

        $this->assertSame('f1_17[0]', $mappings->get('spouse.first_name')['pdfField'] ?? null);
        $this->assertSame('f1_18[0]', $mappings->get('spouse.last_name')['pdfField'] ?? null);
        $this->assertSame('f1_19[0]', $mappings->get('spouse.ssn')['pdfField'] ?? null);

        $this->assertSame('f1_20[0]', $mappings->get('address.line1')['pdfField'] ?? null);
        $this->assertSame('f1_21[0]', $mappings->get('address.line2')['pdfField'] ?? null);
        $this->assertSame('f1_22[0]', $mappings->get('address.city')['pdfField'] ?? null);
        $this->assertSame('f1_23[0]', $mappings->get('address.state')['pdfField'] ?? null);
        $this->assertSame('f1_24[0]', $mappings->get('address.postal_code')['pdfField'] ?? null);

        $this->assertSame('c1_10[0]', $mappings->get('digital_assets.yes')['pdfField'] ?? null);
        $this->assertSame('c1_10[1]', $mappings->get('digital_assets.no')['pdfField'] ?? null);

        $this->assertNotContains($mappings->get('taxpayer.first_name')['pdfField'] ?? null, [
            'f1_01[0]',
            'f1_02[0]',
            'f1_11[0]',
            'f1_12[0]',
            'f1_13[0]',
        ]);
    }

    public function test_validation_fails_when_pdf_field_is_missing(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('unknown PDF field missing-field');

        app(IrsFieldMapRepository::class)->validate(new IrsFieldMap(
            taxYear: 2025,
            formId: 'form-1040',
            templateRevision: '2025',
            mappings: [
                [
                    'key' => 'bad',
                    'pdfField' => 'missing-field',
                    'source' => 'facts.form1040.line9',
                    'format' => 'amount',
                ],
            ],
        ));
    }

    public function test_validation_fails_when_checkbox_on_value_is_missing(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('unknown on-value 99');

        app(IrsFieldMapRepository::class)->validate(new IrsFieldMap(
            taxYear: 2025,
            formId: 'form-1040',
            templateRevision: '2025',
            mappings: [
                [
                    'key' => 'bad-checkbox',
                    'pdfField' => 'c1_10[0]',
                    'source' => 'profile.digital_assets_answer',
                    'format' => 'checkbox',
                    'onValue' => '99',
                ],
            ],
        ));
    }
}
