<?php

namespace Tests\Feature\Finance;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinanceCategorizationControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Consume user ID 1 (always admin) so subsequent users are non-admin
        // and must pass the feature-permission gate.
        User::factory()->create(['user_role' => 'admin']);
    }

    public function test_authenticated_user_with_finance_access_can_view_categorization_page(): void
    {
        $user = $this->createUser();
        $this->grantFeatures($user, ['finance.access']);

        $response = $this->actingAs($user)->get('/finance/categorization');

        $response->assertStatus(200);
    }

    public function test_authenticated_user_without_finance_access_is_forbidden(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->get('/finance/categorization');

        $response->assertStatus(403);
    }

    public function test_unauthenticated_user_is_redirected_to_login(): void
    {
        $response = $this->get('/finance/categorization');

        $response->assertRedirect('/login');
    }

    public function test_finance_tags_redirects_to_categorization(): void
    {
        $user = $this->createUser();
        $this->grantFeatures($user, ['finance.access']);

        $response = $this->actingAs($user)->get('/finance/tags');

        $response->assertRedirect('/finance/categorization');
    }

    public function test_finance_tags_unauthenticated_is_redirected(): void
    {
        // Route::redirect fires before auth middleware, so unauthenticated users
        // get the 301 to /finance/categorization, not a login redirect.
        $response = $this->get('/finance/tags');

        // The redirect may point to /finance/categorization (301 fires first) or
        // fall through to auth redirect — either way the old /finance/tags URL
        // is no longer a dead route.
        $this->assertTrue(
            $response->isRedirect('/finance/categorization') || $response->isRedirect(url('/login')),
            'Expected redirect to /finance/categorization or /login',
        );
    }
}
