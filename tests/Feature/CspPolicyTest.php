<?php

namespace Tests\Feature;

use Tests\TestCase;

class CspPolicyTest extends TestCase
{
    public function test_report_only_csp_allows_configured_dicom_r2_storage_sources(): void
    {
        config()->set('filesystems.disks.phr_dicom.endpoint', 'https://460f679bfb0a7ee47cc561c1d08e154f.r2.cloudflarestorage.com');
        config()->set('filesystems.disks.phr_dicom.bucket', 'bhdicom');

        $response = $this->get('/');

        $response->assertOk();

        $csp = $response->headers->get('Content-Security-Policy-Report-Only');
        $this->assertIsString($csp);
        $this->assertStringContainsString('connect-src', $csp);
        $this->assertStringContainsString('https://460f679bfb0a7ee47cc561c1d08e154f.r2.cloudflarestorage.com', $csp);
        $this->assertStringContainsString('https://bhdicom.460f679bfb0a7ee47cc561c1d08e154f.r2.cloudflarestorage.com', $csp);
    }
}
