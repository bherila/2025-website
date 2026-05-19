<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\File;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Tests\TestCase;

class OhifViewerRouteTest extends TestCase
{
    private string $indexPath;

    private bool $createdOhifDirectory = false;

    private ?string $originalIndexHtml = null;

    protected function setUp(): void
    {
        parent::setUp();

        $this->indexPath = public_path('ohif/index.html');
        $ohifDirectory = dirname($this->indexPath);

        if (is_file($this->indexPath)) {
            $this->originalIndexHtml = (string) file_get_contents($this->indexPath);
        } else {
            $this->createdOhifDirectory = ! is_dir($ohifDirectory);
            File::ensureDirectoryExists($ohifDirectory);
        }

        File::put($this->indexPath, '<!doctype html><title>OHIF test entry</title>');
    }

    protected function tearDown(): void
    {
        if ($this->originalIndexHtml !== null) {
            File::put($this->indexPath, $this->originalIndexHtml);
        } else {
            File::delete($this->indexPath);
        }

        if ($this->createdOhifDirectory) {
            File::deleteDirectory(dirname($this->indexPath));
        }

        parent::tearDown();
    }

    public function test_ohif_viewer_path_serves_static_viewer_entrypoint(): void
    {
        $response = $this->get('/ohif/viewer/dicomjson?url=%2Fapi%2Fphr%2Fpatients%2F2%2Fdicom%2Fstudies%2F1%2Fviewer-json');

        $response->assertOk();
        $this->assertInstanceOf(BinaryFileResponse::class, $response->baseResponse);
        $this->assertSame(realpath($this->indexPath), $response->baseResponse->getFile()->getRealPath());
    }

    public function test_missing_ohif_assets_do_not_fall_back_to_entrypoint(): void
    {
        $response = $this->get('/ohif/assets/missing.js');

        $response->assertNotFound();
    }
}
