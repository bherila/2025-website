<?php

namespace App\Http\Controllers\FinanceTool;

use App\Enums\Finance\LotMatcherAutoTrigger;
use App\Http\Controllers\Controller;
use App\Http\Controllers\FinanceTool\Concerns\QueriesUserAccounts;
use App\Models\FinanceTool\FinAccountLineItemDeletion;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinDocument;
use App\Models\FinanceTool\FinRsuLink;
use App\Models\FinanceTool\FinStatement;
use App\Models\User;
use App\Services\Finance\CapitalGains\LotMatcherAutoDispatchService;
use App\Services\Finance\TransactionDeletionTombstoneService;
use App\Services\Finance\TransactionImportService;
use App\Support\Access\FeatureAccess;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class FinanceTransactionsApiController extends Controller
{
    use QueriesUserAccounts;

    public function __construct(
        private readonly LotMatcherAutoDispatchService $lotMatcherAutoDispatchService,
        private readonly FeatureAccess $featureAccess,
    ) {}

    /**
     * Get line items (transactions) for one or all accounts.
     * Pass account_id = 'all' (or null) to retrieve transactions across all accounts.
     */
    public function getLineItems(Request $request, int|string|null $account_id = null): StreamedResponse
    {
        $request->validate([
            'source_document_id' => 'sometimes|integer|min:1',
        ]);

        $user = $request->user();
        $includeRsuLinks = $user instanceof User && $this->featureAccess->can($user, 'finance.rsu.view');

        if ($account_id && $account_id !== 'all') {
            $account = $this->resolveOwnedAccount($account_id);
            $query = FinAccountLineItems::where('t_account', $account->acct_id);
        } else {
            $query = FinAccountLineItems::whereIn('t_account', $this->getUserAccountIds());
        }

        $relations = ['tags', 'parentTransactions.account', 'childTransactions.account', 'clientExpense.clientCompany'];
        if ($includeRsuLinks) {
            $relations[] = 'rsuLinks.settlement';
        }

        $query->with($relations)
            ->orderBy('t_date', 'desc');

        // This endpoint also backs the lots view, which can be reached with
        // finance.lots.view alone. Such users must not receive the full
        // transaction ledger: restrict the payload to security trade rows
        // (the only rows lot/wash-sale analysis consumes) and redact the
        // ledger-detail fields that lots do not need.
        $redactTransactionDetails = false;
        if ($user instanceof User && ! $this->featureAccess->can($user, 'finance.transactions.view')) {
            $redactTransactionDetails = true;
            $query->whereNotNull('t_symbol')->where('t_symbol', '!=', '');
        }

        if ($request->filled('source_document_id')) {
            $this->applySourceDocumentFilter($query, (int) $request->query('source_document_id'));
        }

        if ($request->has('start_date') && $request->has('end_date')) {
            $query->whereBetween('t_date', [$request->start_date, $request->end_date]);
        }

        // Filter by year if provided
        if ($request->has('year')) {
            $year = $request->year;
            $query->whereYear('t_date', $year);
        }

        // Filter by tag if provided
        if ($request->has('tag')) {
            $tagLabel = $request->tag;
            $query->whereHas('tags', function ($q) use ($tagLabel) {
                $q->where('fin_account_tag.tag_label', $tagLabel);
            });
        }

        // Filter by type if provided
        if ($request->has('filter')) {
            $filter = $request->filter;
            if ($filter === 'stock') {
                $query->whereNotNull('t_symbol')->where('t_symbol', '!=', '');
            } elseif ($filter === 'cash') {
                $query->where(function ($q) {
                    $q->whereNull('t_symbol')->orWhere('t_symbol', '');
                });
            }
        }

        return $this->streamLineItems($query, $redactTransactionDetails, $includeRsuLinks);
    }

    /**
     * Get incremental transaction changes for one or all accounts.
     */
    public function syncLineItems(Request $request, int|string|null $account_id = null): StreamedResponse
    {
        $since = $this->syncSince($request);
        $serverTime = now();

        $isAllAccounts = ! $account_id || $account_id === 'all';
        $user = $request->user();
        $includeRsuLinks = $user instanceof User && $this->featureAccess->can($user, 'finance.rsu.view');

        if (! $isAllAccounts) {
            $account = $this->resolveOwnedAccount($account_id);
            $accountIds = [$account->acct_id];
        } else {
            $accountIds = $this->getUserAccountIds()->all();
        }

        $relations = ['tags', 'parentTransactions.account', 'childTransactions.account', 'clientExpense.clientCompany'];
        if ($includeRsuLinks) {
            $relations[] = 'rsuLinks.settlement';
        }

        $transactionsQuery = FinAccountLineItems::whereIn('t_account', $accountIds)
            ->with($relations)
            ->orderBy('t_date', 'desc');

        if ($since !== null) {
            $transactionsQuery->where('updated_at', '>=', $since);
        }

        $deletionsQuery = FinAccountLineItemDeletion::query()->orderBy('deleted_at', 'asc');
        if ($isAllAccounts) {
            $deletionsQuery->where('user_id', Auth::id());
        } else {
            $deletionsQuery->whereIn('t_account', $accountIds);
        }

        if ($since !== null) {
            $deletionsQuery->where('deleted_at', '>=', $since);
        }

        return response()->stream(function () use ($serverTime, $transactionsQuery, $deletionsQuery, $includeRsuLinks): void {
            echo '{"server_time":'.json_encode($serverTime->toJSON()).',"transactions":';
            $this->writeJsonArray($transactionsQuery->lazy(), fn (FinAccountLineItems $item): array => $this->transformLineItem($item, false, $includeRsuLinks));
            echo ',"deleted":';
            $this->writeJsonArray(
                $deletionsQuery->select(['t_id', 't_account', 'deleted_at'])->lazy(),
                fn (FinAccountLineItemDeletion $deletion): array => [
                    't_id' => (int) $deletion->t_id,
                    't_account' => (int) $deletion->t_account,
                    'deleted_at' => $deletion->deleted_at->toJSON(),
                ],
            );
            echo '}';
        }, 200, $this->streamJsonHeaders());
    }

    private function syncSince(Request $request): ?CarbonImmutable
    {
        if (! $request->filled('since')) {
            return null;
        }

        $request->validate([
            'since' => 'date',
        ]);

        return CarbonImmutable::parse((string) $request->query('since'));
    }

    /**
     * @param  Builder<FinAccountLineItems>  $query
     */
    private function applySourceDocumentFilter(Builder $query, int $sourceDocumentId): void
    {
        FinDocument::query()
            ->where('id', $sourceDocumentId)
            ->where('user_id', (int) Auth::id())
            ->firstOrFail();

        $query->whereHas('statement', function (Builder $statementQuery) use ($sourceDocumentId): void {
            $statementQuery->where('document_id', $sourceDocumentId);
        });
    }

    /**
     * @param  Builder<FinAccountLineItems>  $query
     */
    private function streamLineItems(Builder $query, bool $redactTransactionDetails = false, bool $includeRsuLinks = false): StreamedResponse
    {
        return response()->stream(function () use ($query, $redactTransactionDetails, $includeRsuLinks): void {
            $this->writeJsonArray($query->lazy(), fn (FinAccountLineItems $item): array => $this->transformLineItem($item, $redactTransactionDetails, $includeRsuLinks));
        }, 200, $this->streamJsonHeaders());
    }

    /**
     * @template TItem
     *
     * @param  iterable<TItem>  $items
     * @param  callable(TItem): array<string, mixed>  $transform
     */
    private function writeJsonArray(iterable $items, callable $transform): void
    {
        echo '[';
        $first = true;

        foreach ($items as $item) {
            if (! $first) {
                echo ',';
            }

            echo json_encode($transform($item));
            $first = false;
        }

        echo ']';
    }

    /**
     * @return array<string, string>
     */
    private function streamJsonHeaders(): array
    {
        return [
            'Content-Type' => 'application/json',
            'Cache-Control' => 'no-cache',
            'X-Accel-Buffering' => 'no',
        ];
    }

    /**
     * Delete a line item (transaction)
     */
    public function deleteLineItem(Request $request, int $account_id, TransactionDeletionTombstoneService $tombstones): JsonResponse
    {
        $account = $this->resolveOwnedAccount($account_id);

        $request->validate([
            't_id' => 'required|integer',
        ]);

        DB::transaction(function () use ($account, $request, $tombstones): void {
            $transaction = FinAccountLineItems::where('t_id', $request->t_id)
                ->where('t_account', $account->acct_id)
                ->first();

            if (! $transaction) {
                return;
            }

            $tombstones->record([$transaction], (int) Auth::id());

            // Unlink any lots referencing this transaction before deleting
            FinAccountLot::where('open_t_id', $request->t_id)->update(['open_t_id' => null]);
            FinAccountLot::where('close_t_id', $request->t_id)->update(['close_t_id' => null]);

            $transaction->delete();
        });

        return response()->json(['success' => true]);
    }

    /**
     * Import line items (transactions) for an account
     */
    public function importLineItems(Request $request, int $account_id, TransactionImportService $transactionImportService): JsonResponse
    {
        $account = $this->resolveOwnedAccount($account_id);

        $data = $request->json()->all();
        // Check if we have a top-level statement_id or if it's per item
        $statementId = $request->input('statement_id');
        $lineItems = isset($data['transactions']) ? $data['transactions'] : (isset($data[0]) ? $data : []);
        $statementErrors = $this->validateImportStatementIds($lineItems, $statementId, (int) $account->acct_id);

        if ($statementErrors !== []) {
            return response()->json([
                'success' => false,
                'errors' => $statementErrors,
            ], 422);
        }

        $result = $transactionImportService->importForUser((int) Auth::id(), TransactionImportService::transactionsFromPayload([
            'transactions' => $this->lineItemsForAccount($lineItems, (int) $account->acct_id),
        ]), [
            'default_account_id' => (int) $account->acct_id,
            'default_statement_id' => $statementId !== null ? (int) $statementId : null,
            'require_type' => false,
            'allow_row_statement_id' => true,
            'source' => 'import',
            'include_defaults' => true,
        ]);

        if ($result->hasErrors()) {
            return response()->json([
                'success' => false,
                'errors' => $result->errors,
            ], 422);
        }

        if ($result->inserted > 0) {
            $this->lotMatcherAutoDispatchService->dispatchForAccountYears(
                userId: (int) Auth::id(),
                accountId: (int) $account->acct_id,
                taxYears: LotMatcherAutoDispatchService::yearsFromDates(array_map(
                    static fn (array $row): mixed => $row['t_date'] ?? null,
                    $result->rows,
                )),
                trigger: LotMatcherAutoTrigger::CsvImport,
            );
        }

        return response()->json([
            'success' => true,
            'imported' => $result->inserted,
            'skipped_duplicate' => $result->skippedDuplicate,
        ]);
    }

    /**
     * @param  array<mixed>  $lineItems
     * @return list<mixed>
     */
    private function lineItemsForAccount(array $lineItems, int $accountId): array
    {
        return array_map(function (mixed $lineItem) use ($accountId): mixed {
            if (! is_array($lineItem)) {
                return $lineItem;
            }

            $lineItem['t_account'] = $accountId;

            return $lineItem;
        }, array_values($lineItems));
    }

    /**
     * @param  array<mixed>  $lineItems
     * @return list<string>
     */
    private function validateImportStatementIds(array $lineItems, mixed $statementId, int $accountId): array
    {
        $statementIds = [];

        if ($statementId !== null) {
            $statementIds[] = $statementId;
        }

        foreach ($lineItems as $lineItem) {
            if (is_array($lineItem) && array_key_exists('statement_id', $lineItem) && $lineItem['statement_id'] !== null) {
                $statementIds[] = $lineItem['statement_id'];
            }
        }

        if ($statementIds === []) {
            return [];
        }

        $errors = [];
        $normalizedStatementIds = [];

        foreach ($statementIds as $candidate) {
            if (! is_numeric($candidate)) {
                $errors[] = 'statement_id '.$this->stringValue($candidate).' must be numeric.';

                continue;
            }

            $normalizedStatementIds[] = (int) $candidate;
        }

        if ($normalizedStatementIds === []) {
            return $errors;
        }

        $ownedStatementIds = FinStatement::query()
            ->where('acct_id', $accountId)
            ->whereIn('statement_id', array_values(array_unique($normalizedStatementIds)))
            ->pluck('statement_id')
            ->map(fn ($id): int => (int) $id)
            ->flip()
            ->all();

        foreach (array_unique($normalizedStatementIds) as $candidate) {
            if (! isset($ownedStatementIds[$candidate])) {
                $errors[] = "statement_id {$candidate} was not found for this account.";
            }
        }

        return $errors;
    }

    private function stringValue(mixed $value): string
    {
        if (is_scalar($value) || $value === null) {
            return "'{$value}'";
        }

        return "'".get_debug_type($value)."'";
    }

    /**
     * Create a single transaction for an account
     */
    public function createTransaction(Request $request, int $account_id): JsonResponse
    {
        $account = $this->resolveOwnedAccount($account_id);

        $request->validate([
            't_date' => 'required|date',
            't_type' => 'nullable|string|max:50',
            't_amt' => 'nullable|numeric',
            't_description' => 'nullable|string|max:255',
            't_symbol' => 'nullable|string|max:20',
            't_qty' => 'nullable|numeric',
            't_price' => 'nullable|numeric',
            't_commission' => 'nullable|numeric',
            't_fee' => 'nullable|numeric',
            't_comment' => 'nullable|string|max:255',
        ]);

        $transaction = FinAccountLineItems::create([
            't_account' => $account->acct_id,
            't_date' => $request->t_date,
            't_type' => $request->t_type,
            't_amt' => $request->t_amt ?? 0,
            't_description' => $request->t_description,
            't_symbol' => $request->t_symbol,
            't_qty' => $request->t_qty ?? 0,
            't_price' => $request->t_price ?? 0,
            't_commission' => $request->t_commission ?? 0,
            't_fee' => $request->t_fee ?? 0,
            't_comment' => $request->t_comment,
            't_source' => 'manual',
        ]);

        return response()->json([
            'success' => true,
            't_id' => $transaction->t_id,
        ]);
    }

    /**
     * Get available years for transactions in one or all accounts.
     * Pass account_id = 'all' (or omit to use the default) to retrieve years across all accounts.
     */
    public function getTransactionYears(Request $request, int|string $account_id = 'all'): JsonResponse
    {
        if ($account_id === 'all') {
            $query = FinAccountLineItems::whereIn('t_account', $this->getUserAccountIds())->whereNotNull('t_date');
        } else {
            $account = $this->resolveOwnedAccount($account_id);
            $query = FinAccountLineItems::where('t_account', $account->acct_id)->whereNotNull('t_date');
        }

        // Use a database-agnostic approach: extract year in PHP
        $years = $query->pluck('t_date')
            ->map(fn ($date) => (int) substr((string) $date, 0, 4))
            ->filter(fn ($year) => $year > 0)
            ->unique()
            ->sort(fn ($a, $b) => $b - $a)
            ->values()
            ->toArray();

        return response()->json($years);
    }

    /**
     * Transform a line item (transaction) to its API representation
     *
     * @return array<string, mixed>
     */
    protected function transformLineItem(FinAccountLineItems $item, bool $redactTransactionDetails = false, bool $includeRsuLinks = false): array
    {
        $itemArray = $item->toArray();

        // Lots-view-only users receive trade economics needed for lot and
        // wash-sale analysis (symbol/type/qty/price/amount/fees/date) but not
        // the surrounding transaction-ledger detail.
        if ($redactTransactionDetails) {
            foreach (['t_description', 't_comment', 't_from', 't_to', 't_account_balance'] as $field) {
                $itemArray[$field] = null;
            }

            unset(
                $itemArray['tags'],
                $itemArray['parent_transactions'],
                $itemArray['child_transactions'],
                $itemArray['client_expense'],
                $itemArray['rsu_links'],
            );

            return $itemArray;
        }

        // Add parent_of_t_ids array (IDs of child transactions)
        $itemArray['parent_of_t_ids'] = $item->childTransactions->pluck('t_id')->toArray();

        // Add parent transaction info if exists (using the new many-to-many relationship)
        $parentTransaction = $item->parentTransactions->first();
        if ($parentTransaction) {
            $itemArray['parent_transaction'] = [
                't_id' => $parentTransaction->t_id,
                't_account' => $parentTransaction->t_account,
                'acct_name' => $parentTransaction->account?->acct_name,
                't_date' => $parentTransaction->t_date,
                't_description' => $parentTransaction->t_description,
                't_amt' => $parentTransaction->t_amt,
            ];
        }

        // Add child transactions info
        if ($item->childTransactions->count() > 0) {
            $itemArray['child_transactions'] = $item->childTransactions->map(function ($child) {
                return [
                    't_id' => $child->t_id,
                    't_account' => $child->t_account,
                    'acct_name' => $child->account?->acct_name,
                    't_date' => $child->t_date,
                    't_description' => $child->t_description,
                    't_amt' => $child->t_amt,
                ];
            })->toArray();
        }

        // Add client expense info if exists (store in a temp variable first)
        $clientExpenseData = null;
        if ($item->clientExpense) {
            $clientExpenseData = [
                'id' => $item->clientExpense->id,
                'description' => $item->clientExpense->description,
                'amount' => $item->clientExpense->amount,
                'is_reimbursable' => $item->clientExpense->is_reimbursable,
                'client_company' => $item->clientExpense->clientCompany ? [
                    'id' => $item->clientExpense->clientCompany->id,
                    'company_name' => $item->clientExpense->clientCompany->company_name,
                    'slug' => $item->clientExpense->clientCompany->slug,
                ] : null,
            ];
        }

        // Remove the raw relationship data
        unset($itemArray['parent_transactions']);
        unset($itemArray['client_expense']); // Remove the raw Eloquent relation data
        unset($itemArray['rsu_links']);

        // Add the formatted client expense data back
        if ($clientExpenseData) {
            $itemArray['client_expense'] = $clientExpenseData;
        }

        if (! $item->t_schc_category) {
            unset($itemArray['t_schc_category']);
        }
        if (empty($itemArray['parent_of_t_ids'])) {
            unset($itemArray['parent_of_t_ids']);
        }
        if ($includeRsuLinks && $item->relationLoaded('rsuLinks') && $item->rsuLinks->isNotEmpty()) {
            $itemArray['rsu_links'] = $item->rsuLinks
                ->map(fn (FinRsuLink $link): array => [
                    'id' => $link->id,
                    'settlement_id' => $link->settlement_id,
                    'settlement_allocation_id' => $link->settlement_allocation_id,
                    'equity_award_id' => $link->equity_award_id,
                    'link_type' => $link->link_type,
                    'transaction_id' => $link->transaction_id,
                    'account_id' => $link->account_id,
                    'lot_id' => $link->lot_id,
                    'payslip_id' => $link->payslip_id,
                    'status' => $link->status,
                    'settlement' => $link->settlement ? [
                        'id' => $link->settlement->id,
                        'vest_date' => $link->settlement->vest_date,
                        'symbol' => $link->settlement->symbol,
                        'status' => $link->settlement->status,
                    ] : null,
                ])
                ->values()
                ->all();
        }

        return $itemArray;
    }

    /**
     * Batch-delete multiple transactions at once.
     *
     * POST /api/finance/transactions/batch-delete
     * Body: { "t_ids": [1, 2, 3, ...] }
     *
     * Only transactions belonging to the authenticated user are deleted.
     * Returns the count of deleted rows.
     */
    public function batchDelete(Request $request, TransactionDeletionTombstoneService $tombstones): JsonResponse
    {
        $request->validate([
            't_ids' => 'required|array|min:1|max:1000',
            't_ids.*' => 'required|integer',
        ]);

        $userAccountIds = $this->getUserAccountIds();

        $tIds = $request->input('t_ids');
        $ownedTransactions = FinAccountLineItems::whereIn('t_id', $tIds)
            ->whereIn('t_account', $userAccountIds)
            ->get(['t_id', 't_account']);
        $ownedTransactionIds = $ownedTransactions->pluck('t_id');

        $deleted = DB::transaction(function () use ($ownedTransactions, $ownedTransactionIds, $tombstones, $userAccountIds): int {
            $tombstones->record($ownedTransactions, (int) Auth::id());

            // Unlink lots referencing only this user's transactions
            FinAccountLot::whereIn('acct_id', $userAccountIds)
                ->whereIn('open_t_id', $ownedTransactionIds)
                ->update(['open_t_id' => null]);
            FinAccountLot::whereIn('acct_id', $userAccountIds)
                ->whereIn('close_t_id', $ownedTransactionIds)
                ->update(['close_t_id' => null]);

            return FinAccountLineItems::whereIn('t_id', $ownedTransactionIds)
                ->whereIn('t_account', $userAccountIds)
                ->delete();
        });

        return response()->json(['success' => true, 'deleted' => $deleted]);
    }

    /**
     * Batch-update a subset of fields on multiple transactions.
     *
     * POST /api/finance/transactions/batch-update
     * Body: { "t_ids": [1, 2, 3], "fields": { "t_schc_category": "Office", ... } }
     *
     * Allowed fields: t_date, t_type, t_amt, t_comment, t_description, t_qty, t_price, t_commission, t_fee, t_symbol, t_schc_category
     * Only transactions belonging to the authenticated user are updated.
     */
    public function batchUpdate(Request $request): JsonResponse
    {
        $request->validate([
            't_ids' => 'required|array|min:1|max:1000',
            't_ids.*' => 'required|integer',
            'fields' => 'required|array|min:1',
            'fields.t_date' => 'nullable|date',
            'fields.t_type' => 'nullable|string|max:50',
            'fields.t_amt' => 'nullable|numeric',
            'fields.t_comment' => 'nullable|string|max:255',
            'fields.t_description' => 'nullable|string|max:255',
            'fields.t_qty' => 'nullable|numeric',
            'fields.t_price' => 'nullable|numeric',
            'fields.t_commission' => 'nullable|numeric',
            'fields.t_fee' => 'nullable|numeric',
            'fields.t_symbol' => 'nullable|string|max:20',
            'fields.t_schc_category' => 'nullable|string|max:255',
        ]);

        $userAccountIds = $this->getUserAccountIds();

        $tIds = $request->input('t_ids');
        $rawFields = $request->input('fields');

        // Only allow a safe whitelist of fields to be batch-updated
        $allowed = [
            't_date',
            't_type',
            't_amt',
            't_comment',
            't_description',
            't_qty',
            't_price',
            't_commission',
            't_fee',
            't_symbol',
            't_schc_category',
        ];
        $fields = array_intersect_key($rawFields, array_flip($allowed));

        if (empty($fields)) {
            return response()->json(['error' => 'No updatable fields provided.'], 422);
        }

        $updated = FinAccountLineItems::whereIn('t_id', $tIds)
            ->whereIn('t_account', $userAccountIds)
            ->update($fields);

        return response()->json(['success' => true, 'updated' => $updated]);
    }
}
