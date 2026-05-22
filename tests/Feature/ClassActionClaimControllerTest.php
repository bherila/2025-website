<?php

namespace Tests\Feature;

use App\Models\ClassActionClaim;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\User;
use Tests\TestCase;

class ClassActionClaimControllerTest extends TestCase
{
    public function test_class_action_tracker_page_requires_auth(): void
    {
        $response = $this->get('/tools/class-action-tracker');

        $response->assertRedirect('/login');
    }

    public function test_user_can_create_update_list_and_delete_class_action_claim(): void
    {
        $user = $this->createUser();
        $transaction = $this->createTransactionForUser($user);

        $createResponse = $this->actingAs($user)->postJson('/api/class-action-claims', [
            'name' => 'Example Privacy Settlement',
            'claim_id' => '3GHJCKGF',
            'pin' => 'JRXCXP',
            'notification_received_on' => '2026-05-10',
            'notification_email_copy' => 'You may be eligible to file a claim.',
            'class_action_url' => 'https://example.test/settlement',
            'payment_election_submitted_on' => '2026-05-12',
            'claim_submitted_on' => '2026-05-15',
            'claim_deadline' => '2026-08-27',
            'administrator' => 'A.B. Data, Ltd.',
            'defendant' => 'Google LLC',
            'final_approval_hearing_on' => '2026-09-04',
            'expected_payment_amount' => 42.50,
            'expected_payment_on' => '2026-11-10',
            'actual_payment_amount' => 42.50,
            'payment_received' => true,
            'payment_received_on' => '2026-05-17',
            'payment_fin_transaction_id' => $transaction->t_id,
            'notes' => 'Selected ACH payment.',
        ]);

        $createResponse
            ->assertCreated()
            ->assertJsonPath('name', 'Example Privacy Settlement')
            ->assertJsonPath('claim_id', '3GHJCKGF')
            ->assertJsonPath('administrator', 'A.B. Data, Ltd.')
            ->assertJsonPath('claim_deadline', '2026-08-27')
            ->assertJsonPath('payment_received', true)
            ->assertJsonPath('payment_transaction.t_id', $transaction->t_id)
            ->assertJsonPath('payment_transaction.account_name', 'Settlement Checking');

        $claimId = $createResponse->json('id');

        $this->actingAs($user)->putJson("/api/class-action-claims/{$claimId}", [
            'name' => 'Example Privacy Settlement',
            'notification_received_on' => '2026-05-10',
            'notification_email_copy' => 'Updated notification copy.',
            'class_action_url' => 'https://example.test/settlement',
            'payment_election_submitted_on' => null,
            'claim_submitted_on' => null,
            'claim_deadline' => '2026-08-30',
            'administrator' => 'Epiq',
            'defendant' => 'Google LLC',
            'final_approval_hearing_on' => '2026-09-07',
            'expected_payment_amount' => 41.25,
            'expected_payment_on' => '2026-11-12',
            'actual_payment_amount' => null,
            'payment_received' => false,
            'payment_received_on' => '2026-05-17',
            'payment_fin_transaction_id' => $transaction->t_id,
            'notes' => 'Payment was entered by mistake.',
        ])
            ->assertOk()
            ->assertJsonPath('administrator', 'Epiq')
            ->assertJsonPath('claim_deadline', '2026-08-30')
            ->assertJsonPath('expected_payment_amount', 41.25)
            ->assertJsonPath('payment_received', false)
            ->assertJsonPath('payment_received_on', null)
            ->assertJsonPath('payment_fin_transaction_id', null);

        $this->actingAs($user)->getJson('/api/class-action-claims?q=3GHJCKGF')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.name', 'Example Privacy Settlement');

        $this->actingAs($user)->getJson('/api/class-action-claims?q=epiq')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.name', 'Example Privacy Settlement');

        $this->actingAs($user)->deleteJson("/api/class-action-claims/{$claimId}")
            ->assertOk()
            ->assertJsonPath('ok', true);

        $this->assertDatabaseMissing('class_action_claims', ['id' => $claimId]);
    }

    public function test_claims_are_scoped_to_the_authenticated_user(): void
    {
        $user = $this->createUser();
        $otherUser = $this->createUser();

        ClassActionClaim::factory()->for($user)->create(['name' => 'User Settlement']);
        $otherClaim = ClassActionClaim::factory()->for($otherUser)->create(['name' => 'Other Settlement']);

        $this->actingAs($user)->getJson('/api/class-action-claims')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.name', 'User Settlement');

        $this->actingAs($user)->getJson("/api/class-action-claims/{$otherClaim->id}")
            ->assertNotFound();
    }

    public function test_payment_transaction_must_belong_to_the_authenticated_user(): void
    {
        $user = $this->createUser();
        $otherUser = $this->createUser();
        $otherTransaction = $this->createTransactionForUser($otherUser);

        $this->actingAs($user)->postJson('/api/class-action-claims', [
            'name' => 'Other Transaction Settlement',
            'notification_received_on' => '2026-05-10',
            'payment_received' => true,
            'payment_fin_transaction_id' => $otherTransaction->t_id,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['payment_fin_transaction_id']);
    }

    public function test_class_action_claims_api_requires_auth(): void
    {
        $this->getJson('/api/class-action-claims')->assertUnauthorized();
    }

    private function createTransactionForUser(User $user): FinAccountLineItems
    {
        $this->actingAs($user);

        $account = FinAccounts::query()->create([
            'acct_name' => 'Settlement Checking',
        ]);

        return FinAccountLineItems::query()->create([
            't_account' => $account->acct_id,
            't_date' => '2026-05-17',
            't_amt' => 42.50,
            't_description' => 'Class action payment',
        ]);
    }
}
