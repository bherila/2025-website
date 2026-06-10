<?php

namespace Tests\Feature\Agent\Imports;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\Http\Controllers\Agent\Imports\AgentImportController;
use App\Http\Middleware\AuthenticateAgentRequest;
use App\Http\Middleware\NegotiatesAgentPayload;
use App\Models\AgentApiToken;
use App\Models\FinanceTool\FinAccounts;
use App\Models\User;
use App\Services\FileStorageService;
use App\Services\Finance\Locks\PartnershipBasisLockGuard;
use App\Support\Accounting\AccountingPeriodLockGuard;
use App\Support\Agent\AgentTokenService;
use App\Support\Agent\Capability;
use App\Support\Agent\CapabilityRegistry;
use App\Support\Agent\Modules\ImportCapabilities;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AgentImportTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Queue::fake();

        // User ID 1 is always treated as admin; occupy it so the users under
        // test are genuinely non-admin.
        $this->createAdminUser();

        // Mirror the AgentServiceProvider chokepoint binding (the integrator
        // wires the identical bind() into the provider).
        $this->app->bind(AccountingPeriodLockGuard::class, PartnershipBasisLockGuard::class);

        // Mirror the routes/agent.php chokepoint registration (the vertical
        // branch does not edit shared route files; the integrator wires the
        // identical block into routes/agent.php).
        Route::prefix('api/agent/v1')->name('agent.')->middleware([NegotiatesAgentPayload::class])->group(function (): void {
            Route::middleware([AuthenticateAgentRequest::class, 'feature:finance.access'])->prefix('imports')->name('imports.')->group(function (): void {
                Route::post('/request-upload', [AgentImportController::class, 'requestUpload'])->name('request-upload');
                Route::post('/jobs', [AgentImportController::class, 'createJob'])->name('jobs.create');
                Route::get('/jobs', [AgentImportController::class, 'index'])->name('jobs');
                Route::get('/jobs/{id}', [AgentImportController::class, 'show'])->whereNumber('id')->name('jobs.show');
                Route::post('/jobs/{id}/retry', [AgentImportController::class, 'retry'])->whereNumber('id')->name('jobs.retry');
                Route::delete('/jobs/{id}', [AgentImportController::class, 'destroy'])->whereNumber('id')->name('jobs.delete');
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

    /** @return array<string, mixed> */
    private function jobRow(User $user, array $overrides = []): array
    {
        return array_merge([
            'user_id' => $user->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'hash-'.fake()->uuid(),
            'original_filename' => 'statement.csv',
            's3_path' => "genai-import/{$user->id}/uuid/statement.csv",
            'file_size_bytes' => 1024,
            'status' => 'parsed',
        ], $overrides);
    }

    public function test_import_endpoints_require_token(): void
    {
        $this->postJson('/api/agent/v1/imports/request-upload')->assertStatus(401);
        $this->postJson('/api/agent/v1/imports/jobs')->assertStatus(401);
        $this->getJson('/api/agent/v1/imports/jobs')->assertStatus(401);
        $this->getJson('/api/agent/v1/imports/jobs/1')->assertStatus(401);
        $this->postJson('/api/agent/v1/imports/jobs/1/retry')->assertStatus(401);
        $this->deleteJson('/api/agent/v1/imports/jobs/1')->assertStatus(401);
    }

    public function test_request_upload_returns_signed_url_with_user_scoped_key(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.transactions.import']);

        $this->mock(FileStorageService::class)
            ->shouldReceive('getSignedUploadUrl')
            ->once()
            ->andReturn('https://s3.example.com/signed-url');

        $response = $this->postJson('/api/agent/v1/imports/request-upload', [
            'filename' => 'agent statement.csv',
            'content_type' => 'text/csv',
            'file_size' => 2048,
            'job_type' => 'finance_transactions',
        ], $this->bearer($token));

        $response->assertOk()->assertJsonStructure(['signed_url', 's3_key', 'expires_in']);
        $this->assertStringStartsWith("genai-import/{$user->id}/", $response->json('s3_key'));
        $this->assertSame('agent_statement.csv', basename((string) $response->json('s3_key')));
    }

    public function test_request_upload_rejects_phr_and_class_action_job_types(): void
    {
        ['token' => $token] = $this->createUserWithToken(['finance.transactions.import']);

        foreach (['phr_lab_result', 'phr_document', 'class_action_email', 'utility_bill'] as $jobType) {
            $this->postJson('/api/agent/v1/imports/request-upload', [
                'filename' => 'file.pdf',
                'content_type' => 'application/pdf',
                'file_size' => 1024,
                'job_type' => $jobType,
            ], $this->bearer($token))->assertStatus(403);
        }
    }

    public function test_request_upload_requires_job_type_permission(): void
    {
        ['token' => $token] = $this->createUserWithToken(['finance.payslips.manage']);

        $this->postJson('/api/agent/v1/imports/request-upload', [
            'filename' => 'file.csv',
            'content_type' => 'text/csv',
            'file_size' => 1024,
            'job_type' => 'finance_transactions',
        ], $this->bearer($token))
            ->assertStatus(403)
            ->assertJsonPath('required_permission', 'finance.transactions.import');
    }

    public function test_token_scope_restricts_job_type_even_with_user_permission(): void
    {
        $user = $this->grantFeatures($this->createUser(), [
            'finance.transactions.import',
        ]);

        $rawToken = 'bha_'.bin2hex(random_bytes(32));
        AgentApiToken::factory()->create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $rawToken),
            'allowed_permissions' => ['finance.access'],
        ]);

        $this->postJson('/api/agent/v1/imports/request-upload', [
            'filename' => 'file.csv',
            'content_type' => 'text/csv',
            'file_size' => 1024,
            'job_type' => 'finance_transactions',
        ], $this->bearer($rawToken))->assertStatus(403);
    }

    public function test_create_job_enforces_s3_prefix_ownership(): void
    {
        ['token' => $token] = $this->createUserWithToken(['finance.transactions.import']);

        $this->postJson('/api/agent/v1/imports/jobs', [
            's3_key' => 'genai-import/999999/uuid/statement.csv',
            'original_filename' => 'statement.csv',
            'file_size_bytes' => 1024,
            'job_type' => 'finance_transactions',
        ], $this->bearer($token))
            ->assertStatus(403)
            ->assertJsonFragment(['error' => 'Invalid file reference.']);
    }

    public function test_create_job_enforces_acct_ownership(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.transactions.import']);
        $otherUser = $this->createUser();
        $this->actingAs($otherUser);
        $foreignAccount = FinAccounts::create(['acct_name' => 'Foreign']);

        $this->postJson('/api/agent/v1/imports/jobs', [
            's3_key' => "genai-import/{$user->id}/uuid/statement.csv",
            'original_filename' => 'statement.csv',
            'file_size_bytes' => 1024,
            'job_type' => 'finance_transactions',
            'acct_id' => $foreignAccount->acct_id,
        ], $this->bearer($token))
            ->assertStatus(403)
            ->assertJsonFragment(['error' => 'Account not found or access denied.']);
    }

    public function test_create_job_creates_and_dispatches_for_owned_account(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.transactions.import']);
        $this->actingAs($user);
        $account = FinAccounts::create(['acct_name' => 'Agent Import Checking']);

        $s3Key = "genai-import/{$user->id}/uuid/statement.csv";
        Storage::fake('s3');
        Storage::disk('s3')->put($s3Key, 'date,amount\n2024-01-01,12.34');

        $response = $this->postJson('/api/agent/v1/imports/jobs', [
            's3_key' => $s3Key,
            'original_filename' => 'statement.csv',
            'file_size_bytes' => 1024,
            'mime_type' => 'text/csv',
            'job_type' => 'finance_transactions',
            'acct_id' => $account->acct_id,
        ], $this->bearer($token));

        $response->assertCreated()->assertJsonPath('status', 'pending');
        $this->assertDatabaseHas('genai_import_jobs', [
            'id' => (int) $response->json('job_id'),
            'user_id' => $user->id,
            'acct_id' => $account->acct_id,
            'job_type' => 'finance_transactions',
            's3_path' => $s3Key,
        ]);
    }

    public function test_create_job_rejects_phr_job_type(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.transactions.import']);

        $this->postJson('/api/agent/v1/imports/jobs', [
            's3_key' => "genai-import/{$user->id}/uuid/labs.pdf",
            'original_filename' => 'labs.pdf',
            'file_size_bytes' => 1024,
            'job_type' => 'phr_lab_result',
        ], $this->bearer($token))->assertStatus(403);
    }

    public function test_list_jobs_excludes_non_agent_job_types(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken([
            'finance.transactions.import',
            'finance.tax-documents.manage',
        ]);

        $financeJob = GenAiImportJob::create($this->jobRow($user));
        GenAiImportJob::create($this->jobRow($user, [
            'job_type' => 'phr_lab_result',
            's3_path' => "genai-import/{$user->id}/uuid/labs.pdf",
            'original_filename' => 'labs.pdf',
        ]));

        $response = $this->getJson('/api/agent/v1/imports/jobs', $this->bearer($token));

        $response->assertOk();
        $jobs = collect($response->json('data'));
        $this->assertSame([$financeJob->id], $jobs->pluck('id')->all());
    }

    public function test_list_jobs_rejects_non_agent_job_type_filter(): void
    {
        ['token' => $token] = $this->createUserWithToken(['finance.transactions.import']);

        $this->getJson('/api/agent/v1/imports/jobs?job_type=phr_lab_result', $this->bearer($token))
            ->assertStatus(403);
    }

    public function test_show_is_owner_scoped(): void
    {
        ['token' => $token] = $this->createUserWithToken(['finance.transactions.import']);
        $otherUser = $this->createUser();
        $foreignJob = GenAiImportJob::create($this->jobRow($otherUser, [
            's3_path' => "genai-import/{$otherUser->id}/uuid/statement.csv",
        ]));

        $this->getJson("/api/agent/v1/imports/jobs/{$foreignJob->id}", $this->bearer($token))
            ->assertStatus(404);
    }

    public function test_show_returns_403_for_non_agent_job_type(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.transactions.import']);
        $phrJob = GenAiImportJob::create($this->jobRow($user, [
            'job_type' => 'phr_lab_result',
        ]));

        $this->getJson("/api/agent/v1/imports/jobs/{$phrJob->id}", $this->bearer($token))
            ->assertStatus(403);
    }

    public function test_retry_requeues_failed_job(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.transactions.import']);
        $job = GenAiImportJob::create($this->jobRow($user, ['status' => 'failed', 'retry_count' => 0]));

        $this->postJson("/api/agent/v1/imports/jobs/{$job->id}/retry", [], $this->bearer($token))
            ->assertOk()
            ->assertJsonPath('status', 'pending');

        $this->assertSame('pending', $job->fresh()->status);
    }

    public function test_delete_removes_owned_job_and_rejects_non_agent_types(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.transactions.import']);
        $job = GenAiImportJob::create($this->jobRow($user));
        $phrJob = GenAiImportJob::create($this->jobRow($user, ['job_type' => 'phr_document']));

        $this->deleteJson("/api/agent/v1/imports/jobs/{$job->id}", [], $this->bearer($token))
            ->assertOk();
        $this->assertDatabaseMissing('genai_import_jobs', ['id' => $job->id]);

        $this->deleteJson("/api/agent/v1/imports/jobs/{$phrJob->id}", [], $this->bearer($token))
            ->assertStatus(403);
        $this->assertDatabaseHas('genai_import_jobs', ['id' => $phrJob->id]);
    }

    public function test_import_capabilities_are_registered_with_expected_metadata(): void
    {
        $registry = new CapabilityRegistry;
        ImportCapabilities::register($registry);

        $capabilities = collect($registry->forModule('imports'))
            ->keyBy(fn (Capability $capability): string => $capability->id);

        $this->assertEqualsCanonicalizing([
            'imports.request_upload',
            'imports.create_job',
            'imports.list_jobs',
            'imports.get_job',
            'imports.retry_job',
            'imports.delete_job',
        ], $capabilities->keys()->all());

        $this->assertSame('upload', $capabilities['imports.request_upload']->risk);
        $this->assertSame('write', $capabilities['imports.create_job']->risk);
        $this->assertSame('destructive', $capabilities['imports.delete_job']->risk);

        foreach ($capabilities as $capability) {
            $this->assertSame('finance.access', $capability->requiredPermission);
            $this->assertStringStartsWith('/imports/', (string) $capability->restPath);
        }
    }
}
