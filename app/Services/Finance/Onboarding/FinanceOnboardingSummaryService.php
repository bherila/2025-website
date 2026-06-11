<?php

namespace App\Services\Finance\Onboarding;

use App\Models\CareerJob;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinAccountTag;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\FinEquityAwards;
use App\Models\FinanceTool\FinForm8829Input;
use App\Models\FinanceTool\FinPayslips;
use App\Models\FinanceTool\FinRule;
use App\Models\FinanceTool\PalCarryforward;
use App\Models\FinanceTool\ScheduleDCarryoverInput;
use App\Models\User;
use App\Services\Finance\ReadinessSummaryService;
use App\Services\Finance\TaxPreviewDataService;
use App\Support\Access\FeatureAccess;
use Illuminate\Database\Eloquent\Builder;

/**
 * Computes the permission-filtered Finance onboarding readiness summary for the
 * Finance Home dashboard.
 *
 * Status computation is deliberately kept out of the controller so a future
 * Agent API capability can reuse this service. Each section is gated behind the
 * underlying view permission: a user without that permission receives
 * `no_access` with no counts and no summary text, preventing the
 * ReadinessSummaryService permission downgrade.
 *
 * @phpstan-type SectionPayload array{id: string, status: string, title: string, summary: string, counts?: array<string, int>, actions: list<array<string, mixed>>}
 */
class FinanceOnboardingSummaryService
{
    public function __construct(
        private readonly FeatureAccess $featureAccess,
        private readonly ReadinessSummaryService $readinessSummaryService,
        private readonly TaxPreviewDataService $taxPreviewDataService,
    ) {}

    /**
     * @return list<int>
     */
    public function availableYears(User $user): array
    {
        return $this->taxPreviewDataService->shellForYear((int) $user->id, (int) date('Y'))['availableYears'];
    }

    /**
     * Resolve the selected year: an explicit valid request year wins, otherwise
     * the latest available Finance tax/transaction year, otherwise the current
     * calendar year.
     *
     * @param  list<int>  $availableYears
     */
    public function resolveYear(?int $requestedYear, array $availableYears): int
    {
        if ($requestedYear !== null && $requestedYear >= 1900 && $requestedYear <= 2100) {
            return $requestedYear;
        }

        return $availableYears[0] ?? (int) date('Y');
    }

    /**
     * Build the full onboarding summary payload for the dashboard.
     *
     * @param  list<int>  $availableYears  Pre-computed list from the caller (avoids a second DB round-trip).
     * @return array{year: int, availableYears: list<int>, sections: list<SectionPayload>, primaryActions: list<array<string, mixed>>, warnings: list<array<string, mixed>>}
     */
    public function summaryForYear(User $user, int $year, array $availableYears = []): array
    {
        $readiness = $this->featureAccess->can($user, 'finance.tax-preview.view')
            ? $this->readinessSummaryService->summaryForYear((int) $user->id, $year)
            : null;

        $sections = [
            $this->accountsSection($user),
            $this->transactionsSection($user, $year),
            $this->documentsSection($user, $year),
            $this->employmentSection($user),
            $this->payslipsSection($user, $year),
            $this->rsuSection($user, $year),
            $this->k1BasisSection($user, $year),
            $this->lotsSection($user, $year, $readiness),
            $this->carryoversSection($user, $year),
            $this->categorizationSection($user),
            $this->taxPreviewSection($user, $year, $readiness),
        ];

        return [
            'year' => $year,
            'availableYears' => $availableYears,
            'sections' => $sections,
            'primaryActions' => $this->primaryActions($sections),
            'warnings' => $this->warnings($sections),
        ];
    }

    /**
     * @return SectionPayload
     */
    private function accountsSection(User $user): array
    {
        if (! $this->featureAccess->can($user, 'finance.accounts.basic')) {
            return $this->noAccessSection('accounts', 'Accounts');
        }

        $accountCount = FinAccounts::query()->forOwner((int) $user->id)->count();
        $actions = $this->filterActions($user, [
            $this->action('accounts.add', 'Add an account', '/finance/accounts', 'primary', 'finance.accounts.manage'),
            $this->action('accounts.view', 'Review accounts', '/finance/accounts', 'secondary', 'finance.accounts.detail'),
        ]);

        if ($accountCount === 0) {
            return $this->section('accounts', 'not_started', 'Accounts', 'Add your first account to start tracking finances.', ['accounts' => 0], $actions);
        }

        return $this->section('accounts', 'ready', 'Accounts', "You have {$accountCount} account(s).", ['accounts' => $accountCount], $actions);
    }

