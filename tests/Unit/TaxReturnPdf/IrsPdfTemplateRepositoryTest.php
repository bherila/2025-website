<?php

namespace Tests\Unit\TaxReturnPdf;

use App\Services\Finance\TaxReturnPdf\Data\IrsFormTemplate;
use App\Services\Finance\TaxReturnPdf\IrsPdfTemplateRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class IrsPdfTemplateRepositoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_loads_manifest_and_validates_pinned_template_hash(): void
    {
        $template = app(IrsPdfTemplateRepository::class)->template(2025, 'form-1040');

        $this->assertSame('form-1040', $template->formId);
        $this->assertSame('resources/irs/forms/2025/f1040.pdf', $template->path);
        $this->assertSame('3d31c226df0d189ced80e039d01cf0f8820c1019681a0f0ca6264de277b7e982', $template->sha256);
        $this->assertSame('resources/irs/forms/2025/f1040-bg.pdf', $template->backgroundPath);
        $this->assertSame('5c9df498d4b8443dbfb67b17df8d6a7abeb5288706fe98bbce6a28e426b5b3b3', $template->backgroundSha256);
    }

    public function test_hash_mismatch_fails_loudly(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('hash mismatch');

        app(IrsPdfTemplateRepository::class)->validateTemplate(new IrsFormTemplate(
            formId: 'form-1040',
            name: 'Form 1040',
            taxYear: 2025,
            path: 'resources/irs/forms/2025/f1040.pdf',
            sha256: str_repeat('0', 64),
            sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f1040.pdf',
            revision: '2025',
            fillable: true,
        ));
    }

    public function test_background_hash_mismatch_fails_loudly(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('background template hash mismatch');

        app(IrsPdfTemplateRepository::class)->validateTemplate(new IrsFormTemplate(
            formId: 'form-1040',
            name: 'Form 1040',
            taxYear: 2025,
            path: 'resources/irs/forms/2025/f1040.pdf',
            sha256: '3d31c226df0d189ced80e039d01cf0f8820c1019681a0f0ca6264de277b7e982',
            sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f1040.pdf',
            revision: '2025',
            fillable: true,
            backgroundPath: 'resources/irs/forms/2025/f1040-bg.pdf',
            backgroundSha256: str_repeat('0', 64),
        ));
    }
}
