<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\File;
use Tests\TestCase;

class ClientManagementUtilityViteEntrypointsTest extends TestCase
{
    public function test_client_management_and_utility_entrypoints_are_registered_with_vite(): void
    {
        $viteConfig = File::get(base_path('vite.config.ts'));
        $viewPaths = [
            resource_path('views/client-management'),
            resource_path('views/utility-bill-tracker'),
        ];

        foreach ($viewPaths as $viewPath) {
            $views = File::allFiles($viewPath);

            foreach ($views as $view) {
                if ($view->getExtension() !== 'php') {
                    continue;
                }

                $path = $view->getPathname();
                $contents = File::get($path);
                preg_match_all("/@vite\\('([^']+)'\\)/", $contents, $matches);

                $this->assertStringNotContainsString(
                    'resources/js/client-management/admin.tsx',
                    $contents,
                    "{$path} still references the broad client management admin entrypoint.",
                );
                $this->assertStringNotContainsString(
                    'resources/js/client-management/portal.tsx',
                    $contents,
                    "{$path} still references the broad client portal entrypoint.",
                );
                $this->assertStringNotContainsString(
                    'resources/js/utility-bill-tracker.tsx',
                    $contents,
                    "{$path} still references the broad utility bill tracker entrypoint.",
                );

                foreach ($matches[1] as $entrypoint) {
                    if (
                        ! str_starts_with($entrypoint, 'resources/js/client-management/admin/')
                        && ! str_starts_with($entrypoint, 'resources/js/client-management/portal/')
                        && ! str_starts_with($entrypoint, 'resources/js/utility-bill-tracker/')
                    ) {
                        continue;
                    }

                    $this->assertFileExists(base_path($entrypoint));
                    $this->assertStringContainsString(
                        "'{$entrypoint}'",
                        $viteConfig,
                        "{$entrypoint} is referenced by {$path} but is not registered in vite.config.ts.",
                    );
                }
            }
        }

        $this->assertStringNotContainsString("'resources/js/client-management/admin.tsx'", $viteConfig);
        $this->assertStringNotContainsString("'resources/js/client-management/portal.tsx'", $viteConfig);
        $this->assertStringNotContainsString("'resources/js/utility-bill-tracker.tsx'", $viteConfig);
        $this->assertStringNotContainsString("return 'ui-components'", $viteConfig);
    }
}
