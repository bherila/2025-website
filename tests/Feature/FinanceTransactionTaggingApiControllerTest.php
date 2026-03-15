<?php

namespace Tests\Feature;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLineItemTagMap;
use App\Models\FinanceTool\FinAccounts;
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

    public function test_get_user_tags_with_totals_returns_yearly_sums(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);

        $tag = FinAccountTag::create([
            'tag_userid' => $user->id,
            'tag_label' => 'Groceries',
            'tag_color' => 'orange',
        ]);

        $acct = FinAccounts::create([
            'acct_userid' => $user->id,
            'acct_name' => 'Checking',
            'acct_currency' => 'USD',
            'acct_type' => 'Asset',
        ]);

        $t1 = FinAccountLineItems::create([
            't_account' => $acct->acct_id,
            't_date' => '2023-06-15',
            't_amt' => -50.00,
            't_description' => 'Supermarket',
        ]);
        $t2 = FinAccountLineItems::create([
            't_account' => $acct->acct_id,
            't_date' => '2024-01-10',
            't_amt' => -75.00,
            't_description' => 'Supermarket 2',
        ]);

        FinAccountLineItemTagMap::create(['t_id' => $t1->t_id, 'tag_id' => $tag->tag_id]);
        FinAccountLineItemTagMap::create(['t_id' => $t2->t_id, 'tag_id' => $tag->tag_id]);

        $response = $this->actingAs($user)->getJson('/api/finance/tags?totals=true');

        $response
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    ['tag_id', 'tag_label', 'tag_color', 'totals'],
                ],
            ])
            ->assertJsonPath('data.0.tag_label', 'Groceries');

        $totals = $response->json('data.0.totals');
        $this->assertArrayHasKey('2023', $totals);
        $this->assertArrayHasKey('2024', $totals);
        $this->assertArrayHasKey('all', $totals);
        $this->assertEqualsWithDelta(-50.00, $totals['2023'], 0.001);
        $this->assertEqualsWithDelta(-75.00, $totals['2024'], 0.001);
        $this->assertEqualsWithDelta(-125.00, $totals['all'], 0.001);
    }

    public function test_get_user_tags_totals_excludes_soft_deleted_mappings(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);

        $tag = FinAccountTag::create([
            'tag_userid' => $user->id,
            'tag_label' => 'Shopping',
            'tag_color' => 'blue',
        ]);

        $acct = FinAccounts::create([
            'acct_userid' => $user->id,
            'acct_name' => 'Checking2',
            'acct_currency' => 'USD',
            'acct_type' => 'Asset',
        ]);

        $t1 = FinAccountLineItems::create([
            't_account' => $acct->acct_id,
            't_date' => '2023-03-01',
            't_amt' => -100.00,
            't_description' => 'Store A',
        ]);
        $t2 = FinAccountLineItems::create([
            't_account' => $acct->acct_id,
            't_date' => '2023-04-01',
            't_amt' => -200.00,
            't_description' => 'Store B (soft-deleted mapping)',
        ]);

        FinAccountLineItemTagMap::create(['t_id' => $t1->t_id, 'tag_id' => $tag->tag_id]);
        FinAccountLineItemTagMap::create([
            't_id' => $t2->t_id,
            'tag_id' => $tag->tag_id,
            'when_deleted' => now(),
        ]);

        $response = $this->actingAs($user)->getJson('/api/finance/tags?totals=true');

        $response->assertOk();
        $totals = $response->json('data.0.totals');
        // Only the non-deleted mapping should count
        $this->assertEqualsWithDelta(-100.00, $totals['all'], 0.001);
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
        $acct = FinAccounts::create([
            'acct_userid' => $user->id,
            'acct_name' => 'Test Account',
            'acct_currency' => 'USD',
            'acct_type' => 'Asset',
        ]);
        $t = FinAccountLineItems::create([
            't_account' => $acct->acct_id,
            't_date' => '2023-01-01',
            't_amt' => 100,
            't_description' => 'Test',
        ]);

        $response = $this->postJson('/api/finance/tags/apply', [
            'tag_id' => $tag->tag_id,
            'transaction_ids' => (string) $t->t_id,
        ]);

        $response->assertOk()->assertJson(['success' => true]);

        // Verify the tag mapping was created
        $this->assertDatabaseHas('fin_account_line_item_tag_map', [
            't_id' => $t->t_id,
            'tag_id' => $tag->tag_id,
        ]);
    }

    public function test_apply_tag_creates_mapping_for_multiple_transactions(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);

        $tag = FinAccountTag::create([
            'tag_userid' => $user->id,
            'tag_label' => 'Multi',
            'tag_color' => 'green',
        ]);

        $acct = FinAccounts::create([
            'acct_userid' => $user->id,
            'acct_name' => 'Multi Account',
            'acct_currency' => 'USD',
            'acct_type' => 'Asset',
        ]);
        $t1 = FinAccountLineItems::create([
            't_account' => $acct->acct_id,
            't_date' => '2023-01-01',
            't_amt' => 100,
            't_description' => 'T1',
        ]);
        $t2 = FinAccountLineItems::create([
            't_account' => $acct->acct_id,
            't_date' => '2023-01-02',
            't_amt' => 200,
            't_description' => 'T2',
        ]);

        $response = $this->postJson('/api/finance/tags/apply', [
            'tag_id' => $tag->tag_id,
            'transaction_ids' => "{$t1->t_id},{$t2->t_id}",
        ]);

        $response->assertOk()->assertJson(['success' => true]);

        $this->assertDatabaseHas('fin_account_line_item_tag_map', ['t_id' => $t1->t_id, 'tag_id' => $tag->tag_id]);
        $this->assertDatabaseHas('fin_account_line_item_tag_map', ['t_id' => $t2->t_id, 'tag_id' => $tag->tag_id]);
    }

    public function test_apply_tag_returns_404_for_tag_belonging_to_another_user(): void
    {
        $user = $this->createUser();
        $otherUser = $this->createUser();

        $tag = FinAccountTag::create([
            'tag_userid' => $otherUser->id,
            'tag_label' => 'Other',
            'tag_color' => 'red',
        ]);

        $response = $this->actingAs($user)->postJson('/api/finance/tags/apply', [
            'tag_id' => $tag->tag_id,
            'transaction_ids' => '999',
        ]);

        $response->assertStatus(404);
    }

    public function test_delete_tag_soft_deletes_and_removes_mappings(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);

        $tag = FinAccountTag::create([
            'tag_userid' => $user->id,
            'tag_label' => 'ToDelete',
            'tag_color' => 'gray',
        ]);

        $acct = FinAccounts::create([
            'acct_userid' => $user->id,
            'acct_name' => 'Del Account',
            'acct_currency' => 'USD',
            'acct_type' => 'Asset',
        ]);
        $t = FinAccountLineItems::create([
            't_account' => $acct->acct_id,
            't_date' => '2023-01-01',
            't_amt' => 50,
            't_description' => 'Del Trans',
        ]);
        FinAccountLineItemTagMap::create(['t_id' => $t->t_id, 'tag_id' => $tag->tag_id]);

        $response = $this->actingAs($user)->deleteJson("/api/finance/tags/{$tag->tag_id}");

        $response->assertOk()->assertJson(['success' => true]);

        // Tag should be soft-deleted (when_deleted is set)
        $this->assertNotNull(FinAccountTag::find($tag->tag_id)->when_deleted);

        // Tag mapping should also be soft-deleted
        $this->assertNotNull(
            FinAccountLineItemTagMap::where('t_id', $t->t_id)
                ->where('tag_id', $tag->tag_id)
                ->first()
                ->when_deleted
        );
    }

    public function test_apply_tag_route_not_found_on_get(): void
    {
        $user = $this->createUser();
        $response = $this->actingAs($user)->getJson('/api/finance/tags/apply');

        // Should be 405 Method Not Allowed if route exists
        $response->assertStatus(405);
    }

    public function test_remove_tags_from_transactions(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);

        $tag1 = FinAccountTag::create(['tag_userid' => $user->id, 'tag_label' => 'Tag1', 'tag_color' => 'blue']);
        $tag2 = FinAccountTag::create(['tag_userid' => $user->id, 'tag_label' => 'Tag2', 'tag_color' => 'red']);

        $acct = FinAccounts::create([
            'acct_userid' => $user->id,
            'acct_name' => 'Test Account',
            'acct_currency' => 'USD',
            'acct_type' => 'Asset',
        ]);
        $t = FinAccountLineItems::create([
            't_account' => $acct->acct_id,
            't_date' => '2024-01-01',
            't_amt' => -100,
            't_description' => 'Test',
        ]);

        FinAccountLineItemTagMap::create(['t_id' => $t->t_id, 'tag_id' => $tag1->tag_id]);
        FinAccountLineItemTagMap::create(['t_id' => $t->t_id, 'tag_id' => $tag2->tag_id]);

        $response = $this->postJson('/api/finance/tags/remove', [
            'transaction_ids' => (string) $t->t_id,
        ]);

        $response->assertOk()->assertJson(['success' => true]);

        // Both tag mappings should be soft-deleted
        $this->assertNotNull(
            FinAccountLineItemTagMap::where('t_id', $t->t_id)->where('tag_id', $tag1->tag_id)->first()->when_deleted
        );
        $this->assertNotNull(
            FinAccountLineItemTagMap::where('t_id', $t->t_id)->where('tag_id', $tag2->tag_id)->first()->when_deleted
        );
    }

    public function test_remove_tags_only_affects_own_tags(): void
    {
        $user = $this->createUser();
        $otherUser = $this->createUser();

        $userTag = FinAccountTag::create(['tag_userid' => $user->id, 'tag_label' => 'Mine', 'tag_color' => 'blue']);
        $otherTag = FinAccountTag::create(['tag_userid' => $otherUser->id, 'tag_label' => 'Others', 'tag_color' => 'red']);

        $this->actingAs($user);
        $acct = FinAccounts::create([
            'acct_name' => 'Shared Account',
            'acct_currency' => 'USD',
            'acct_type' => 'Asset',
        ]);
        $t = FinAccountLineItems::create([
            't_account' => $acct->acct_id,
            't_date' => '2024-01-01',
            't_amt' => -50,
        ]);

        FinAccountLineItemTagMap::create(['t_id' => $t->t_id, 'tag_id' => $userTag->tag_id]);
        FinAccountLineItemTagMap::create(['t_id' => $t->t_id, 'tag_id' => $otherTag->tag_id]);

        $this->postJson('/api/finance/tags/remove', [
            'transaction_ids' => (string) $t->t_id,
        ]);

        // User's tag should be soft-deleted
        $this->assertNotNull(
            FinAccountLineItemTagMap::where('t_id', $t->t_id)->where('tag_id', $userTag->tag_id)->first()->when_deleted
        );
        // Other user's tag should NOT be soft-deleted
        $this->assertNull(
            FinAccountLineItemTagMap::where('t_id', $t->t_id)->where('tag_id', $otherTag->tag_id)->first()->when_deleted
        );
    }
}