    /**
     * @return SectionPayload
     */
    private function transactionsSection(User $user, int $year): array
    {
        if (! $this->featureAccess->can($user, 'finance.transactions.view')) {
            return $this->noAccessSection('transactions', 'Transactions');
        }

        $transactionCount = $this->ownedTransactionsQuery($user, $year)->count();
        $actions = $this->filterActions($user, [
            $this->action('transactions.import', 'Import transactions', '/finance/account/all/import', 'primary', 'finance.transactions.import'),
            $this->action('transactions.view', 'Review transactions', '/finance/account/all/transactions', 'secondary', 'finance.transactions.view'),
        ]);

        if ($transactionCount === 0) {
            return $this->section('transactions', 'not_started', 'Transactions', "No transactions recorded for {$year} yet.", ['transactions' => 0], $actions);
        }

        return $this->section('transactions', 'ready', 'Transactions', "{$transactionCount} transaction(s) recorded for {$year}.", ['transactions' => $transactionCount], $actions);
    }

    /**
     * @return SectionPayload
     */
    private function documentsSection(User $user, int $year): array
    {
        if (! $this->featureAccess->can($user, 'finance.tax-documents.view')) {
            return $this->noAccessSection('documents', 'Tax documents');
        }

        $documentCount = FileForTaxDocument::query()
            ->where('user_id', $user->id)
            ->where('tax_year', $year)
            ->count();
        $pendingCount = FileForTaxDocument::query()
            ->where('user_id', $user->id)
            ->where('tax_year', $year)
            ->where('genai_status', 'parsed')
            ->where('is_reviewed', false)
            ->count();
        $failedCount = FileForTaxDocument::query()
            ->where('user_id', $user->id)
            ->where('tax_year', $year)
            ->where('genai_status', 'failed')
            ->count();

        $counts = [
            'documents' => $documentCount,
            'pending_review' => $pendingCount,
            'parsing_failures' => $failedCount,
        ];
        $actions = $this->filterActions($user, [
            $this->action('documents.upload', 'Upload tax documents', '/finance/documents', 'primary', 'finance.tax-documents.manage'),
            $this->action('documents.review', 'Review tax documents', '/finance/documents', 'secondary', 'finance.tax-documents.view'),
        ]);

        if ($documentCount === 0) {
            return $this->section('documents', 'not_started', 'Tax documents', "No tax documents uploaded for {$year} yet.", $counts, $actions);
        }

        if ($pendingCount > 0 || $failedCount > 0) {
            if ($pendingCount > 0 && $failedCount > 0) {
                $summary = "{$pendingCount} document(s) pending review, {$failedCount} failed parsing for {$year}.";
            } elseif ($pendingCount > 0) {
                $summary = "{$pendingCount} document(s) pending review for {$year}.";
            } else {
                $summary = "{$failedCount} document(s) failed parsing for {$year}.";
            }

            return $this->section('documents', 'needs_attention', 'Tax documents', $summary, $counts, $actions);
        }

        return $this->section('documents', 'ready', 'Tax documents', "{$documentCount} document(s) uploaded and reviewed for {$year}.", $counts, $actions);
    }

    /**
     * @return SectionPayload
     */
    private function employmentSection(User $user): array
    {
        if (! $this->featureAccess->can($user, 'finance.tax-preview.view')) {
            return $this->noAccessSection('employment', 'Employment');
        }

        $entityCount = FinEmploymentEntity::query()
            ->withoutGlobalScopes()
            ->where('user_id', $user->id)
            ->count();
        $hasCurrentJob = CareerJob::query()
            ->where('user_id', $user->id)
            ->where('kind', 'current')
            ->exists();

        $counts = [
            'employment_entities' => $entityCount,
            'current_career_job' => $hasCurrentJob ? 1 : 0,
        ];
        $actions = $this->filterActions($user, [
            $this->action('employment.manage', 'Manage employment entities', '/finance/tax-preview', 'primary', 'finance.tax-preview.manage'),
            $this->action('employment.career', 'Open Career Comparison', '/financial-planning/career-comparison', 'secondary'),
        ]);

        if ($entityCount === 0 && ! $hasCurrentJob) {
            return $this->section('employment', 'not_started', 'Employment', 'Add a W-2 / Schedule C employment entity or a current Career Comparison job.', $counts, $actions);
        }

        if ($entityCount === 0 || ! $hasCurrentJob) {
            return $this->section('employment', 'in_progress', 'Employment', 'Some employment details are still missing.', $counts, $actions);
        }

        return $this->section('employment', 'ready', 'Employment', "{$entityCount} employment entity(ies) and a current Career Comparison job on file.", $counts, $actions);
    }

