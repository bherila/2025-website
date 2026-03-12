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
}
