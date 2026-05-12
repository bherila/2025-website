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

        $response = $this->get('/tools/address-labels');

        $response->assertOk();
        $response->assertSee('Address Label PDF Generator');
    }

    public function test_pdf_is_streamed_inline_for_valid_request(): void
    {
        $this->withoutVite();

        $response = $this->post('/tools/address-labels/pdf', [
            'sheet_number' => '48163',
            'addresses' => "Jane Doe\t123 Main St\tAustin, TX 78701",
        ]);

        $response->assertOk();
        $response->assertHeader('Content-Type', 'application/pdf');
        $response->assertHeader('Content-Disposition', 'inline; filename="address-labels-48163.pdf"');
        $this->assertStringContainsString('%PDF-', (string) $response->getContent());
    }
}
