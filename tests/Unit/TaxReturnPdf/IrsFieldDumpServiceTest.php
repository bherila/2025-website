<?php

namespace Tests\Unit\TaxReturnPdf;

use App\Services\Finance\TaxReturnPdf\IrsFieldDumpService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IrsFieldDumpServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_dumps_text_fields_and_checkbox_states_from_current_form_1040(): void
    {
        $fields = app(IrsFieldDumpService::class)->dump(resource_path('irs/forms/2025/f1040.pdf'));
        $indexed = [];
        $grouped = [];

        foreach ($fields as $field) {
            $indexed[$field->name] = $field;
            $grouped[$field->name][] = $field;
        }

        $this->assertCount(199, $fields);
        $this->assertSame('Tx', $indexed['f1_01[0]']->type);
        $this->assertSame('text', $indexed['f1_01[0]']->fieldKind);
        $this->assertSame(1, $indexed['f1_01[0]']->page);
        $this->assertSame('/HelveticaLTStd-Bold 8.00 Tf 0.000 0.000 0.502 rg', $indexed['f1_01[0]']->defaultAppearance);
        $this->assertSame('Btn', $indexed['c1_1[0]']->type);
        $this->assertSame('checkbox', $indexed['c1_1[0]']->fieldKind);
        $this->assertContains('1', $indexed['c1_1[0]']->onValues);
        $this->assertContains('Off', $indexed['c1_1[0]']->states);
        $this->assertSame('radio', $grouped['c1_8[0]'][0]->fieldKind);
        $this->assertSame(['1', '4'], array_values(array_unique(array_merge(
            $grouped['c1_8[0]'][0]->onValues,
            $grouped['c1_8[0]'][1]->onValues,
        ))));
    }
}
