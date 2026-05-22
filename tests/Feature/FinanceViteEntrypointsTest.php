<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\File;
use Tests\TestCase;

class FinanceViteEntrypointsTest extends TestCase
{
    public function test_finance_blade_entrypoints_are_registered_with_vite(): void
    {
        $viteConfig = File::get(base_path('vite.config.ts'));
        $financeViews = File::glob(resource_path('views/finance/*.blade.php'));

        $this->assertIsArray($financeViews);
        $this->assertNotEmpty($financeViews);

        foreach ($financeViews as $view) {
            $contents = File::get($view);
            preg_match_all("/@vite\\('([^']+)'\\)/", $contents, $matches);

            $this->assertStringNotContainsString(
                'resources/js/finance.tsx',
                $contents,
                "{$view} still references the broad finance entrypoint.",
            );
            $this->assertStringNotContainsString(
                'resources/js/finance-account-maintenance.tsx',
                $contents,
                "{$view} still references the deleted maintenance entrypoint.",
            );

            foreach ($matches[1] as $entrypoint) {
                if (! str_starts_with($entrypoint, 'resources/js/finance/pages/')) {
                    continue;
                }

                $this->assertFileExists(base_path($entrypoint));
                $this->assertStringContainsString(
                    "'{$entrypoint}'",
                    $viteConfig,
                    "{$entrypoint} is referenced by {$view} but is not registered in vite.config.ts.",
                );
            }
        }

        $this->assertStringNotContainsString("'resources/js/finance.tsx'", $viteConfig);
        $this->assertStringNotContainsString("'resources/js/finance-account-maintenance.tsx'", $viteConfig);
    }
}
