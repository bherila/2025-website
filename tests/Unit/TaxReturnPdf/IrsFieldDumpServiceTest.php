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

        foreach ($fields as $field) {
            $indexed[$field->name] = $field;
        }

        $this->assertCount(199, $fields);
        $this->assertSame('Tx', $indexed['f1_01[0]']->type);
        $this->assertSame(1, $indexed['f1_01[0]']->page);
        $this->assertSame('Btn', $indexed['c1_1[0]']->type);
        $this->assertContains('1', $indexed['c1_1[0]']->onValues);
        $this->assertContains('Off', $indexed['c1_1[0]']->states);
    }
}
