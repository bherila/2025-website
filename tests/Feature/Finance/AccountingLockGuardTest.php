<?php

namespace Tests\Feature\Finance;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\Http\Controllers\Agent\Imports\AgentImportController;
use App\Http\Middleware\AuthenticateAgentRequest;
use App\Http\Middleware\NegotiatesAgentPayload;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinPartnershipBasisYear;
use App\Models\FinanceTool\FinPartnershipInterest;
use App\Models\User;
use App\Services\Finance\Locks\PartnershipBasisLockGuard;
use App\Support\Accounting\AccountingPeriodLockGuard;
use App\Support\Accounting\PeriodLockedException;
use App\Support\Agent\AgentTokenService;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AccountingLockGuardTest extends TestCase
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
                Route::post('/jobs', [AgentImportController::class, 'createJob'])->name('jobs.create');
                Route::post('/jobs/{id}/retry', [AgentImportController::class, 'retry'])->whereNumber('id')->name('jobs.retry');
            });
        });
    }

    private function guard(): AccountingPeriodLockGuard
    {
        return app(AccountingPeriodLockGuard::class);
    }

    private function makeAccount(User $user, string $name): FinAccounts
    {
        $this->actingAs($user);

        return FinAccounts::create(['acct_name' => $name]);
    }

    private function makeInterest(User $user, FinAccounts $account, string $name = 'Synthetic LP'): FinPartnershipInterest
    {
        return FinPartnershipInterest::create([
            'user_id' => $user->id,
            'account_id' => $account->acct_id,
            'partnership_ein' => '900000099',
            'partnership_name' => $name,
            'normalized_partnership_name' => strtolower($name),
            'form_type' => 'k1_1065',
        ]);
    }

    private function lockYear(User $user, FinPartnershipInterest $interest, int $year): FinPartnershipBasisYear
    {
        return FinPartnershipBasisYear::create([
            'user_id' => $user->id,
            'partnership_interest_id' => $interest->id,
            'tax_year' => $year,
            'locked_at' => now(),
        ]);
    }

    /** @return array{user: User, token: string} */
    private function createUserWithToken(array $permissions): array
    {
        $user = $this->grantFeatures($this->createUser(), $permissions);
        $result = app(AgentTokenService::class)->createQuickSetupToken($user, 'finance', null);

        return ['user' => $user, 'token' => $result['token']];
    }

    /** @return array<string, string> */
    private function bearer(string $token): array
    {
        return ['Authorization' => 'Bearer '.$token];
    }

    // ─── Guard behavior ───────────────────────────────────────────────────────

    public function test_locked_partnership_year_throws_period_locked_exception(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user, 'Partnership Brokerage');
        $interest = $this->makeInterest($user, $account);
        $this->lockYear($user, $interest, 2024);

        try {
            $this->guard()->assertEditable($user->id, AccountingPeriodLockGuard::DOMAIN_PARTNERSHIP_BASIS, 2024, $account->acct_id);
            $this->fail('Expected PeriodLockedException was not thrown.');
        } catch (PeriodLockedException $e) {
            $this->assertSame('partnership_basis', $e->domain);
            $this->assertSame(2024, $e->year);
            $this->assertSame($account->acct_id, $e->accountId);
        }
    }

    public function test_unlocked_partnership_year_is_editable(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user, 'Partnership Brokerage');
        $interest = $this->makeInterest($user, $account);
        $this->lockYear($user, $interest, 2023);

        $this->guard()->assertEditable($user->id, AccountingPeriodLockGuard::DOMAIN_PARTNERSHIP_BASIS, 2024, $account->acct_id);

        $this->assertTrue(true);
    }

    public function test_lock_on_other_account_does_not_block(): void
    {
        $user = $this->createUser();
        $lockedAccount = $this->makeAccount($user, 'Locked LP Account');
        $openAccount = $this->makeAccount($user, 'Open LP Account');
        $lockedInterest = $this->makeInterest($user, $lockedAccount, 'Locked LP');
        $this->makeInterest($user, $openAccount, 'Open LP');
        $this->lockYear($user, $lockedInterest, 2024);

        $this->guard()->assertEditable($user->id, AccountingPeriodLockGuard::DOMAIN_PARTNERSHIP_BASIS, 2024, $openAccount->acct_id);

        $this->assertTrue(true);
    }

    public function test_null_account_id_checks_all_user_interests(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user, 'Partnership Brokerage');
        $interest = $this->makeInterest($user, $account);
        $this->lockYear($user, $interest, 2024);

        $this->expectException(PeriodLockedException::class);

        $this->guard()->assertEditable($user->id, AccountingPeriodLockGuard::DOMAIN_PARTNERSHIP_BASIS, 2024);
    }

    public function test_lock_is_user_scoped(): void
    {
        $owner = $this->createUser();
        $account = $this->makeAccount($owner, 'Owner Partnership');
        $interest = $this->makeInterest($owner, $account);
        $this->lockYear($owner, $interest, 2024);

        $otherUser = $this->createUser();
        $this->guard()->assertEditable($otherUser->id, AccountingPeriodLockGuard::DOMAIN_PARTNERSHIP_BASIS, 2024);

        $this->assertTrue(true);
    }

    public function test_period_locked_exception_renders_structured_409(): void
    {
        $exception = new PeriodLockedException('partnership_basis', 2024, 42);

        $response = $exception->render();

        $this->assertSame(409, $response->getStatusCode());
        $this->assertSame([
            'message' => 'This period is locked.',
            'locked' => true,
            'domain' => 'partnership_basis',
            'year' => 2024,
            'unlock_required' => true,
        ], $response->getData(true));
    }

    public function test_unknown_domain_throws_invalid_argument_exception(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        $this->guard()->assertEditable($this->createUser()->id, 'no_such_domain', 2024);
    }

    /**
     * TODO(epic-976 follow-up): these domains have no lock tables yet; once
     * tax-year/lot/transaction/preview-adjustment locks land, replace each
     * pass-through assertion with real locked/unlocked coverage.
     */
    public function test_stub_domains_are_not_yet_enforced(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user, 'Partnership Brokerage');
        $interest = $this->makeInterest($user, $account);
        $this->lockYear($user, $interest, 2024);

        foreach ([
            AccountingPeriodLockGuard::DOMAIN_TAX_YEAR,
            AccountingPeriodLockGuard::DOMAIN_TAX_LOTS,
            AccountingPeriodLockGuard::DOMAIN_TRANSACTIONS,
            AccountingPeriodLockGuard::DOMAIN_TAX_PREVIEW_ADJUSTMENTS,
        ] as $domain) {
            $this->guard()->assertEditable($user->id, $domain, 2024, $account->acct_id);
        }

        $this->assertTrue(true);
    }

    // ─── Agent import-confirm wiring ──────────────────────────────────────────

    public function test_agent_import_create_job_returns_409_for_locked_basis_year(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.tax-documents.manage']);
        $account = $this->makeAccount($user, 'Partnership Brokerage');
        $interest = $this->makeInterest($user, $account);
        $this->lockYear($user, $interest, 2024);

        $this->postJson('/api/agent/v1/imports/jobs', [
            's3_key' => "genai-import/{$user->id}/uuid/k1.pdf",
            'original_filename' => 'k1.pdf',
            'file_size_bytes' => 1024,
            'job_type' => 'document_extract',
            'acct_id' => $account->acct_id,
            'context' => ['tax_year' => 2024],
        ], $this->bearer($token))
            ->assertStatus(409)
            ->assertJson([
                'message' => 'This period is locked.',
                'locked' => true,
                'domain' => 'partnership_basis',
                'year' => 2024,
                'unlock_required' => true,
            ]);

        $this->assertDatabaseCount('genai_import_jobs', 0);
    }

    public function test_agent_import_create_job_succeeds_for_unlocked_year(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.tax-documents.manage']);
        $account = $this->makeAccount($user, 'Partnership Brokerage');
        $interest = $this->makeInterest($user, $account);
        $this->lockYear($user, $interest, 2023);

        $s3Key = "genai-import/{$user->id}/uuid/k1.pdf";
        Storage::fake('s3');
        Storage::disk('s3')->put($s3Key, 'synthetic k1 content');

        $this->postJson('/api/agent/v1/imports/jobs', [
            's3_key' => $s3Key,
            'original_filename' => 'k1.pdf',
            'file_size_bytes' => 1024,
            'job_type' => 'document_extract',
            'acct_id' => $account->acct_id,
            'context' => ['tax_year' => 2024],
        ], $this->bearer($token))
            ->assertCreated()
            ->assertJsonPath('status', 'pending');
    }

    public function test_agent_import_without_tax_year_context_skips_lock_guard(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.transactions.import']);
        $account = $this->makeAccount($user, 'Partnership Brokerage');
        $interest = $this->makeInterest($user, $account);
        $this->lockYear($user, $interest, 2024);

        $s3Key = "genai-import/{$user->id}/uuid/statement.csv";
        Storage::fake('s3');
        Storage::disk('s3')->put($s3Key, "date,amount\n2024-01-01,12.34");

        $this->postJson('/api/agent/v1/imports/jobs', [
            's3_key' => $s3Key,
            'original_filename' => 'statement.csv',
            'file_size_bytes' => 1024,
            'job_type' => 'finance_transactions',
            'acct_id' => $account->acct_id,
        ], $this->bearer($token))
            ->assertCreated();
    }

    public function test_agent_import_retry_returns_409_for_locked_basis_year(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.tax-documents.manage']);
        $account = $this->makeAccount($user, 'Partnership Brokerage');
        $interest = $this->makeInterest($user, $account);
        $this->lockYear($user, $interest, 2024);

        $job = GenAiImportJob::create([
            'user_id' => $user->id,
            'acct_id' => $account->acct_id,
            'job_type' => 'document_extract',
            'file_hash' => 'hash-'.fake()->uuid(),
            'original_filename' => 'k1.pdf',
            's3_path' => "genai-import/{$user->id}/uuid/k1.pdf",
            'file_size_bytes' => 1024,
            'context_json' => json_encode(['tax_year' => 2024]),
            'status' => 'failed',
            'retry_count' => 0,
        ]);

        $this->postJson("/api/agent/v1/imports/jobs/{$job->id}/retry", [], $this->bearer($token))
            ->assertStatus(409)
            ->assertJsonPath('domain', 'partnership_basis');

        $this->assertSame('failed', $job->fresh()->status);
    }
}