    /**
     * @return SectionPayload
     */
    private function payslipsSection(User $user, int $year): array
    {
        if (! $this->featureAccess->can($user, 'finance.payslips.view')) {
            return $this->noAccessSection('payslips', 'Payslips');
        }

        $payslipCount = FinPayslips::query()
            ->withoutGlobalScopes()
            ->where('uid', $user->id)
            ->whereBetween('pay_date', ["{$year}-01-01", "{$year}-12-31"])
            ->count();
        $actions = $this->filterActions($user, [
            $this->action('payslips.add', 'Add payslips', '/finance/payslips/entry', 'primary', 'finance.payslips.manage'),
            $this->action('payslips.view', 'Review payslips', '/finance/payslips', 'secondary', 'finance.payslips.view'),
        ]);

        if ($payslipCount === 0) {
            return $this->section('payslips', 'optional', 'Payslips', "No payslips recorded for {$year}.", ['payslips' => 0], $actions);
        }

        return $this->section('payslips', 'ready', 'Payslips', "{$payslipCount} payslip(s) recorded for {$year}.", ['payslips' => $payslipCount], $actions);
    }

    /**
     * @return SectionPayload
     */
    private function rsuSection(User $user, int $year): array
    {
        if (! $this->featureAccess->can($user, 'finance.rsu.view')) {
            return $this->noAccessSection('rsu', 'RSUs');
        }

        $grantCount = FinEquityAwards::query()
            ->where('uid', $user->id)
            ->whereBetween('vest_date', ["{$year}-01-01", "{$year}-12-31"])
            ->count();
        $actions = $this->filterActions($user, [
            $this->action('rsu.add', 'Add RSU grants', '/finance/rsu/add-grant', 'primary', 'finance.rsu.manage'),
            $this->action('rsu.view', 'Review RSUs', '/finance/rsu', 'secondary', 'finance.rsu.view'),
        ]);

        if ($grantCount === 0) {
            return $this->section('rsu', 'optional', 'RSUs', "No RSU vests recorded for {$year}.", ['rsu_vests' => 0], $actions);
        }

        return $this->section('rsu', 'ready', 'RSUs', "{$grantCount} RSU vest(s) recorded for {$year}.", ['rsu_vests' => $grantCount], $actions);
    }

    /**
     * @return SectionPayload
     */
    private function k1BasisSection(User $user, int $year): array
    {
        if (! $this->featureAccess->can($user, 'finance.tax-documents.view')) {
            return $this->noAccessSection('k1_basis', 'K-1 / partnership basis');
        }

        $k1Count = FileForTaxDocument::query()
            ->where('user_id', $user->id)
            ->where('tax_year', $year)
            ->whereIn('form_type', ['k1', 'k1_1065', 'k1_1120s'])
            ->count();
        $actions = $this->filterActions($user, [
            $this->action('k1.upload', 'Upload K-1 documents', '/finance/documents', 'primary', 'finance.tax-documents.manage'),
            $this->action('k1.review', 'Review K-1 documents', '/finance/documents', 'secondary', 'finance.tax-documents.view'),
        ]);

        if ($k1Count === 0) {
            return $this->section('k1_basis', 'optional', 'K-1 / partnership basis', "No K-1 documents recorded for {$year}.", ['k1_documents' => 0], $actions);
        }

        return $this->section('k1_basis', 'ready', 'K-1 / partnership basis', "{$k1Count} K-1 document(s) recorded for {$year}.", ['k1_documents' => $k1Count], $actions);
    }

