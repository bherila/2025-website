<?php

namespace Tests\Feature;

use App\Models\ClientManagement\ClientCompany;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserManagementImpersonationTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_login_as_client_user_for_selected_company(): void
    {
        $admin = $this->createAdminUser();
        $client = $this->createUser();
        $company = ClientCompany::factory()->create(['slug' => 'acme']);
        $company->users()->attach($client->id);

        $response = $this->actingAs($admin)
            ->postJson("/api/admin/users/{$client->id}/login-as", [
                'client_company_id' => $company->id,
            ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'redirect_url' => route('client-portal.index', ['slug' => 'acme']),
            ]);

        $this->assertAuthenticatedAs($client);
        $this->assertSame($admin->id, session('impersonator_user_id'));
    }

    public function test_non_admin_cannot_login_as_client_user(): void
    {
        $this->createAdminUser();
        $user = $this->createUser();
        $client = $this->createUser();
        $company = ClientCompany::factory()->create();
        $company->users()->attach($client->id);

        $response = $this->actingAs($user)
            ->postJson("/api/admin/users/{$client->id}/login-as", [
                'client_company_id' => $company->id,
            ]);

        $response->assertForbidden();

        $this->assertAuthenticatedAs($user);
    }

    public function test_admin_cannot_login_as_another_admin(): void
    {
        $admin = $this->createAdminUser();
        $otherAdmin = $this->createAdminUser();
        $company = ClientCompany::factory()->create();
        $company->users()->attach($otherAdmin->id);

        $response = $this->actingAs($admin)
            ->postJson("/api/admin/users/{$otherAdmin->id}/login-as", [
                'client_company_id' => $company->id,
            ]);

        $response->assertUnprocessable()
            ->assertJson([
                'message' => 'Admin users cannot be used for client portal preview.',
            ]);

        $this->assertAuthenticatedAs($admin);
    }

    public function test_admin_cannot_login_as_user_for_unassigned_company(): void
    {
        $admin = $this->createAdminUser();
        $client = $this->createUser();
        $assignedCompany = ClientCompany::factory()->create();
        $unassignedCompany = ClientCompany::factory()->create();
        $assignedCompany->users()->attach($client->id);

        $response = $this->actingAs($admin)
            ->postJson("/api/admin/users/{$client->id}/login-as", [
                'client_company_id' => $unassignedCompany->id,
            ]);

        $response->assertUnprocessable()
            ->assertJson([
                'message' => 'This user is not assigned to that client company.',
            ]);

        $this->assertAuthenticatedAs($admin);
    }

    public function test_user_management_list_marks_client_users_that_can_be_previewed(): void
    {
        $admin = $this->createAdminUser();
        $client = User::factory()->create([
            'name' => 'Client User',
            'user_role' => 'user',
        ]);
        $company = ClientCompany::factory()->create([
            'company_name' => 'Acme',
            'slug' => 'acme',
        ]);
        $company->users()->attach($client->id);

        $response = $this->actingAs($admin)->getJson('/api/admin/users');

        $response->assertOk()
            ->assertJsonFragment([
                'id' => $client->id,
                'name' => 'Client User',
                'email' => $client->email,
                'can_login_as_client' => true,
            ])
            ->assertJsonFragment([
                'id' => $company->id,
                'name' => 'Acme',
                'slug' => 'acme',
            ]);
    }
}
