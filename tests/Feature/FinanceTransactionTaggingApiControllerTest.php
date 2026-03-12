<?php

namespace Tests\Feature;

use App\Models\FinanceTool\FinAccountTag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinanceTransactionTaggingApiControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_get_user_tags_returns_data_envelope(): void
    {
        $user = $this->createUser();
        $otherUser = $this->createUser();

        FinAccountTag::create([
            'tag_userid' => $user->id,
            'tag_label' => 'Food',
            'tag_color' => 'blue',
        ]);

        FinAccountTag::create([
            'tag_userid' => $otherUser->id,
            'tag_label' => 'Other User Tag',
            'tag_color' => 'red',
        ]);

        $response = $this->actingAs($user)->getJson('/api/finance/tags');

        $response
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    ['tag_id', 'tag_label', 'tag_color'],
                ],
            ])
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.tag_label', 'Food');
    }

    public function test_get_user_tags_with_counts_returns_data_envelope(): void
    {
        $user = $this->createUser();

        FinAccountTag::create([
            'tag_userid' => $user->id,
            'tag_label' => 'Travel',
            'tag_color' => 'green',
        ]);

        $response = $this->actingAs($user)->getJson('/api/finance/tags?include_counts=true');

        $response
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    ['tag_id', 'tag_label', 'tag_color', 'transaction_count'],
                ],
            ])
            ->assertJsonPath('data.0.tag_label', 'Travel')
            ->assertJsonPath('data.0.transaction_count', 0);
    }

    public function test_apply_tag_to_transactions(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);

        $tag = FinAccountTag::create([
            'tag_userid' => $user->id,
            'tag_label' => 'Work',
            'tag_color' => 'blue',
        ]);

        // Creating dummy transaction IDs since we just want to test if the route is found
        // and validation passes. We don't necessarily need real transaction records
        // for testing if it reaches the controller and finds the tag.
        // Wait, the controller calls updateOrCreate, which might fail on FKs.
        // Let's create a real transaction.
        $acct = \App\Models\FinanceTool\FinAccounts::create([
            'acct_userid' => $user->id,
            'acct_name' => 'Test Account',
            'acct_currency' => 'USD',
            'acct_type' => 'Asset',
        ]);
        $t = \App\Models\FinanceTool\FinAccountLineItems::create([
            't_account' => $acct->acct_id,
            't_date' => '2023-01-01',
            't_amt' => 100,
            't_description' => 'Test',
        ]);

        $response = $this->postJson('/api/finance/tags-apply', [
            'tag_id' => $tag->tag_id,
            'transaction_ids' => (string)$t->t_id,
        ]);

        $response->assertOk()->assertJson(['success' => true]);
    }

    public function test_apply_tag_route_not_found_on_get(): void
    {
        $user = $this->createUser();
        $response = $this->actingAs($user)->getJson('/api/finance/tags-apply');
        
        // Should be 405 Method Not Allowed if route exists, 404 if not found at all
        $response->assertStatus(405);
    }
}