    /**
     * Reconciliation health (drift/blocked) is sourced from ReadinessSummaryService,
     * which is otherwise reachable only behind `finance.tax-preview.view`. A user
     * holding `finance.lots.view` alone must not learn reconciliation state, so the
     * counts and the "needs attention" status are emitted only when the user also
     * holds `finance.tax-preview.view`. Without it, the section is computed from the
     * lot count alone.
     *
     * @param  array<string, mixed>|null  $readiness  Pre-computed readiness summary (shared with taxPreviewSection); null when the caller lacks tax-preview access.
     * @return SectionPayload
     */
    private function lotsSection(User $user, int $year, ?array $readiness): array
    {
        if (! $this->featureAccess->can($user, 'finance.lots.view')) {
            return $this->noAccessSection('lots', 'Lots');
        }

        $lotCount = FinAccountLot::query()
            ->whereHas('account', fn ($query) => $query->withoutGlobalScopes()->where('acct_owner', $user->id))
            ->count();

        $canSeeReconciliation = $readiness !== null && $this->featureAccess->can($user, 'finance.tax-preview.view');

        $counts = ['lots' => $lotCount];
        $drift = 0;
        $blocked = 0;
        if ($canSeeReconciliation) {
            $reconciliation = $readiness['reconciliation_health'];
            $drift = (int) ($reconciliation['drift'] ?? 0);
            $blocked = (int) ($reconciliation['blocked'] ?? 0);
            $counts['reconciliation_drift'] = $drift;
            $counts['reconciliation_blocked'] = $blocked;
        }

        $actions = $this->filterActions($user, [
            $this->action('lots.view', 'Review lots', '/finance/account/all/lots', 'secondary', 'finance.lots.view'),
        ]);

        if ($lotCount === 0) {
            return $this->section('lots', 'not_started', 'Lots', 'No lots recorded yet.', $counts, $actions);
        }

        if ($canSeeReconciliation && ($drift > 0 || $blocked > 0)) {
            return $this->section('lots', 'needs_attention', 'Lots', "Lot reconciliation needs attention for {$year}.", $counts, $actions);
        }

        if ($canSeeReconciliation) {
            return $this->section('lots', 'ready', 'Lots', "{$lotCount} lot(s) recorded and reconciled.", $counts, $actions);
        }

        return $this->section('lots', 'ready', 'Lots', "{$lotCount} lot(s) recorded.", $counts, $actions);
    }

    /**
     * @return SectionPayload
     */
    private function carryoversSection(User $user, int $year): array
    {
        if (! $this->featureAccess->can($user, 'finance.tax-preview.view')) {
            return $this->noAccessSection('carryovers', 'Carryovers');
        }

        $scheduleDCount = ScheduleDCarryoverInput::query()
            ->where('user_id', $user->id)
            ->where('tax_year', $year)
            ->count();
        $palCount = PalCarryforward::query()
            ->where('user_id', $user->id)
            ->where('tax_year', $year)
            ->count();
        $form8829Count = FinForm8829Input::query()
            ->where('user_id', $user->id)
            ->where('tax_year', $year)
            ->count();

        $total = $scheduleDCount + $palCount + $form8829Count;
        $counts = [
            'schedule_d_carryovers' => $scheduleDCount,
            'pal_carryforwards' => $palCount,
            'form_8829_inputs' => $form8829Count,
        ];
        $actions = $this->filterActions($user, [
            $this->action('carryovers.manage', 'Enter carryovers', '/finance/tax-preview', 'primary', 'finance.tax-preview.manage'),
        ]);

        if ($total === 0) {
            return $this->section('carryovers', 'optional', 'Carryovers', "No carryover inputs entered for {$year}.", $counts, $actions);
        }

        return $this->section('carryovers', 'ready', 'Carryovers', "Carryover inputs entered for {$year}.", $counts, $actions);
    }

    /**
     * @return SectionPayload
     */
    private function categorizationSection(User $user): array
    {
        if (! $this->featureAccess->can($user, 'finance.transactions.view')) {
            return $this->noAccessSection('categorization', 'Categorization');
        }

        $tagCount = FinAccountTag::query()->where('tag_userid', $user->id)->count();

        $canManageRules = $this->featureAccess->can($user, 'finance.rules.manage');
        $ruleCount = $canManageRules
            ? FinRule::query()->where('user_id', $user->id)->count()
            : 0;

        $counts = ['tags' => $tagCount];
        if ($canManageRules) {
            $counts['rules'] = $ruleCount;
        }

        $actions = $this->filterActions($user, [
            $this->action('categorization.manage', 'Manage tags and rules', '/finance/tags', 'primary', 'finance.rules.manage'),
        ]);

        if ($tagCount === 0 && $ruleCount === 0) {
            $summary = $canManageRules ? 'No tags or rules configured yet.' : 'No tags configured yet.';

            return $this->section('categorization', 'optional', 'Categorization', $summary, $counts, $actions);
        }

        $summary = $canManageRules
            ? "{$tagCount} tag(s) and {$ruleCount} rule(s) configured."
            : "{$tagCount} tag(s) configured.";

        return $this->section('categorization', 'ready', 'Categorization', $summary, $counts, $actions);
    }

