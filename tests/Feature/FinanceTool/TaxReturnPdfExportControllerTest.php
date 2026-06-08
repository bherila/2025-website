<?php

namespace Tests\Feature\FinanceTool;

use App\Models\FinanceTool\FinTaxReturnPdfExport;
use App\Models\FinanceTool\FinTaxReturnProfile;
use App\Models\User;
use App\Services\Finance\TaxReturnPdf\Data\TaxReturnPdfOptions;
use App\Services\Finance\TaxReturnPdf\IrsReturnPdfBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use RuntimeException;
use Smalot\PdfParser\Parser;
use Tests\TestCase;

class TaxReturnPdfExportControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_endpoint_requires_authentication(): void
    {
        $response = $this->postJson('/finance/tax-preview/export-pdf', [
            'year' => 2025,
            'scope' => 'form',
            'formId' => 'form-1040',
            'mode' => 'editable',
        ]);

        $response->assertUnauthorized();
    }

    public function test_invalid_form_id_is_rejected(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/finance/tax-preview/export-pdf', [
            'year' => 2025,
            'scope' => 'form',
            'formId' => 'schedule-1',
            'mode' => 'editable',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['formId']);
    }

    public function test_missing_template_failure_is_reported_and_audited(): void
    {
        $user = User::factory()->create();
        $this->mock(IrsReturnPdfBuilder::class, function (MockInterface $mock): void {
            $mock->shouldReceive('buildForUser')
                ->once()
                ->andThrow(new RuntimeException('IRS PDF template file is missing for form-1040.'));
        });

        $response = $this->actingAs($user)->postJson('/finance/tax-preview/export-pdf', [
            'year' => 2025,
            'scope' => 'form',
            'formId' => 'form-1040',
            'mode' => 'editable',
            'filename' => 'bad template.pdf',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonFragment(['message' => 'Tax return PDF export failed.']);

        $this->assertDatabaseHas('fin_tax_return_pdf_exports', [
            'user_id' => $user->id,
            'tax_year' => 2025,
            'scope' => 'form',
            'mode' => 'editable',
            'status' => 'failed',
            'filename' => 'bad-template.pdf',
        ]);
    }

    public function test_filename_is_clamped_after_pdf_extension_is_added(): void
    {
        $user = User::factory()->create();
        $filename = str_repeat('a', 252);
        $expectedFilename = str_repeat('a', 251).'.pdf';

        $this->mock(IrsReturnPdfBuilder::class, function (MockInterface $mock) use ($expectedFilename): void {
            $mock->shouldReceive('buildForUser')
                ->once()
                ->withArgs(static fn (User $user, TaxReturnPdfOptions $options): bool => $options->filename === $expectedFilename)
                ->andThrow(new RuntimeException('IRS PDF template file is missing for form-1040.'));
        });

        $response = $this->actingAs($user)->postJson('/finance/tax-preview/export-pdf', [
            'year' => 2025,
            'scope' => 'form',
            'formId' => 'form-1040',
            'mode' => 'editable',
            'filename' => $filename,
        ]);

        $response->assertUnprocessable();
        $this->assertSame(255, strlen($expectedFilename));
        $this->assertDatabaseHas('fin_tax_return_pdf_exports', [
            'user_id' => $user->id,
            'filename' => $expectedFilename,
        ]);
    }

    public function test_missing_required_profile_blocks_complete_return_export(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/finance/tax-preview/export-pdf', [
            'year' => 2025,
            'scope' => 'return',
            'mode' => 'editable',
            'filename' => '2025-federal-return.pdf',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonPath('message', 'Tax return PDF export is not ready.');
        $this->assertNotEmpty(array_filter(
            $response->json('errors'),
            static fn (string $error): bool => str_contains($error, 'taxpayer first name'),
        ));

        $this->assertDatabaseHas('fin_tax_return_pdf_exports', [
            'user_id' => $user->id,
            'tax_year' => 2025,
            'scope' => 'return',
            'mode' => 'editable',
            'status' => 'blocked',
            'filename' => '2025-federal-return.pdf',
        ]);
    }

    public function test_individual_form_1040_editable_export_returns_pdf_and_audits_success(): void
    {
        $user = User::factory()->create();
        FinTaxReturnProfile::factory()->for($user, 'user')->create([
            'tax_year' => 2025,
            'taxpayer_first_name' => 'Ada',
            'taxpayer_last_name' => 'Lovelace',
            'taxpayer_ssn' => '123-45-6789',
            'address_line1' => '1 Main St',
            'city' => 'London',
            'state' => 'CA',
            'postal_code' => '94105',
            'digital_assets_answer' => 'no',
        ]);
        $unexpectedPath = storage_path('app/testing/tax-return-pdf-feature.pdf');

        if (is_file($unexpectedPath)) {
            unlink($unexpectedPath);
        }

        $response = $this->actingAs($user)->postJson('/finance/tax-preview/export-pdf', [
            'year' => 2025,
            'scope' => 'form',
            'formId' => 'form-1040',
            'mode' => 'editable',
            'filename' => 'tax return form 1040.pdf',
        ]);

        $response->assertOk();
        $this->assertStringContainsString('application/pdf', (string) $response->headers->get('content-type'));
        $this->assertSame('attachment; filename="tax-return-form-1040.pdf"', $response->headers->get('content-disposition'));

        $content = (string) $response->getContent();

        $this->assertStringStartsWith('%PDF', $content);
        $this->assertSame(2, count((new Parser)->parseContent($content)->getPages()));
        $this->assertStringContainsString('Ada', $content);
        $this->assertStringContainsString('/AcroForm', $content);
        $this->assertFileDoesNotExist($unexpectedPath);

        $this->assertDatabaseHas('fin_tax_return_pdf_exports', [
            'user_id' => $user->id,
            'tax_year' => 2025,
            'scope' => 'form',
            'mode' => 'editable',
            'status' => 'succeeded',
            'filename' => 'tax-return-form-1040.pdf',
        ]);

        $audit = FinTaxReturnPdfExport::query()->where('user_id', $user->id)->latest('id')->firstOrFail();
        $this->assertSame(['form-1040'], $audit->form_ids);
    }

    public function test_individual_form_1040_print_export_returns_flat_pdf(): void
    {
        $user = User::factory()->create();
        FinTaxReturnProfile::factory()->for($user, 'user')->create([
            'tax_year' => 2025,
            'taxpayer_first_name' => 'Ada',
            'taxpayer_last_name' => 'Lovelace',
            'taxpayer_ssn' => '123-45-6789',
            'address_line1' => '1 Main St',
            'city' => 'London',
            'state' => 'CA',
            'postal_code' => '94105',
            'digital_assets_answer' => 'no',
        ]);

        $response = $this->actingAs($user)->postJson('/finance/tax-preview/export-pdf', [
            'year' => 2025,
            'scope' => 'form',
            'formId' => 'form-1040',
            'mode' => 'print',
            'filename' => 'tax return form 1040 print.pdf',
        ]);

        $response->assertOk();
        $this->assertStringContainsString('application/pdf', (string) $response->headers->get('content-type'));

        $content = (string) $response->getContent();

        $this->assertStringStartsWith('%PDF', $content);
        $this->assertSame(2, count((new Parser)->parseContent($content)->getPages()));
        $this->assertStringContainsString('Ada', $content);
        $this->assertStringNotContainsString('/AcroForm', $content);

        $this->assertDatabaseHas('fin_tax_return_pdf_exports', [
            'user_id' => $user->id,
            'tax_year' => 2025,
            'scope' => 'form',
            'mode' => 'print',
            'status' => 'succeeded',
            'filename' => 'tax-return-form-1040-print.pdf',
        ]);
    }
}
