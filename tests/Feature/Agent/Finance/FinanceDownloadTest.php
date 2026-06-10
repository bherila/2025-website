<?php

namespace Tests\Feature\Agent\Finance;

use App\Http\Controllers\Agent\Finance\FinanceDownloadController;
use App\Http\Middleware\AuthenticateAgentRequest;
use App\Http\Middleware\NegotiatesAgentPayload;
use App\Models\AgentApiToken;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinDocument;
use App\Models\User;
use App\Services\FileStorageService;
use App\Support\Agent\AgentTokenService;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class FinanceDownloadTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // User ID 1 is always treated as admin; occupy it so the users under
        // test are genuinely non-admin.
        $this->createAdminUser();

        // Mirror the routes/agent.php chokepoint registration (the vertical
        // branch does not edit shared route files; the integrator wires the
        // identical block into routes/agent.php).
        Route::prefix('api/agent/v1')->name('agent.')->middleware([NegotiatesAgentPayload::class])->group(function (): void {
            Route::middleware([AuthenticateAgentRequest::class])->prefix('finance')->name('finance.')->group(function (): void {
                Route::get('/tax-documents/{id}/download-url', [FinanceDownloadController::class, 'taxDocumentDownloadUrl'])
                    ->whereNumber('id')
                    ->middleware('feature:finance.tax-documents.view')
                    ->name('tax-documents.download-url');
                Route::get('/documents/{id}/download-url', [FinanceDownloadController::class, 'documentDownloadUrl'])
                    ->whereNumber('id')
                    ->middleware('feature:finance.accounts.detail')
                    ->name('documents.download-url');
            });
        });
    }

    /** @return array{user: User, token: string} */
    private function createUserWithToken(array $permissions, string $module = 'finance'): array
    {
        $user = $this->grantFeatures($this->createUser(), $permissions);
        $result = app(AgentTokenService::class)->createQuickSetupToken($user, $module, null);

        return ['user' => $user, 'token' => $result['token']];
    }

    /** @return array<string, string> */
    private function bearer(string $token): array
    {
        return ['Authorization' => 'Bearer '.$token];
    }

    private function makeTaxDocument(User $user, array $overrides = []): FileForTaxDocument
    {
        return FileForTaxDocument::create(array_merge([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'form_type' => 'w2',
            'original_filename' => 'w2.pdf',
            'stored_filename' => 'stored-w2.pdf',
            's3_path' => "tax_docs/{$user->id}/stored-w2.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 100,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $user->id,
            'is_reviewed' => true,
        ], $overrides));
    }

    private function makeFinDocument(User $user, array $overrides = []): FinDocument
    {
        return FinDocument::create(array_merge([
            'user_id' => $user->id,
            'document_kind' => FinDocument::KIND_STATEMENT,
            'original_filename' => 'statement.pdf',
            'mime_type' => 'application/pdf',
            's3_path' => "fin_documents/{$user->id}/statement/stored-statement.pdf",
        ], $overrides));
    }

    private function mockSignedUrls(): void
    {
        $this->mock(FileStorageService::class, function ($mock): void {
            $mock->shouldReceive('getSignedDownloadUrl')
                ->once()
                ->andReturn('https://s3.example.com/download');
            $mock->shouldReceive('getSignedViewUrl')
                ->once()
                ->andReturn('https://s3.example.com/view');
        });
    }

    public function test_download_url_endpoints_require_token(): void
    {
        $this->getJson('/api/agent/v1/finance/tax-documents/1/download-url')->assertStatus(401);
        $this->getJson('/api/agent/v1/finance/documents/1/download-url')->assertStatus(401);
    }

    public function test_tax_document_download_url_returns_signed_urls(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.tax-documents.view']);
        $doc = $this->makeTaxDocument($user);

        $this->mockSignedUrls();

        $this->getJson("/api/agent/v1/finance/tax-documents/{$doc->id}/download-url", $this->bearer($token))
            ->assertOk()
            ->assertJson([
                'download_url' => 'https://s3.example.com/download',
                'view_url' => 'https://s3.example.com/view',
                'expires_in_seconds' => 3600,
                'filename' => 'w2.pdf',
                'content_type' => 'application/pdf',
            ]);

        $this->assertNotEmpty($doc->fresh()->download_history);
    }

    public function test_tax_document_download_url_is_owner_scoped(): void
    {
        ['token' => $token] = $this->createUserWithToken(['finance.tax-documents.view']);
        $otherUser = $this->createUser();
        $foreignDoc = $this->makeTaxDocument($otherUser);

        $this->mock(FileStorageService::class, function ($mock): void {
            $mock->shouldNotReceive('getSignedDownloadUrl');
            $mock->shouldNotReceive('getSignedViewUrl');
        });

        $this->getJson("/api/agent/v1/finance/tax-documents/{$foreignDoc->id}/download-url", $this->bearer($token))
            ->assertStatus(404);
    }

    public function test_tax_document_without_file_returns_404(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.tax-documents.view']);
        $doc = $this->makeTaxDocument($user, ['s3_path' => null]);

        $this->getJson("/api/agent/v1/finance/tax-documents/{$doc->id}/download-url", $this->bearer($token))
            ->assertStatus(404)
            ->assertJsonPath('message', 'No file associated with this document.');
    }

    public function test_tax_document_download_url_requires_permission(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.accounts.detail']);
        $doc = $this->makeTaxDocument($user);

        $this->getJson("/api/agent/v1/finance/tax-documents/{$doc->id}/download-url", $this->bearer($token))
            ->assertStatus(403);
    }

    public function test_token_scope_restricts_tax_document_download(): void
    {
        $user = $this->grantFeatures($this->createUser(), ['finance.tax-documents.view']);
        $doc = $this->makeTaxDocument($user);

        $rawToken = 'bha_'.bin2hex(random_bytes(32));
        AgentApiToken::factory()->create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $rawToken),
            'allowed_permissions' => ['finance.access'],
        ]);

        $this->getJson("/api/agent/v1/finance/tax-documents/{$doc->id}/download-url", $this->bearer($rawToken))
            ->assertStatus(403);
    }

    public function test_fin_document_download_url_returns_signed_urls(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.accounts.detail']);
        $doc = $this->makeFinDocument($user);

        $this->mockSignedUrls();

        $this->getJson("/api/agent/v1/finance/documents/{$doc->id}/download-url", $this->bearer($token))
            ->assertOk()
            ->assertJson([
                'download_url' => 'https://s3.example.com/download',
                'view_url' => 'https://s3.example.com/view',
                'expires_in_seconds' => 3600,
                'filename' => 'statement.pdf',
                'content_type' => 'application/pdf',
            ]);
    }

    public function test_fin_document_download_url_is_owner_scoped(): void
    {
        ['token' => $token] = $this->createUserWithToken(['finance.accounts.detail']);
        $otherUser = $this->createUser();
        $foreignDoc = $this->makeFinDocument($otherUser);

        $this->getJson("/api/agent/v1/finance/documents/{$foreignDoc->id}/download-url", $this->bearer($token))
            ->assertStatus(404);
    }

    public function test_fin_document_with_invalid_s3_prefix_returns_404(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.accounts.detail']);
        $otherUser = $this->createUser();
        $doc = $this->makeFinDocument($user, [
            's3_path' => "fin_documents/{$otherUser->id}/statement/stolen.pdf",
        ]);

        $this->mock(FileStorageService::class, function ($mock): void {
            $mock->shouldNotReceive('getSignedDownloadUrl');
            $mock->shouldNotReceive('getSignedViewUrl');
        });

        $this->getJson("/api/agent/v1/finance/documents/{$doc->id}/download-url", $this->bearer($token))
            ->assertStatus(404);
    }

    public function test_fin_document_without_file_returns_404(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.accounts.detail']);
        $doc = $this->makeFinDocument($user, ['s3_path' => null]);

        $this->getJson("/api/agent/v1/finance/documents/{$doc->id}/download-url", $this->bearer($token))
            ->assertStatus(404)
            ->assertJsonPath('message', 'No file associated with this document.');
    }

    public function test_fin_document_tax_form_kind_delegates_to_tax_document(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.accounts.detail']);
        $doc = $this->makeFinDocument($user, [
            'document_kind' => FinDocument::KIND_TAX_FORM,
            's3_path' => null,
            'tax_year' => 2025,
        ]);
        $this->makeTaxDocument($user, [
            'document_id' => $doc->id,
            'original_filename' => 'k1.pdf',
            's3_path' => "tax_docs/{$user->id}/stored-k1.pdf",
        ]);

        $this->mockSignedUrls();

        $this->getJson("/api/agent/v1/finance/documents/{$doc->id}/download-url", $this->bearer($token))
            ->assertOk()
            ->assertJsonPath('filename', 'k1.pdf');
    }

    public function test_fin_document_download_url_requires_permission(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.tax-documents.view']);
        $doc = $this->makeFinDocument($user);

        $this->getJson("/api/agent/v1/finance/documents/{$doc->id}/download-url", $this->bearer($token))
            ->assertStatus(403);
    }
}
