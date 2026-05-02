<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LayoutFooterTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        User::factory()->create(['id' => 1, 'user_role' => 'admin']);
    }

    public function test_admin_footer_links_render_on_app_layout_pages(): void
    {
        $this->withoutVite();

        $admin = $this->createAdminUser();

        $response = $this->actingAs($admin)->get('/dashboard');

        $response->assertOk();
        $response->assertSee('GenAI Jobs');
        $response->assertSee('/admin/genai-jobs', false);
        $response->assertSee('Queue Monitor');
        $response->assertSee('/queue-monitor', false);
    }

    public function test_admin_footer_links_render_on_finance_layout_pages(): void
    {
        $this->withoutVite();

        $admin = $this->createAdminUser();

        $response = $this->actingAs($admin)->get('/finance/accounts');

        $response->assertOk();
        $response->assertSee('GenAI Jobs');
        $response->assertSee('/admin/genai-jobs', false);
        $response->assertSee('Queue Monitor');
        $response->assertSee('/queue-monitor', false);
    }

    public function test_admin_footer_links_do_not_render_for_non_admin_users(): void
    {
        $this->withoutVite();

        $user = $this->createUser();

        $response = $this->actingAs($user)->get('/finance/accounts');

        $response->assertOk();
        $response->assertDontSee('GenAI Jobs');
        $response->assertDontSee('/admin/genai-jobs', false);
        $response->assertDontSee('Queue Monitor');
        $response->assertDontSee('/queue-monitor', false);
    }
}
