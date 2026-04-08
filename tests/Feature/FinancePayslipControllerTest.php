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
        $response->assertJsonStructure(['prompt', 'tools', 'tool_choice', 'form_label']);
        $this->assertNotEmpty($response->json('prompt'));
        $this->assertIsArray($response->json('tools'));
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
        $response->assertJsonFragment(['error' => 'Request body must be a JSON array of payslips.']);
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

    // -------------------------------------------------------------------------
    // GET /api/payslips/prompt — Claude tool calling format
    // -------------------------------------------------------------------------

    public function test_get_prompt_returns_tools_array(): void
    {
        $user = $this->createUser();
        $response = $this->actingAs($user)->getJson('/api/payslips/prompt');
        $response->assertOk();
        $response->assertJsonStructure(['prompt', 'tools', 'tool_choice', 'form_label']);
        $this->assertNotEmpty($response->json('prompt'));
        $this->assertIsArray($response->json('tools'));
        $this->assertCount(1, $response->json('tools'));
        $this->assertSame('extract_payslip', $response->json('tools.0.name'));
        $this->assertSame('Payslip', $response->json('form_label'));
    }

    public function test_get_prompt_tool_has_state_data_array(): void
    {
        $user = $this->createUser();
        $response = $this->actingAs($user)->getJson('/api/payslips/prompt');
        $response->assertOk();

        $properties = $response->json('tools.0.input_schema.properties');
        $this->assertArrayHasKey('state_data', $properties);
        $this->assertSame('array', $properties['state_data']['type']);
    }

    public function test_get_prompt_tool_does_not_have_flat_state_columns(): void
    {
        $user = $this->createUser();
        $response = $this->actingAs($user)->getJson('/api/payslips/prompt');
        $response->assertOk();

        $properties = $response->json('tools.0.input_schema.properties');
        $this->assertArrayNotHasKey('ps_state_tax', $properties);
        $this->assertArrayNotHasKey('ps_state_tax_addl', $properties);
        $this->assertArrayNotHasKey('ps_state_disability', $properties);
    }

    // -------------------------------------------------------------------------
    // New fields accepted by savePayslip
    // -------------------------------------------------------------------------

    public function test_save_payslip_accepts_new_fields(): void
    {
        $user = $this->createUser();
        $response = $this->actingAs($user)->postJson('/api/payslips', [
            'period_start' => '2025-06-01',
            'period_end' => '2025-06-15',
            'pay_date' => '2025-06-20',
            'earnings_net_pay' => 7000,
            'earnings_dividend_equivalent' => 569.70,
            'ps_rsu_tax_offset' => 213418.91,
            'ps_rsu_excess_refund' => 1543.81,
            'taxable_wages_oasdi' => 10609.55,
            'taxable_wages_medicare' => 10609.55,
            'taxable_wages_federal' => 7940.83,
            'imp_life_choice' => 12.80,
            'pto_accrued' => 6.47,
            'pto_used' => 8.0,
            'pto_available' => 235.17,
            'pto_statutory_available' => 72.0,
            'hours_worked' => 80.0,
        ]);

        $response->assertOk();
        $response->assertJson(['success' => true]);

        $this->assertDatabaseHas('fin_payslip', [
            'uid' => $user->id,
            'pay_date' => '2025-06-20',
        ]);
    }

    public function test_save_payslip_stores_and_returns_other_as_json(): void
    {
        $user = $this->createUser();
        $response = $this->actingAs($user)->postJson('/api/payslips', [
            'period_start' => '2025-07-01',
            'period_end' => '2025-07-15',
            'pay_date' => '2025-07-20',
            'earnings_net_pay' => 5000,
            'other' => ['custom_field' => 'value', 'amount' => 42],
        ]);

        $response->assertOk();

        $payslipId = DB::table('fin_payslip')
            ->where('uid', $user->id)
            ->where('pay_date', '2025-07-20')
            ->value('payslip_id');

        $fetchResponse = $this->actingAs($user)->getJson("/api/payslips/{$payslipId}");
        $fetchResponse->assertOk();

        // The other field should be returned as a JSON object (not a string)
        $other = $fetchResponse->json('other');
        $this->assertIsArray($other);
        $this->assertSame('value', $other['custom_field']);
        $this->assertSame(42, $other['amount']);
    }

    // -------------------------------------------------------------------------
    // Deposit CRUD — /api/payslips/{id}/deposits
    // -------------------------------------------------------------------------

    public function test_fetch_deposits_requires_auth(): void
    {
        $response = $this->getJson('/api/payslips/1/deposits');
        $response->assertStatus(401);
    }

    public function test_save_deposit_and_fetch(): void
    {
        $user = $this->createUser();
        $payslipId = DB::table('fin_payslip')->insertGetId([
            'uid' => $user->id,
            'period_start' => '2025-08-01',
            'period_end' => '2025-08-15',
            'pay_date' => '2025-08-20',
            'earnings_net_pay' => 7000,
        ]);

        $response = $this->actingAs($user)->postJson("/api/payslips/{$payslipId}/deposits", [
            'bank_name' => 'Chase',
            'account_last4' => '1234',
            'amount' => 7000,
        ]);
        $response->assertOk();
        $response->assertJson(['success' => true]);

        $fetchResponse = $this->actingAs($user)->getJson("/api/payslips/{$payslipId}/deposits");
        $fetchResponse->assertOk();
        $this->assertCount(1, $fetchResponse->json());
        $this->assertSame('Chase', $fetchResponse->json('0.bank_name'));
    }

    public function test_delete_deposit(): void
    {
        $user = $this->createUser();
        $payslipId = DB::table('fin_payslip')->insertGetId([
            'uid' => $user->id,
            'period_start' => '2025-09-01',
            'period_end' => '2025-09-15',
            'pay_date' => '2025-09-20',
            'earnings_net_pay' => 5000,
        ]);

        $depositId = DB::table('fin_payslip_deposits')->insertGetId([
            'payslip_id' => $payslipId,
            'bank_name' => 'BofA',
            'account_last4' => '5678',
            'amount' => 5000,
        ]);

        $response = $this->actingAs($user)->deleteJson("/api/payslips/{$payslipId}/deposits/{$depositId}");
        $response->assertOk();
        $response->assertJson(['success' => true]);

        $this->assertDatabaseMissing('fin_payslip_deposits', ['id' => $depositId]);
    }

    public function test_deposit_cascade_deleted_with_payslip(): void
    {
        $user = $this->createUser();
        $payslipId = DB::table('fin_payslip')->insertGetId([
            'uid' => $user->id,
            'period_start' => '2025-10-01',
            'period_end' => '2025-10-15',
            'pay_date' => '2025-10-20',
            'earnings_net_pay' => 5000,
        ]);

        DB::table('fin_payslip_deposits')->insert([
            'payslip_id' => $payslipId,
            'bank_name' => 'Wells Fargo',
            'account_last4' => '9012',
            'amount' => 5000,
        ]);

        $this->actingAs($user)->deleteJson("/api/payslips/{$payslipId}");

        $this->assertDatabaseMissing('fin_payslip_deposits', ['payslip_id' => $payslipId]);
    }

    // -------------------------------------------------------------------------
    // State data CRUD — /api/payslips/{id}/state-data
    // -------------------------------------------------------------------------

    public function test_fetch_state_data_requires_auth(): void
    {
        $response = $this->getJson('/api/payslips/1/state-data');
        $response->assertStatus(401);
    }

    public function test_save_state_data_and_fetch(): void
    {
        $user = $this->createUser();
        $payslipId = DB::table('fin_payslip')->insertGetId([
            'uid' => $user->id,
            'period_start' => '2025-11-01',
            'period_end' => '2025-11-15',
            'pay_date' => '2025-11-20',
            'earnings_net_pay' => 6000,
        ]);

        $response = $this->actingAs($user)->postJson("/api/payslips/{$payslipId}/state-data", [
            'state_code' => 'CA',
            'taxable_wages' => 10000,
            'state_tax' => 800,
            'state_tax_addl' => 50,
            'state_disability' => 100,
        ]);
        $response->assertOk();
        $response->assertJson(['success' => true]);

        $fetchResponse = $this->actingAs($user)->getJson("/api/payslips/{$payslipId}/state-data");
        $fetchResponse->assertOk();
        $this->assertCount(1, $fetchResponse->json());
        $this->assertSame('CA', $fetchResponse->json('0.state_code'));
        $this->assertEquals(800, $fetchResponse->json('0.state_tax'));
    }

    public function test_state_data_cascade_deleted_with_payslip(): void
    {
        $user = $this->createUser();
        $payslipId = DB::table('fin_payslip')->insertGetId([
            'uid' => $user->id,
            'period_start' => '2025-12-01',
            'period_end' => '2025-12-15',
            'pay_date' => '2025-12-20',
            'earnings_net_pay' => 6000,
        ]);

        DB::table('fin_payslip_state_data')->insert([
            'payslip_id' => $payslipId,
            'state_code' => 'CA',
            'state_tax' => 800,
        ]);

        $this->actingAs($user)->deleteJson("/api/payslips/{$payslipId}");

        $this->assertDatabaseMissing('fin_payslip_state_data', ['payslip_id' => $payslipId]);
    }

    public function test_payslip_response_includes_state_data_and_deposits(): void
    {
        $user = $this->createUser();
        $payslipId = DB::table('fin_payslip')->insertGetId([
            'uid' => $user->id,
            'period_start' => '2026-01-01',
            'period_end' => '2026-01-15',
            'pay_date' => '2026-01-20',
            'earnings_net_pay' => 7000,
        ]);

        DB::table('fin_payslip_state_data')->insert([
            'payslip_id' => $payslipId,
            'state_code' => 'CA',
            'state_tax' => 900,
        ]);

        DB::table('fin_payslip_deposits')->insert([
            'payslip_id' => $payslipId,
            'bank_name' => 'Citibank',
            'account_last4' => '3456',
            'amount' => 7000,
        ]);

        $response = $this->actingAs($user)->getJson("/api/payslips/{$payslipId}");
        $response->assertOk();
        $response->assertJsonStructure(['state_data', 'deposits']);
        $this->assertNotEmpty($response->json('state_data'));
        $this->assertNotEmpty($response->json('deposits'));
        $this->assertSame('CA', $response->json('state_data.0.state_code'));
        $this->assertSame('Citibank', $response->json('deposits.0.bank_name'));
    }
}
