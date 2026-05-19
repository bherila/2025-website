<?php

namespace App\Http\Controllers;

use Symfony\Component\HttpFoundation\BinaryFileResponse;

class OhifViewerController extends Controller
{
    public function __invoke(): BinaryFileResponse
    {
        $indexPath = public_path('ohif/index.html');

        abort_unless(is_file($indexPath), 404);

        return response()->file($indexPath);
    }
}
