<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class FinancePayslipControllerTest extends TestCase
{
    // -------------------------------------------------------------------------
    // GET /api/payslips/years
    // -------------------------------------------------------------------------

    public function test_fetch_payslip_years_requires_auth(): void
    {
        $response = $this->getJson('/api/payslips/years');
        $response->assertStatus(401);
    }

    public function test_fetch_payslip_years_returns_empty_array_when_no_payslips(): void
    {
        $user = $this->createUser();
        $response = $this->actingAs($user)->getJson('/api/payslips/years');
        $response->assertOk();
        $years = $response->json();
        $currentYear = (string) date('Y');
        $this->assertContains($currentYear, $years);
    }

    public function test_fetch_payslip_years_returns_years_from_payslips(): void
    {
        $user = $this->createUser();
        DB::table('fin_payslip')->insert([
            'uid' => $user->id,
            'period_start' => '2022-01-01',
            'period_end' => '2022-01-15',
            'pay_date' => '2022-01-20',
            'earnings_net_pay' => 5000,
        ]);
        DB::table('fin_payslip')->insert([
            'uid' => $user->id,
            'period_start' => '2023-06-01',
            'period_end' => '2023-06-15',
            'pay_date' => '2023-06-20',
            'earnings_net_pay' => 5000,
        ]);

        $response = $this->actingAs($user)->getJson('/api/payslips/years');
        $response->assertOk();
        $years = $response->json();
        $this->assertContains('2022', $years);
        $this->assertContains('2023', $years);
    }

    public function test_fetch_payslip_years_does_not_return_other_users_data(): void
    {
        $user1 = $this->createUser();
        $user2 = $this->createUser();

        DB::table('fin_payslip')->insert([
            'uid' => $user2->id,
            'period_start' => '2019-01-01',
            'period_end' => '2019-01-15',
            'pay_date' => '2019-01-20',
            'earnings_net_pay' => 5000,
        ]);

        $response = $this->actingAs($user1)->getJson('/api/payslips/years');
        $response->assertOk();
        $years = $response->json();
        $this->assertNotContains('2019', $years);
    }

    // -------------------------------------------------------------------------
    // GET /api/payslips
    // -------------------------------------------------------------------------

    public function test_fetch_payslips_requires_auth(): void
    {
        $response = $this->getJson('/api/payslips?year=2024');
        $response->assertStatus(401);
    }

    public function test_fetch_payslips_returns_empty_for_year_with_no_data(): void
    {
        $user = $this->createUser();
        $response = $this->actingAs($user)->getJson('/api/payslips?year=2000');
        $response->assertOk();
        $response->assertJson([]);
    }

    public function test_fetch_payslips_returns_payslips_for_year(): void
    {
        $user = $this->createUser();
        DB::table('fin_payslip')->insert([
            'uid' => $user->id,
            'period_start' => '2024-03-01',
            'period_end' => '2024-03-15',
            'pay_date' => '2024-03-20',
            'earnings_net_pay' => 7000,
        ]);
        DB::table('fin_payslip')->insert([
            'uid' => $user->id,
            'period_start' => '2023-03-01',
            'period_end' => '2023-03-15',
            'pay_date' => '2023-03-20',
            'earnings_net_pay' => 6000,
        ]);

        $response = $this->actingAs($user)->getJson('/api/payslips?year=2024');
        $response->assertOk();
        $data = $response->json();
        $this->assertCount(1, $data);
        $this->assertEquals('2024-03-01', $data[0]['period_start']);
    }

    public function test_fetch_payslips_rejects_invalid_year(): void
    {
        $user = $this->createUser();
        $response = $this->actingAs($user)->getJson('/api/payslips?year=1800');
        $response->assertStatus(400);
    }

    public function test_fetch_payslips_does_not_return_other_users_payslips(): void
    {
        $user1 = $this->createUser();
        $user2 = $this->createUser();

        DB::table('fin_payslip')->insert([
            'uid' => $user2->id,
            'period_start' => '2024-01-01',
            'period_end' => '2024-01-15',
            'pay_date' => '2024-01-20',
            'earnings_net_pay' => 9000,
        ]);

        $response = $this->actingAs($user1)->getJson('/api/payslips?year=2024');
        $response->assertOk();
        $this->assertCount(0, $response->json());
    }

    // -------------------------------------------------------------------------
    // POST /api/payslips
    // -------------------------------------------------------------------------

    public function test_save_payslip_requires_auth(): void
    {
        $response = $this->postJson('/api/payslips', [
            'period_start' => '2024-01-01',
            'period_end' => '2024-01-15',
            'pay_date' => '2024-01-20',
        ]);
        $response->assertStatus(401);
    }

    public function test_save_payslip_creates_new_payslip(): void
    {
        $user = $this->createUser();
        $response = $this->actingAs($user)->postJson('/api/payslips', [
            'period_start' => '2024-01-01',
            'period_end' => '2024-01-15',
            'pay_date' => '2024-01-20',
            'earnings_net_pay' => 7500.50,
            'ps_salary' => 10000,
            'ps_fed_tax' => 2000,
        ]);

        $response->assertOk();
        $response->assertJson(['success' => true]);

        $this->assertDatabaseHas('fin_payslip', [
            'uid' => $user->id,
            'period_start' => '2024-01-01',
            'period_end' => '2024-01-15',
            'pay_date' => '2024-01-20',
        ]);
    }

    public function test_save_payslip_validates_required_dates(): void
    {
        $user = $this->createUser();
        $response = $this->actingAs($user)->postJson('/api/payslips', [
            'earnings_net_pay' => 5000,
        ]);
        $response->assertStatus(422);
    }

    public function test_save_payslip_updates_existing_payslip(): void
    {
        $user = $this->createUser();
        $payslipId = DB::table('fin_payslip')->insertGetId([
            'uid' => $user->id,
            'period_start' => '2024-02-01',
            'period_end' => '2024-02-15',
            'pay_date' => '2024-02-20',
            'earnings_net_pay' => 5000,
        ]);

        $response = $this->actingAs($user)->postJson('/api/payslips', [
            'payslip_id' => $payslipId,
            'period_start' => '2024-02-01',
            'period_end' => '2024-02-15',
            'pay_date' => '2024-02-20',
            'earnings_net_pay' => 8000,
        ]);

        $response->assertOk();
        $response->assertJson(['success' => true]);

        $this->assertDatabaseHas('fin_payslip', [
            'payslip_id' => $payslipId,
            'earnings_net_pay' => 8000,
        ]);
    }

    // -------------------------------------------------------------------------
    // GET /api/payslips/{payslip_id}
    // -------------------------------------------------------------------------

    public function test_fetch_payslip_by_id_requires_auth(): void
    {
        $response = $this->getJson('/api/payslips/1');
        $response->assertStatus(401);
    }

    public function test_fetch_payslip_by_id_returns_payslip(): void
    {
        $user = $this->createUser();
        $payslipId = DB::table('fin_payslip')->insertGetId([
            'uid' => $user->id,
            'period_start' => '2024-05-01',
            'period_end' => '2024-05-15',
            'pay_date' => '2024-05-20',
            'earnings_net_pay' => 6500,
        ]);

        $response = $this->actingAs($user)->getJson("/api/payslips/{$payslipId}");
        $response->assertOk();
        $response->assertJsonPath('period_start', '2024-05-01');
        $response->assertJsonPath('payslip_id', $payslipId);
    }

    public function test_fetch_payslip_by_id_returns_404_for_other_users_payslip(): void
    {
        $user1 = $this->createUser();
        $user2 = $this->createUser();

        $payslipId = DB::table('fin_payslip')->insertGetId([
            'uid' => $user2->id,
            'period_start' => '2024-05-01',
            'period_end' => '2024-05-15',
            'pay_date' => '2024-05-20',
            'earnings_net_pay' => 6500,
        ]);

        $response = $this->actingAs($user1)->getJson("/api/payslips/{$payslipId}");
        $response->assertStatus(404);
    }

    // -------------------------------------------------------------------------
    // DELETE /api/payslips/{payslip_id}
    // -------------------------------------------------------------------------

    public function test_delete_payslip_requires_auth(): void
    {
        $response = $this->deleteJson('/api/payslips/1');
        $response->assertStatus(401);
    }

    public function test_delete_payslip_removes_payslip(): void
    {
        $user = $this->createUser();
        $payslipId = DB::table('fin_payslip')->insertGetId([
            'uid' => $user->id,
            'period_start' => '2024-07-01',
            'period_end' => '2024-07-15',
            'pay_date' => '2024-07-20',
            'earnings_net_pay' => 7000,
        ]);

        $response = $this->actingAs($user)->deleteJson("/api/payslips/{$payslipId}");
        $response->assertOk();
        $response->assertJson(['success' => true]);

        $this->assertDatabaseMissing('fin_payslip', [
            'payslip_id' => $payslipId,
            'deleted_at' => null,
        ]);
    }

    public function test_delete_payslip_does_not_delete_other_users_payslip(): void
    {
        $user1 = $this->createUser();
        $user2 = $this->createUser();

        $payslipId = DB::table('fin_payslip')->insertGetId([
            'uid' => $user2->id,
            'period_start' => '2024-08-01',
            'period_end' => '2024-08-15',
            'pay_date' => '2024-08-20',
            'earnings_net_pay' => 8000,
        ]);

        $this->actingAs($user1)->deleteJson("/api/payslips/{$payslipId}");

        // Payslip should still exist for user2
        $this->assertDatabaseHas('fin_payslip', [
            'payslip_id' => $payslipId,
            'deleted_at' => null,
        ]);
    }

    // -------------------------------------------------------------------------
    // POST /api/payslips/{payslip_id}/estimated-status
    // -------------------------------------------------------------------------

    public function test_update_estimated_status_requires_auth(): void
    {
        $response = $this->postJson('/api/payslips/1/estimated-status', ['ps_is_estimated' => true]);
        $response->assertStatus(401);
    }

    public function test_update_estimated_status_sets_flag(): void
    {
        $user = $this->createUser();
        $payslipId = DB::table('fin_payslip')->insertGetId([
            'uid' => $user->id,
            'period_start' => '2024-09-01',
            'period_end' => '2024-09-15',
            'pay_date' => '2024-09-20',
            'earnings_net_pay' => 5000,
            'ps_is_estimated' => 0,
        ]);

        $response = $this->actingAs($user)->postJson("/api/payslips/{$payslipId}/estimated-status", [
            'ps_is_estimated' => true,
        ]);

        $response->assertOk();
        $response->assertJson(['success' => true]);

        $this->assertDatabaseHas('fin_payslip', [
            'payslip_id' => $payslipId,
            'ps_is_estimated' => 1,
        ]);
    }

    public function test_update_estimated_status_rejects_missing_field(): void
    {
        $user = $this->createUser();
        $payslipId = DB::table('fin_payslip')->insertGetId([
            'uid' => $user->id,
            'period_start' => '2024-10-01',
            'period_end' => '2024-10-15',
            'pay_date' => '2024-10-20',
            'earnings_net_pay' => 5000,
        ]);

        $response = $this->actingAs($user)->postJson("/api/payslips/{$payslipId}/estimated-status", []);
        $response->assertStatus(422);
    }

    // -------------------------------------------------------------------------
    // GET /api/payslips/prompt
    // -------------------------------------------------------------------------

    public function test_get_prompt_requires_auth(): void
    {
        $response = $this->getJson('/api/payslips/prompt');
        $response->assertStatus(401);
    }

    public function test_get_prompt_returns_prompt_and_schema(): void
    {
        $user = $this->createUser();
        $response = $this->actingAs($user)->getJson('/api/payslips/prompt');
        $response->assertOk();
        $response->assertJsonStructure(['prompt', 'json_schema', 'form_label']);
        $this->assertNotEmpty($response->json('prompt'));
        $this->assertIsArray($response->json('json_schema'));
        $this->assertSame('Payslip', $response->json('form_label'));
    }

    // -------------------------------------------------------------------------
    // POST /api/payslips/bulk
    // -------------------------------------------------------------------------

    public function test_bulk_save_requires_auth(): void
    {
        $response = $this->postJson('/api/payslips/bulk', []);
        $response->assertStatus(401);
    }

    public function test_bulk_save_inserts_new_payslips(): void
    {
        $user = $this->createUser();

        $payload = [
            [
                'period_start' => '2025-01-01',
                'period_end' => '2025-01-15',
                'pay_date' => '2025-01-20',
                'earnings_gross' => 5000,
                'earnings_net_pay' => 4000,
            ],
            [
                'period_start' => '2025-02-01',
                'period_end' => '2025-02-15',
                'pay_date' => '2025-02-20',
                'earnings_gross' => 5200,
                'earnings_net_pay' => 4200,
            ],
        ];

        $response = $this->actingAs($user)->postJson('/api/payslips/bulk', $payload);
        $response->assertOk();
        $response->assertJson(['success' => true, 'saved' => 2]);

        $this->assertDatabaseHas('fin_payslip', [
            'uid' => $user->id,
            'pay_date' => '2025-01-20',
        ]);
        $this->assertDatabaseHas('fin_payslip', [
            'uid' => $user->id,
            'pay_date' => '2025-02-20',
        ]);
    }

    public function test_bulk_save_updates_existing_payslips(): void
    {
        $user = $this->createUser();

        $payslipId = DB::table('fin_payslip')->insertGetId([
            'uid' => $user->id,
            'period_start' => '2025-03-01',
            'period_end' => '2025-03-15',
            'pay_date' => '2025-03-20',
            'earnings_gross' => 5000,
        ]);

        $payload = [[
            'payslip_id' => $payslipId,
            'period_start' => '2025-03-01',
            'period_end' => '2025-03-15',
            'pay_date' => '2025-03-20',
            'earnings_gross' => 6000,
        ]];

        $response = $this->actingAs($user)->postJson('/api/payslips/bulk', $payload);
        $response->assertOk();
        $response->assertJson(['success' => true, 'saved' => 1]);

        $this->assertDatabaseHas('fin_payslip', [
            'payslip_id' => $payslipId,
            'earnings_gross' => 6000,
        ]);
    }

    public function test_bulk_save_rejects_invalid_items(): void
    {
        $user = $this->createUser();

        $payload = [[
            // Missing required period_start, period_end, pay_date
            'earnings_gross' => 5000,
        ]];

        $response = $this->actingAs($user)->postJson('/api/payslips/bulk', $payload);
        $response->assertStatus(422);
        $response->assertJsonStructure(['errors']);
    }

    public function test_bulk_save_rejects_non_array_body(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->postJson('/api/payslips/bulk', ['not' => 'an array of payslips']);
        $response->assertStatus(422);
    }

    public function test_bulk_save_does_not_affect_other_users(): void
    {
        $user1 = $this->createUser();
        $user2 = $this->createUser();

        $payslipId = DB::table('fin_payslip')->insertGetId([
            'uid' => $user2->id,
            'period_start' => '2025-04-01',
            'period_end' => '2025-04-15',
            'pay_date' => '2025-04-20',
            'earnings_gross' => 5000,
        ]);

        // user1 tries to update user2's payslip
        $payload = [[
            'payslip_id' => $payslipId,
            'period_start' => '2025-04-01',
            'period_end' => '2025-04-15',
            'pay_date' => '2025-04-20',
            'earnings_gross' => 9999,
        ]];

        // Should succeed (no error) but should not have updated the record
        $response = $this->actingAs($user1)->postJson('/api/payslips/bulk', $payload);
        $response->assertOk();
        // saved=0 because the WHERE uid check prevents update
        $response->assertJson(['saved' => 0]);

        // Record should still have original value
        $this->assertDatabaseHas('fin_payslip', [
            'payslip_id' => $payslipId,
            'earnings_gross' => 5000,
        ]);
    }
}
