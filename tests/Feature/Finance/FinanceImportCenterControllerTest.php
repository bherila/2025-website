<?php

namespace Tests\Feature\Finance;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinanceImportCenterControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Consume user ID 1 (always admin) so subsequent users are non-admin
        // and must pass the feature-permission gate.
        User::factory()->create(['user_role' => 'admin']);
    }

    public function test_authenticated_user_with_finance_access_can_view_import_center(): void
    {
        $user = $this->createUser();
        $this->grantFeatures($user, ['finance.access']);

        $response = $this->actingAs($user)->get('/finance/import');

        $response->assertStatus(200);
    }

    public function test_authenticated_user_without_finance_access_is_forbidden(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->get('/finance/import');

        $response->assertStatus(403);
    }

    public function test_unauthenticated_user_is_redirected_to_login(): void
    {
        $response = $this->get('/finance/import');

        $response->assertRedirect('/login');
    }
}
