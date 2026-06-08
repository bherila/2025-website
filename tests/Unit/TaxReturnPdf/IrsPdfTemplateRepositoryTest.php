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

    public function test_loads_manifest_and_validates_pinned_template_hashes(): void
    {
        $expected = [
            'form-1040' => [
                'path' => 'resources/irs/forms/2025/f1040.pdf',
                'sha256' => '3d31c226df0d189ced80e039d01cf0f8820c1019681a0f0ca6264de277b7e982',
                'backgroundPath' => 'resources/irs/forms/2025/f1040-bg.pdf',
                'backgroundSha256' => '5c9df498d4b8443dbfb67b17df8d6a7abeb5288706fe98bbce6a28e426b5b3b3',
            ],
            'schedule-1' => [
                'path' => 'resources/irs/forms/2025/f1040s1.pdf',
                'sha256' => '8dafec719f6a4716c259a2bdaca546d9bb9e262d1eabef885fe116a7327458fa',
                'backgroundPath' => 'resources/irs/forms/2025/f1040s1-bg.pdf',
                'backgroundSha256' => '9e32dae27655f291655c689ea90b9dc93cd16d851407ea950ae2e1ee867c09a9',
            ],
            'schedule-3' => [
                'path' => 'resources/irs/forms/2025/f1040s3.pdf',
                'sha256' => '008cfd3fe3ebd0860452069b90fd0a3d53dda6dd8a5d870278370aa899a63f82',
                'backgroundPath' => 'resources/irs/forms/2025/f1040s3-bg.pdf',
                'backgroundSha256' => '61901c1c8e08b00c69c11640290c042bd8f1928c79c230fb2b252442b9fa1629',
            ],
            'schedule-d' => [
                'path' => 'resources/irs/forms/2025/f1040sd.pdf',
                'sha256' => '90564c8b7e49280363612639b804d113ebedb516c2e87c70649f29c844da1d2e',
                'backgroundPath' => 'resources/irs/forms/2025/f1040sd-bg.pdf',
                'backgroundSha256' => 'b06bd247124e43bbade5c256992a852f9c7f7a75791befd2968e121fab98aa9d',
            ],
            'form-8949' => [
                'path' => 'resources/irs/forms/2025/f8949.pdf',
                'sha256' => '274513891e4e281d11e14286f14b9df724c24b6030fca0f0681da64fb2e7f525',
                'backgroundPath' => 'resources/irs/forms/2025/f8949-bg.pdf',
                'backgroundSha256' => 'a1b497dcda63fa55cd562fcf6097e99c6bd9ea0fd8150b848ca4140cc0541563',
            ],
        ];

        foreach ($expected as $formId => $templateExpectations) {
            $template = app(IrsPdfTemplateRepository::class)->template(2025, $formId);

            $this->assertSame($formId, $template->formId);
            $this->assertSame($templateExpectations['path'], $template->path);
            $this->assertSame($templateExpectations['sha256'], $template->sha256);
            $this->assertSame($templateExpectations['backgroundPath'], $template->backgroundPath);
            $this->assertSame($templateExpectations['backgroundSha256'], $template->backgroundSha256);
        }
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
