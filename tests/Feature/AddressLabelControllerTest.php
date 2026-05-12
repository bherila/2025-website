<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AddressLabelControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_tools_page_is_accessible(): void
    {
        $this->withoutVite();
        $this->get('/tools/address-labels')->assertOk()->assertSee('Address Label PDF Generator');
    }

    public function test_empty_input_redirects_back_with_errors(): void
    {
        $this->withoutVite();
        $this->from('/tools/address-labels')->post('/tools/address-labels/pdf', [
            'sheet_number' => '48163',
            'addresses' => '',
        ])->assertRedirect('/tools/address-labels')->assertSessionHasErrors('addresses');
    }

    public function test_pdf_is_streamed_inline_for_valid_request(): void
    {
        $response = $this->post('/tools/address-labels/pdf', ['sheet_number' => '48163', 'addresses' => "Jane\t123\tTX"]);
        $response->assertOk()->assertHeader('Content-Type', 'application/pdf');
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
}
