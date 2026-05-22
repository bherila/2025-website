<?php

namespace Tests\Feature;

use Tests\TestCase;

class LocalAnimateCssTest extends TestCase
{
    public function test_main_layout_does_not_load_animate_css_from_cdn(): void
    {
        $response = $this->get('/');

        $response->assertOk();
        $response->assertDontSee('cdnjs.cloudflare.com/ajax/libs/animate.css', false);
        $response->assertDontSee('animate.min.css', false);
    }

    public function test_local_styles_define_used_animate_css_classes(): void
    {
        $styles = file_get_contents(resource_path('css/app.css'));

        $this->assertIsString($styles);
        $this->assertStringContainsString('.animate__animated', $styles);
        $this->assertStringContainsString('.animate__fadeIn', $styles);
    }
}
