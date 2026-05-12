<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AddressLabelControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_tools_page_is_accessible(): void
    {
        $this->get('/tools/address-labels')->assertOk()->assertSee('Address Label PDF Generator');
    }

    public function test_empty_input_redirects_back_with_errors(): void
    {
        $this->from('/tools/address-labels')->post('/tools/address-labels/pdf', [
            'sheet_number' => '48163',
            'addresses' => '',
        ])->assertRedirect('/tools/address-labels')->assertSessionHasErrors('addresses');
    }

    public function test_pdf_is_streamed_inline_for_valid_request(): void
    {
        $response = $this->post('/tools/address-labels/pdf', ['sheet_number' => '48163', 'addresses' => "Jane\t123\tTX"]);
        $response
            ->assertOk()
            ->assertHeader('Content-Type', 'application/pdf')
            ->assertHeader('Content-Disposition', 'inline; filename="address-labels-48163.pdf"');

        $this->assertStringStartsWith('%PDF-', $response->getContent());
    }

    public function test_skip_count_and_copies_generate_pdf(): void
    {
        $response = $this->post('/tools/address-labels/pdf', [
            'sheet_number' => '48163',
            'addresses' => "Jane\tA\nJohn\tB",
            'skip_count' => 2,
            'copies' => 3,
        ]);

        $response->assertOk()->assertHeader('Content-Type', 'application/pdf');
    }

    public function test_multiple_sheet_formats_generate_pdf(): void
    {
        foreach (['5160', '5161', '5162', '5163', '48163', '5164'] as $sheet) {
            $this->post('/tools/address-labels/pdf', ['sheet_number' => $sheet, 'addresses' => "Jane\tA"])->assertOk();
        }
    }

    public function test_calibration_pdf_route_returns_pdf(): void
    {
        $this->get('/tools/address-labels/calibration?sheet_number=48163')->assertOk()->assertHeader('Content-Type', 'application/pdf');
    }

    public function test_preview_renders_selected_layout_options(): void
    {
        $this->post('/tools/address-labels/preview', [
            'sheet_number' => '48163',
            'addresses' => "Jane Doe\n123 Main\n\nJohn Doe\n456 Oak",
            'parser_mode' => 'blocks',
            'skip_count' => 1,
            'copies' => 2,
            'vertical_align' => 'center',
            'bold_first_line' => '1',
        ])
            ->assertOk()
            ->assertSee('Jane Doe')
            ->assertSee('John Doe')
            ->assertSee('font-bold', false)
            ->assertSee('padding-top', false);
    }

    public function test_preview_repeats_first_label_for_copies(): void
    {
        $response = $this->post('/tools/address-labels/preview', [
            'sheet_number' => '48163',
            'addresses' => "Jane Doe\n123 Main\n\nJohn Doe\n456 Oak",
            'parser_mode' => 'blocks',
            'copies' => 2,
        ]);

        $response->assertOk();
        $this->assertSame(2, substr_count($response->getContent(), 'Jane Doe'));
        $this->assertSame(1, substr_count($response->getContent(), 'John Doe'));
    }

    public function test_multi_page_pdf_generates_for_more_rows_than_fit_on_first_sheet(): void
    {
        $rows = implode("\n", array_map(static fn (int $i): string => "Person {$i}\t{$i} Main", range(1, 25)));

        $response = $this->post('/tools/address-labels/pdf', [
            'sheet_number' => '48163',
            'addresses' => $rows,
            'parser_mode' => 'delimited',
        ]);

        $response->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF-', $response->getContent());
    }

    public function test_preview_rejects_input_exceeding_row_cap(): void
    {
        $rows = implode("\n", array_map(static fn (int $i): string => "Person {$i}\t{$i} Main", range(1, 501)));

        $this->from('/tools/address-labels')->post('/tools/address-labels/preview', [
            'sheet_number' => '48163',
            'addresses' => $rows,
            'parser_mode' => 'delimited',
        ])
            ->assertRedirect('/tools/address-labels')
            ->assertSessionHasErrors('addresses');
    }

    public function test_invalid_sheet_number_redirects_with_errors(): void
    {
        $this->from('/tools/address-labels')->post('/tools/address-labels/pdf', [
            'sheet_number' => 'not-a-sheet',
            'addresses' => 'Jane Doe',
        ])->assertRedirect('/tools/address-labels')->assertSessionHasErrors('sheet_number');

        $this->from('/tools/address-labels')->get('/tools/address-labels/calibration?sheet_number=not-a-sheet')
            ->assertRedirect('/tools/address-labels')
            ->assertSessionHasErrors('sheet_number');
    }
}