    /**
     * @param  array<string, mixed>|null  $readiness  Pre-computed readiness summary (shared with lotsSection); null only when the user lacks tax-preview access, in which case the early return fires first.
     * @return SectionPayload
     */
    private function taxPreviewSection(User $user, int $year, ?array $readiness): array
    {
        if (! $this->featureAccess->can($user, 'finance.tax-preview.view') || $readiness === null) {
            return $this->noAccessSection('tax_preview', 'Tax Preview');
        }

        $pendingReview = (int) ($readiness['pending_review_count'] ?? 0);
        $missingAccounts = (int) ($readiness['missing_account_count'] ?? 0);
        $parsingFailures = (int) ($readiness['parsing_failure_count'] ?? 0);

        $counts = [
            'pending_review' => $pendingReview,
            'missing_accounts' => $missingAccounts,
            'parsing_failures' => $parsingFailures,
        ];
        $actions = $this->filterActions($user, [
            $this->action('tax_preview.open', 'Open Tax Preview', '/finance/tax-preview', 'primary', 'finance.tax-preview.view'),
        ]);

        if ($pendingReview > 0 || $missingAccounts > 0 || $parsingFailures > 0) {
            return $this->section('tax_preview', 'needs_attention', 'Tax Preview', "Tax Preview for {$year} has items needing attention.", $counts, $actions);
        }

        return $this->section('tax_preview', 'ready', 'Tax Preview', "Tax Preview for {$year} is ready.", $counts, $actions);
    }

    /**
     * Promote each section's primary action to the top-level primary actions list.
     *
     * @param  list<SectionPayload>  $sections
     * @return list<array<string, mixed>>
     */
    private function primaryActions(array $sections): array
    {
        $primary = [];
        foreach ($sections as $section) {
            if (in_array($section['status'], ['no_access', 'ready', 'optional'], true)) {
                continue;
            }
            foreach ($section['actions'] as $action) {
                if ($action['kind'] === 'primary') {
                    $primary[] = $action;
                    break;
                }
            }
        }

        return $primary;
    }

    /**
     * @param  list<SectionPayload>  $sections
     * @return list<array<string, mixed>>
     */
    private function warnings(array $sections): array
    {
        $warnings = [];
        foreach ($sections as $section) {
            if ($section['status'] !== 'needs_attention') {
                continue;
            }
            $warnings[] = [
                'id' => "warning.{$section['id']}",
                'severity' => 'warning',
                'message' => $section['summary'],
            ];
        }

        return $warnings;
    }

    /**
     * @return Builder<FinAccountLineItems>
     */
    private function ownedTransactionsQuery(User $user, int $year): Builder
    {
        return FinAccountLineItems::query()
            ->whereBetween('t_date', ["{$year}-01-01", "{$year}-12-31"])
            ->whereHas('account', fn ($query) => $query->withoutGlobalScopes()->where('acct_owner', $user->id));
    }

    /**
     * Keep only actions whose permission (when set) the user holds.
     *
     * @param  list<array<string, mixed>>  $actions
     * @return list<array<string, mixed>>
     */
    private function filterActions(User $user, array $actions): array
    {
        return array_values(array_filter($actions, function (array $action) use ($user): bool {
            $permission = $action['permission'] ?? null;

            return $permission === null || $this->featureAccess->can($user, (string) $permission);
        }));
    }

    /**
     * @return array{id: string, label: string, href: string, kind: string, permission?: string}
     */
    private function action(string $id, string $label, string $href, string $kind, ?string $permission = null): array
    {
        $action = [
            'id' => $id,
            'label' => $label,
            'href' => $href,
            'kind' => $kind,
        ];

        if ($permission !== null) {
            $action['permission'] = $permission;
        }

        return $action;
    }

    /**
     * @param  array<string, int>  $counts
     * @param  list<array<string, mixed>>  $actions
     * @return SectionPayload
     */
    private function section(string $id, string $status, string $title, string $summary, array $counts, array $actions): array
    {
        return [
            'id' => $id,
            'status' => $status,
            'title' => $title,
            'summary' => $summary,
            'counts' => $counts,
            'actions' => $actions,
        ];
    }

    /**
     * A section the user cannot view: no counts, no summary text, no actions.
     *
     * @return SectionPayload
     */
    private function noAccessSection(string $id, string $title): array
    {
        return [
            'id' => $id,
            'status' => 'no_access',
            'title' => $title,
            'summary' => '',
            'actions' => [],
        ];
    }
}
