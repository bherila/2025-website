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
}
