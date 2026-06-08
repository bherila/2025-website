<?php

namespace Tests\Feature\FinanceTool;

use App\Models\FinanceTool\FinTaxReturnPdfExport;
use App\Models\FinanceTool\FinTaxReturnProfile;
use App\Models\User;
use App\Services\Finance\TaxPreviewFactsService;
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
            'formId' => 'schedule-2',
            'mode' => 'editable',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['formId']);
    }

    public function test_supported_schedule_form_id_is_accepted(): void
    {
        $user = User::factory()->create();
        $this->mock(IrsReturnPdfBuilder::class, function (MockInterface $mock): void {
            $mock->shouldReceive('buildForUser')
                ->once()
                ->withArgs(static fn (User $user, TaxReturnPdfOptions $options): bool => $options->scope === 'form'
                    && $options->formId === 'schedule-1')
                ->andReturn("%PDF-1.4\n%schedule");
        });

        $response = $this->actingAs($user)->postJson('/finance/tax-preview/export-pdf', [
            'year' => 2025,
            'scope' => 'form',
            'formId' => 'schedule-1',
            'mode' => 'editable',
        ]);

        $response->assertOk();
        $this->assertStringStartsWith('%PDF', (string) $response->getContent());
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

        // The raw exception detail (which can embed server paths) must not leak to the client.
        $this->assertStringNotContainsString('IRS PDF template file is missing', $response->getContent() ?: '');

        $export = FinTaxReturnPdfExport::query()->where('user_id', $user->id)->firstOrFail();
        $this->assertSame('failed', $export->status);
        $this->assertSame('bad-template.pdf', $export->filename);
        // The detail is retained server-side for debugging via the audit row.
        $this->assertStringContainsString(
            'IRS PDF template file is missing for form-1040.',
            json_encode($export->error_summary, JSON_THROW_ON_ERROR),
        );
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
            'taxpayer_first_name' => 'Taxpayer',
            'taxpayer_last_name' => 'Example',
            'taxpayer_ssn' => '123-45-6789',
            'address_line1' => '1 Main St',
            'city' => 'Sampletown',
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
        $this->assertStringContainsString('Taxpayer', $content);
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

    public function test_complete_return_export_returns_multi_form_packet_when_only_supported_schedules_are_required(): void
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
                ->andReturn($this->schedule1PacketFacts());
        });

        $response = $this->actingAs($user)->postJson('/finance/tax-preview/export-pdf', [
            'year' => 2025,
            'scope' => 'return',
            'mode' => 'editable',
            'filename' => 'federal return packet.pdf',
        ]);

        $response->assertOk();
        $content = (string) $response->getContent();

        $this->assertStringStartsWith('%PDF', $content);
        $this->assertSame(4, count((new Parser)->parseContent($content)->getPages()));
        $this->assertStringContainsString('Taxpayer', $content);
        $this->assertStringContainsString('/AcroForm', $content);

        $this->assertDatabaseHas('fin_tax_return_pdf_exports', [
            'user_id' => $user->id,
            'tax_year' => 2025,
            'scope' => 'return',
            'mode' => 'editable',
            'status' => 'succeeded',
            'filename' => 'federal-return-packet.pdf',
        ]);
    }

    public function test_individual_form_1040_print_export_returns_flat_pdf(): void
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
        $this->assertStringContainsString('Taxpayer', $content);
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

    /**
     * @return array<string, mixed>
     */
    private function schedule1PacketFacts(): array
    {
        return [
            'form1040' => [
                'line1z' => 0.0,
                'line2a' => 0.0,
                'line2b' => 0.0,
                'line3a' => 0.0,
                'line3b' => 0.0,
                'line4a' => 0.0,
                'line4b' => 0.0,
                'line5a' => 0.0,
                'line5b' => 0.0,
                'line6a' => 0.0,
                'line6b' => 0.0,
                'line7' => 0.0,
                'line8' => 42.0,
                'line9' => 42.0,
                'line10' => 0.0,
                'line11' => 42.0,
                'line12' => 0.0,
                'line13' => 0.0,
                'line14' => 0.0,
                'line15' => 42.0,
                'line16' => 0.0,
                'line17' => 0.0,
                'line18' => 0.0,
                'line19' => 0.0,
                'line20' => 0.0,
                'line21' => 0.0,
                'line22' => 0.0,
                'line23' => 0.0,
                'line24' => 0.0,
                'line25a' => 0.0,
                'line25b' => 0.0,
                'line25c' => 0.0,
                'line25d' => 0.0,
                'line26' => 0.0,
                'line31' => 0.0,
                'line32' => 0.0,
                'line33' => 0.0,
                'line34' => 0.0,
                'line35a' => 0.0,
                'line36' => 0.0,
                'line37' => 0.0,
                'line38' => 0.0,
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
        ];
    }
}
