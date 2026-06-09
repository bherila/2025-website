<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Models\User;
use App\Services\Finance\DocumentIngestionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccountSuggestControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_suggests_ranked_accounts_for_owned_document_link(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $matching = $this->createAccount($user, 'Vanguard Taxable Brokerage', 'XX-1234');
        $other = $this->createAccount($user, 'Household Checking', '7777');
        $closed = $this->createAccount($user, 'Closed Vanguard Account', '1234', now()->subMonth()->toDateString());
        $otherUserAccount = $this->createAccount(User::factory()->create(), 'Vanguard Taxable Brokerage', 'XX-1234');

        $document = $this->createTaxDocument($user, [
            'parsed_data' => ['payer_name' => 'Vanguard Brokerage Services'],
        ]);
        $link = TaxDocumentAccount::createLink(
            (int) $document->id,
            null,
            '1099_b',
            2024,
            aiIdentifier: 'account 1234',
            aiAccountName: 'Vanguard Taxable',
        );

        $response = $this->getJson("/api/finance/accounts/suggest?document_id={$document->document_id}&link_id={$link->id}");

        $response->assertOk()
            ->assertJsonPath('hints.ai_identifier', 'account 1234')
            ->assertJsonPath('suggestions.0.account.acct_id', $matching->acct_id)
            ->assertJsonPath('similar_links.0.id', $link->id);

        $suggestionIds = collect($response->json('suggestions'))->pluck('account.acct_id')->all();
        $this->assertContains($other->acct_id, $suggestionIds);
        $this->assertNotContains($closed->acct_id, $suggestionIds);
        $this->assertNotContains($otherUserAccount->acct_id, $suggestionIds);
        $this->assertContains('Account number matches', $response->json('suggestions.0.reasons'));
    }

    public function test_suggestions_can_include_closed_accounts(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $closed = $this->createAccount($user, 'Closed Brokerage', '9999', now()->subMonth()->toDateString());
        $document = $this->createTaxDocument($user);
        $link = TaxDocumentAccount::createLink((int) $document->id, null, '1099_b', 2024, aiIdentifier: '9999');

        $response = $this->getJson("/api/finance/accounts/suggest?document_id={$document->document_id}&link_id={$link->id}&include_closed=1");

        $response->assertOk();
        $closedSuggestion = collect($response->json('suggestions'))
            ->firstWhere('account.acct_id', $closed->acct_id);

        $this->assertIsArray($closedSuggestion);
        $this->assertTrue($closedSuggestion['is_closed']);
    }

    public function test_suggest_endpoint_rejects_links_from_another_user(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $this->grantAllFeatures($other);
        $document = $this->createTaxDocument($owner);
        $link = TaxDocumentAccount::createLink((int) $document->id, null, '1099_b', 2024, aiIdentifier: '1234');

        $response = $this->actingAs($other)
            ->getJson("/api/finance/accounts/suggest?document_id={$document->document_id}&link_id={$link->id}");

        $response->assertNotFound();
    }

    public function test_bulk_update_assigns_owned_account_to_multiple_document_links(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $account = $this->createAccount($user, 'Fidelity Taxable', '3210');
        $document = $this->createTaxDocument($user);
        $firstLink = TaxDocumentAccount::createLink((int) $document->id, null, '1099_b', 2024, aiIdentifier: '3210');
        $secondLink = TaxDocumentAccount::createLink((int) $document->id, null, '1099_b', 2024, aiIdentifier: '3210');

        $response = $this->postJson("/api/finance/tax-documents/{$document->id}/accounts/bulk-update", [
            'links' => [
                ['link_id' => $firstLink->id, 'account_id' => $account->acct_id, 'is_reviewed' => true],
                ['link_id' => $secondLink->id, 'account_id' => $account->acct_id, 'is_reviewed' => true],
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('affected_link_ids.0', $firstLink->id)
            ->assertJsonPath('affected_link_ids.1', $secondLink->id)
            ->assertJsonPath('links.0.account.acct_id', $account->acct_id);

        $this->assertDatabaseHas('fin_document_accounts', [
            'id' => $firstLink->id,
            'account_id' => $account->acct_id,
            'is_reviewed' => 1,
        ]);
        $this->assertDatabaseHas('fin_document_accounts', [
            'id' => $secondLink->id,
            'account_id' => $account->acct_id,
            'is_reviewed' => 1,
        ]);
    }

    public function test_bulk_update_rejects_accounts_from_another_user(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $otherUserAccount = $this->createAccount(User::factory()->create(), 'Other Brokerage', '1234');
        $document = $this->createTaxDocument($user);
        $link = TaxDocumentAccount::createLink((int) $document->id, null, '1099_b', 2024);

        $response = $this->postJson("/api/finance/tax-documents/{$document->id}/accounts/bulk-update", [
            'links' => [
                ['link_id' => $link->id, 'account_id' => $otherUserAccount->acct_id],
            ],
        ]);

        $response->assertNotFound();

        $this->assertDatabaseHas('fin_document_accounts', [
            'id' => $link->id,
            'account_id' => null,
        ]);
    }

    private function createAccount(User $user, string $name, ?string $number = null, ?string $closedAt = null): FinAccounts
    {
        return FinAccounts::withoutEvents(function () use ($user, $name, $number, $closedAt): FinAccounts {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $user->id,
                'acct_name' => $name,
                'acct_number' => $number,
                'acct_last_balance' => '0',
                'when_closed' => $closedAt,
            ]);
        });
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createTaxDocument(User $user, array $overrides = []): FileForTaxDocument
    {
        return app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $user->id,
            'tax_year' => 2024,
            'form_type' => 'broker_1099',
            'original_filename' => 'brokerage-1099.pdf',
            'file_path' => '/tmp/brokerage-1099.pdf',
            'file_size_bytes' => 1000,
            'file_hash' => md5('brokerage-1099-'.$user->id.'-'.uniqid()),
            'genai_status' => 'parsed',
            'is_reviewed' => false,
            ...$overrides,
        ]);

    }
}
