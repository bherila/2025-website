<?php

namespace App\Services\Finance;

use App\Enums\Finance\LotMatcherAutoTrigger;
use App\Models\Files\FileForFinAccount;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinAccountTag;
use App\Models\FinanceTool\FinDocument;
use App\Models\FinanceTool\FinDocumentAccount;
use App\Models\FinanceTool\FinStatementDetail;
use App\Services\Finance\CapitalGains\LotMatcherAutoDispatchService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class DocumentIngestionService
{
    private const string SYNTHETIC_FEE_SOURCE = 'stmt_fee_synth';

    private const string MANAGEMENT_FEE_LABEL = 'Management Fee';

    private const string INCENTIVE_ALLOCATION_LABEL = 'Incentive Allocation';

    private const string TOTAL_FEES_LABEL = 'Total Fees';

    private const array FEE_TRANSACTION_TYPES = ['fee', 'advisory fee', 'management fee'];

    public function __construct(
        private readonly TransactionImportService $transactionImportService,
        private readonly LotMatcherAutoDispatchService $lotMatcherAutoDispatchService,
    ) {}

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function createDocument(array $attributes): FinDocument
    {
        $fileHash = is_string($attributes['file_hash'] ?? null) && trim($attributes['file_hash']) !== ''
            ? trim((string) $attributes['file_hash'])
            : null;

        $values = [
            'user_id' => $attributes['user_id'],
            'document_kind' => $attributes['document_kind'],
            'tax_year' => $attributes['tax_year'] ?? null,
            'period_start' => $attributes['period_start'] ?? null,
            'period_end' => $attributes['period_end'] ?? null,
            'original_filename' => $attributes['original_filename'] ?? null,
            'stored_filename' => $attributes['stored_filename'] ?? null,
            's3_path' => $attributes['s3_path'] ?? null,
            'mime_type' => $attributes['mime_type'] ?? null,
            'file_size_bytes' => $attributes['file_size_bytes'] ?? null,
            'file_hash' => $fileHash,
            'uploaded_by_user_id' => $attributes['uploaded_by_user_id'] ?? null,
            'genai_job_id' => $attributes['genai_job_id'] ?? null,
            'genai_status' => $attributes['genai_status'] ?? null,
            'parsed_data' => $attributes['parsed_data'] ?? null,
            'parsed_data_needs_review' => (bool) ($attributes['parsed_data_needs_review'] ?? false),
            'parsed_data_warnings' => $attributes['parsed_data_warnings'] ?? null,
            'notes' => $attributes['notes'] ?? null,
            'is_reviewed' => (bool) ($attributes['is_reviewed'] ?? false),
            'download_history' => $attributes['download_history'] ?? null,
        ];

        if ($fileHash !== null) {
            $document = FinDocument::query()->firstOrCreate([
                'user_id' => $attributes['user_id'],
                'document_kind' => $attributes['document_kind'],
                'file_hash' => $fileHash,
            ], $values);

            if (! $document->wasRecentlyCreated) {
                $this->mergeDocumentDateRange($document, $values);
            }

            return $document;
        }

        return FinDocument::create($values);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function createTaxFormDetail(array $attributes): FileForTaxDocument
    {
        return DB::transaction(function () use ($attributes): FileForTaxDocument {
            $document = $this->createDocument($this->documentAttributesFromTaxAttributes($attributes));

            $existingTaxDocument = FileForTaxDocument::query()
                ->where('document_id', $document->id)
                ->first();

            if ($existingTaxDocument instanceof FileForTaxDocument) {
                return $existingTaxDocument;
            }

            $taxAttributes = $attributes;
            $taxAttributes['document_id'] = $document->id;

            return FileForTaxDocument::create($taxAttributes);
        });
    }

    public function createForTaxDocument(FileForTaxDocument $taxDocument): FinDocument
    {
        if ($taxDocument->document_id !== null) {
            $document = FinDocument::query()->find($taxDocument->document_id);
            if ($document instanceof FinDocument) {
                return $document;
            }
        }

        $document = $this->createDocument($this->attributesFromTaxDocument($taxDocument));
        $taxDocument->forceFill(['document_id' => $document->id])->save();

        return $document;
    }

    public function syncFromTaxDocument(FileForTaxDocument $taxDocument): void
    {
        if ($taxDocument->document_id === null) {
            $this->createForTaxDocument($taxDocument);

            return;
        }

        $document = FinDocument::query()->find($taxDocument->document_id);
        if ($document instanceof FinDocument) {
            $document->fill($this->attributesFromTaxDocument($taxDocument, includeKeys: false));
            $document->save();
        }
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array{document: FinDocument, accounts: array<int, array<string, int>>}
     */
    public function ingestStatementDocument(int $userId, array $payload): array
    {
        return DB::transaction(function () use ($userId, $payload): array {
            $accounts = $payload['accounts'] ?? null;
            if (! is_array($accounts) || $accounts === []) {
                throw ValidationException::withMessages(['accounts' => 'At least one account block is required.']);
            }
            $periodBounds = $this->statementPeriodBounds($accounts);

            $document = $this->createDocument([
                'user_id' => $userId,
                'document_kind' => $payload['document_kind'] ?? FinDocument::KIND_STATEMENT,
                'period_start' => $periodBounds['period_start'],
                'period_end' => $periodBounds['period_end'],
                'original_filename' => $payload['original_filename'] ?? null,
                'stored_filename' => $payload['stored_filename'] ?? null,
                's3_path' => $payload['s3_key'] ?? $payload['s3_path'] ?? null,
                'mime_type' => $payload['mime_type'] ?? null,
                'file_size_bytes' => $payload['file_size_bytes'] ?? null,
                'file_hash' => $payload['file_hash'] ?? null,
                'uploaded_by_user_id' => $userId,
                'parsed_data' => ['accounts' => $accounts],
                'genai_status' => 'parsed',
            ]);

            if (! $document->wasRecentlyCreated && $document->statements()->exists()) {
                $this->lotMatcherAutoDispatchService->dispatchForDocument(
                    documentId: (int) $document->id,
                    trigger: LotMatcherAutoTrigger::CsvImport,
                );

                return [
                    'document' => $document->fresh(['accounts.account']) ?? $document,
                    'accounts' => $this->existingStatementResults($document),
                ];
            }

            $results = [];
            foreach ($accounts as $accountData) {
                if (! is_array($accountData)) {
                    continue;
                }

                $result = $this->ingestStatementAccount($userId, $document, $accountData, (string) ($payload['file_hash'] ?? ''));
                $results[] = $result;
            }

            $this->lotMatcherAutoDispatchService->dispatchForDocument(
                documentId: (int) $document->id,
                trigger: LotMatcherAutoTrigger::CsvImport,
            );

            return [
                'document' => $document->fresh(['accounts.account']) ?? $document,
                'accounts' => $results,
            ];
        });
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array{document: FinDocument, accounts: array<int, array<string, int>>}
     */
    public function ingestCsvDocument(int $userId, array $payload): array
    {
        $payload['document_kind'] = FinDocument::KIND_CSV_IMPORT;

        return $this->ingestStatementDocument($userId, $payload);
    }

    /**
     * @param  array<string, mixed>  $accountData
     * @return array<string, int>
     */
    private function ingestStatementAccount(int $userId, FinDocument $document, array $accountData, string $fileHash): array
    {
        $accountId = $accountData['acct_id'] ?? null;
        if (! is_numeric($accountId)) {
            throw ValidationException::withMessages(['accounts' => 'Each account block must resolve to an account.']);
        }

        $account = FinAccounts::query()
            ->where('acct_id', (int) $accountId)
            ->where('acct_owner', $userId)
            ->first();

        if (! $account instanceof FinAccounts) {
            throw ValidationException::withMessages(['accounts' => 'One or more accounts do not belong to you.']);
        }

        $statementInfo = is_array($accountData['statementInfo'] ?? null) ? $accountData['statementInfo'] : [];
        $statementDetails = is_array($accountData['statementDetails'] ?? null) ? $accountData['statementDetails'] : [];
        $transactions = is_array($accountData['transactions'] ?? null) ? $accountData['transactions'] : [];
        $lots = is_array($accountData['lots'] ?? null) ? $accountData['lots'] : [];

        $periodStart = $this->dateOnly($statementInfo['periodStart'] ?? null);
        $periodEnd = $this->dateOnly($statementInfo['periodEnd'] ?? null) ?? now()->format('Y-m-d');
        $closingBalance = $statementInfo['closingBalance'] ?? 0;

        $statementId = (int) DB::table('fin_statements')->insertGetId([
            'document_id' => $document->id,
            'acct_id' => (int) $account->acct_id,
            'balance' => (string) $closingBalance,
            'statement_opening_date' => $periodStart,
            'statement_closing_date' => $periodEnd,
        ]);

        $this->attachSourceFile((int) $userId, (int) $account->acct_id, $statementId, $fileHash);
        $this->insertStatementDetails($statementId, $statementDetails);

        $transactionsCount = $this->importTransactions($userId, (int) $account->acct_id, $statementId, $transactions);
        $feeTransactionsCount = $this->synthesizeFeeTransactions(
            userId: $userId,
            accountId: (int) $account->acct_id,
            statementId: $statementId,
            periodStart: $periodStart,
            periodEnd: $periodEnd,
            statementDetails: $statementDetails,
        );
        $lotsCount = $this->insertLots(
            documentId: (int) $document->id,
            accountId: (int) $account->acct_id,
            statementId: $statementId,
            lots: $lots,
            lotOriginForClosedLots: $document->document_kind === FinDocument::KIND_CSV_IMPORT
                ? FinAccountLot::ORIGIN_CSV_IMPORT
                : FinAccountLot::ORIGIN_STATEMENT_DISPOSITION,
        );

        FinDocumentAccount::createLink(
            documentId: (int) $document->id,
            accountId: (int) $account->acct_id,
            statementId: $statementId,
            accountSectionLabel: $this->accountSectionLabel($accountData, $account),
            payloadKind: $this->payloadKindForAccount($lots, $document->document_kind),
        );

        return [
            'acct_id' => (int) $account->acct_id,
            'statement_id' => $statementId,
            'transactions_count' => $transactionsCount + $feeTransactionsCount,
            'fee_transactions_count' => $feeTransactionsCount,
            'lots_count' => $lotsCount,
            'details_count' => count($statementDetails),
        ];
    }

    /**
     * @param  array<int, mixed>  $statementDetails
     */
    private function insertStatementDetails(int $statementId, array $statementDetails): void
    {
        if ($statementDetails === []) {
            return;
        }

        $now = now();
        $rows = [];
        foreach ($statementDetails as $detail) {
            if (! is_array($detail)) {
                continue;
            }

            $rows[] = [
                'statement_id' => $statementId,
                'section' => $detail['section'] ?? '',
                'line_item' => $detail['line_item'] ?? '',
                'statement_period_value' => $detail['statement_period_value'] ?? 0,
                'ytd_value' => $detail['ytd_value'] ?? 0,
                'is_percentage' => $detail['is_percentage'] ?? false,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        if ($rows !== []) {
            FinStatementDetail::insert($rows);
        }
    }

    /**
     * @param  array<int, mixed>  $transactions
     */
    private function importTransactions(int $userId, int $accountId, int $statementId, array $transactions): int
    {
        if ($transactions === []) {
            return 0;
        }

        $rows = array_map(static function (mixed $transaction): mixed {
            if (is_array($transaction)) {
                unset($transaction['statement_id']);
            }

            return $transaction;
        }, TransactionImportService::transactionsFromPayload(['transactions' => $transactions]));

        $result = $this->transactionImportService->importForUser(
            $userId,
            $rows,
            [
                'default_account_id' => $accountId,
                'default_statement_id' => $statementId,
                'allow_row_statement_id' => true,
                'require_type' => false,
                'source' => 'import',
                'include_defaults' => true,
            ],
        );

        if ($result->hasErrors()) {
            throw ValidationException::withMessages(['transactions' => $result->errors]);
        }

        return $result->inserted;
    }

    /**
     * @param  array<int, mixed>  $statementDetails
     */
    private function synthesizeFeeTransactions(
        int $userId,
        int $accountId,
        int $statementId,
        ?string $periodStart,
        string $periodEnd,
        array $statementDetails,
    ): int {
        DB::table('fin_account_line_items')
            ->where('statement_id', $statementId)
            ->where('t_account', $accountId)
            ->where('t_source', self::SYNTHETIC_FEE_SOURCE)
            ->delete();

        if ($statementDetails === []) {
            return 0;
        }

        $count = 0;

        foreach ($statementDetails as $detail) {
            if (! is_array($detail)) {
                continue;
            }

            $feeDetail = $this->feeDetailFromStatementDetail($detail);
            if ($feeDetail === null) {
                continue;
            }

            $tag = $this->feeTagForCharacteristic($userId, $feeDetail['tax_characteristic']);
            $matchingTransactionIds = $this->matchingImportedFeeTransactionIds(
                accountId: $accountId,
                statementId: $statementId,
                periodStart: $periodStart,
                periodEnd: $periodEnd,
                feeDetail: $feeDetail,
            );

            if ($matchingTransactionIds !== []) {
                $this->attachFeeTagToTransactions($matchingTransactionIds, (int) $tag->tag_id);

                continue;
            }

            $now = now();
            $transactionId = DB::table('fin_account_line_items')->insertGetId([
                't_account' => $accountId,
                'statement_id' => $statementId,
                't_date' => $periodEnd,
                't_type' => 'Fee',
                't_amt' => $feeDetail['amount'],
                't_qty' => 0,
                't_price' => 0,
                't_commission' => 0,
                't_fee' => 0,
                't_source' => self::SYNTHETIC_FEE_SOURCE,
                't_origin' => 'import',
                'opt_strike' => 0,
                't_description' => $feeDetail['line_item'],
                't_comment' => 'Synthesized from statement detail.',
                'when_added' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            DB::table('fin_account_line_item_tag_map')->insertOrIgnore([
                't_id' => $transactionId,
                'tag_id' => (int) $tag->tag_id,
            ]);

            $count++;
        }

        return $count;
    }

    /**
     * @param  array<string, mixed>  $detail
     * @return array{line_item: string, match: string, amount: float, tax_characteristic: string}|null
     */
    private function feeDetailFromStatementDetail(array $detail): ?array
    {
        if ((bool) ($detail['is_percentage'] ?? false)) {
            return null;
        }

        $rawLineItem = $detail['line_item'] ?? '';
        $rawSection = $detail['section'] ?? '';
        $lineItem = is_string($rawLineItem) ? trim($rawLineItem) : '';
        $section = is_string($rawSection) ? trim($rawSection) : '';
        $normalizedLineItem = $this->normalizeStatementDetailText($lineItem);

        if ($normalizedLineItem === $this->normalizeStatementDetailText(self::TOTAL_FEES_LABEL)) {
            return null;
        }

        $feeKind = $this->feeKindForLineItem($normalizedLineItem);
        if ($feeKind === null) {
            return null;
        }

        $normalizedSection = $this->normalizeStatementDetailText($section);
        $isFeesSection = str_contains($normalizedSection, 'fees') || str_contains($normalizedSection, 'fee');
        $isLineItemFallback = str_contains($normalizedLineItem, $feeKind['match']);
        if (! $isFeesSection && ! $isLineItemFallback) {
            return null;
        }

        $value = $this->numericStatementDetailValue($detail['statement_period_value'] ?? null);
        if ($value === null || $value === 0.0) {
            return null;
        }

        $isCredit = $value < 0 || preg_match('/\b(credit|rebate|reversal)\b/', $normalizedLineItem) === 1;

        return [
            'line_item' => $lineItem !== '' ? substr($lineItem, 0, 255) : $feeKind['label'],
            'match' => $feeKind['match'],
            'amount' => $isCredit ? abs($value) : -abs($value),
            'tax_characteristic' => $feeKind['tax_characteristic'],
        ];
    }

    /**
     * @return array{label: string, match: string, tax_characteristic: string}|null
     */
    private function feeKindForLineItem(string $normalizedLineItem): ?array
    {
        $managementFee = $this->normalizeStatementDetailText(self::MANAGEMENT_FEE_LABEL);
        if (str_contains($normalizedLineItem, $managementFee)) {
            return [
                'label' => self::MANAGEMENT_FEE_LABEL,
                'match' => $managementFee,
                'tax_characteristic' => 'fee_irc67g',
            ];
        }

        $incentiveAllocation = $this->normalizeStatementDetailText(self::INCENTIVE_ALLOCATION_LABEL);
        if (str_contains($normalizedLineItem, $incentiveAllocation)) {
            return [
                'label' => self::INCENTIVE_ALLOCATION_LABEL,
                'match' => $incentiveAllocation,
                'tax_characteristic' => 'fee_schE',
            ];
        }

        return null;
    }

    private function normalizeStatementDetailText(string $value): string
    {
        $normalized = strtolower(trim($value));
        $normalized = preg_replace('/\s+/', ' ', $normalized);

        return $normalized ?? '';
    }

    private function numericStatementDetailValue(mixed $value): ?float
    {
        if (is_numeric($value)) {
            return (float) $value;
        }

        if (! is_string($value)) {
            return null;
        }

        $normalized = str_replace([',', '$'], '', trim($value));
        if (! is_numeric($normalized)) {
            return null;
        }

        return (float) $normalized;
    }

    private function feeTagForCharacteristic(int $userId, string $taxCharacteristic): FinAccountTag
    {
        $tagUserId = (string) $userId;
        $label = FinAccountTag::labelFor($taxCharacteristic);

        $tag = FinAccountTag::query()
            ->where('tag_userid', $tagUserId)
            ->where('tag_label', $label)
            ->first();

        if ($tag instanceof FinAccountTag) {
            if ($tag->tax_characteristic !== $taxCharacteristic) {
                $tag->tax_characteristic = $taxCharacteristic;
                $tag->save();
            }

            return $tag;
        }

        $tag = FinAccountTag::query()
            ->where('tag_userid', $tagUserId)
            ->where('tax_characteristic', $taxCharacteristic)
            ->first();

        if ($tag instanceof FinAccountTag) {
            if ($tag->tag_label !== $label) {
                $tag->tag_label = $label;
                $tag->save();
            }

            return $tag;
        }

        return FinAccountTag::query()->create([
            'tag_userid' => $tagUserId,
            'tag_label' => $label,
            'tag_color' => '#2563eb',
            'tax_characteristic' => $taxCharacteristic,
        ]);
    }

    /**
     * @param  array{line_item: string, match: string, amount: float, tax_characteristic: string}  $feeDetail
     * @return array<int, int>
     */
    private function matchingImportedFeeTransactionIds(
        int $accountId,
        int $statementId,
        ?string $periodStart,
        string $periodEnd,
        array $feeDetail,
    ): array {
        $query = DB::table('fin_account_line_items')
            ->where('statement_id', $statementId)
            ->where('t_account', $accountId)
            ->where(function ($query): void {
                $query->whereNull('t_source')
                    ->orWhere('t_source', '!=', self::SYNTHETIC_FEE_SOURCE);
            });

        if ($periodStart !== null) {
            $dateBounds = [$periodStart, $periodEnd];
            sort($dateBounds);
            $query->whereBetween('t_date', $dateBounds);
        }

        return $query
            ->whereRaw('ABS(COALESCE(t_amt, 0) - ?) < 0.0001', [$feeDetail['amount']])
            ->where(function ($query) use ($feeDetail): void {
                $query->whereRaw(
                    "LOWER(COALESCE(t_type, '')) IN (?, ?, ?)",
                    self::FEE_TRANSACTION_TYPES,
                )->orWhereRaw(
                    "LOWER(COALESCE(t_description, '')) LIKE ?",
                    ['%'.$feeDetail['match'].'%'],
                );
            })
            ->pluck('t_id')
            ->map(static fn (mixed $transactionId): int => (int) $transactionId)
            ->all();
    }

    /**
     * @param  array<int, int>  $transactionIds
     */
    private function attachFeeTagToTransactions(array $transactionIds, int $tagId): void
    {
        foreach ($transactionIds as $transactionId) {
            DB::table('fin_account_line_item_tag_map')->insertOrIgnore([
                't_id' => $transactionId,
                'tag_id' => $tagId,
            ]);
        }
    }

    /**
     * @param  array<int, mixed>  $lots
     */
    private function insertLots(
        int $documentId,
        int $accountId,
        int $statementId,
        array $lots,
        string $lotOriginForClosedLots,
    ): int {
        if ($lots === []) {
            return 0;
        }

        $rows = [];
        foreach ($lots as $lot) {
            if (! is_array($lot)) {
                continue;
            }

            $purchaseDate = $this->dateOnly($lot['purchaseDate'] ?? null);
            if ($purchaseDate === null) {
                continue;
            }

            $saleDate = $this->dateOnly($lot['saleDate'] ?? null);
            $metrics = FinAccountLot::computeMetrics(
                $purchaseDate,
                $saleDate,
                isset($lot['proceeds']) ? (float) $lot['proceeds'] : null,
                isset($lot['costBasis']) ? (float) $lot['costBasis'] : 0.0,
            );

            $realizedGainLoss = $lot['realizedGainLoss'] ?? $metrics['realized_gain_loss'];
            $lotOrigin = $saleDate !== null ? $lotOriginForClosedLots : FinAccountLot::ORIGIN_STATEMENT_POSITION;

            $rows[] = [
                'acct_id' => $accountId,
                'document_id' => $documentId,
                'symbol' => $lot['symbol'] ?? '',
                'description' => $lot['description'] ?? null,
                'quantity' => $lot['quantity'] ?? 0,
                'purchase_date' => $purchaseDate,
                'cost_basis' => $lot['costBasis'] ?? 0,
                'cost_per_unit' => $lot['costPerUnit'] ?? null,
                'sale_date' => $saleDate,
                'proceeds' => $lot['proceeds'] ?? null,
                'realized_gain_loss' => $realizedGainLoss,
                'is_short_term' => $metrics['is_short_term'],
                'lot_source' => 'import',
                'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
                'statement_id' => $statementId,
                'lot_origin' => $lotOrigin,
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }

        if ($rows === []) {
            return 0;
        }

        FinAccountLot::insert($rows);

        return count($rows);
    }

    private function attachSourceFile(int $userId, int $accountId, int $statementId, string $fileHash): void
    {
        if (trim($fileHash) === '') {
            return;
        }

        $fileRecord = FileForFinAccount::query()
            ->where('acct_id', $accountId)
            ->where('file_hash', $fileHash)
            ->first();

        if ($fileRecord instanceof FileForFinAccount) {
            if ($fileRecord->statement_id === null) {
                $fileRecord->update(['statement_id' => $statementId]);
            }

            return;
        }

        $sourceFile = FileForFinAccount::query()
            ->where('file_hash', $fileHash)
            ->whereIn('acct_id', function ($query) use ($userId): void {
                $query->select('acct_id')
                    ->from('fin_accounts')
                    ->where('acct_owner', $userId);
            })
            ->first();

        if (! $sourceFile instanceof FileForFinAccount) {
            return;
        }

        FileForFinAccount::create([
            'acct_id' => $accountId,
            'statement_id' => $statementId,
            'file_hash' => $sourceFile->file_hash,
            'original_filename' => $sourceFile->original_filename,
            'stored_filename' => $sourceFile->stored_filename,
            's3_path' => $sourceFile->s3_path,
            'mime_type' => $sourceFile->mime_type,
            'file_size_bytes' => $sourceFile->file_size_bytes,
            'uploaded_by_user_id' => $sourceFile->uploaded_by_user_id,
        ]);
    }

    /**
     * @param  array<string, mixed>  $accountData
     */
    private function accountSectionLabel(array $accountData, FinAccounts $account): string
    {
        $statementInfo = is_array($accountData['statementInfo'] ?? null) ? $accountData['statementInfo'] : [];

        foreach (['accountName', 'accountNumber', 'brokerName'] as $key) {
            $value = $statementInfo[$key] ?? null;
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return $account->acct_name;
    }

    /**
     * @param  array<int, mixed>  $lots
     */
    private function payloadKindForAccount(array $lots, string $documentKind): string
    {
        if ($documentKind === FinDocument::KIND_CSV_IMPORT) {
            return FinDocumentAccount::PAYLOAD_CSV_IMPORT;
        }

        foreach ($lots as $lot) {
            if (is_array($lot) && $this->dateOnly($lot['saleDate'] ?? null) !== null) {
                return FinDocumentAccount::PAYLOAD_DISPOSITIONS;
            }
        }

        return FinDocumentAccount::PAYLOAD_POSITIONS;
    }

    /**
     * @return array<int, array<string, int>>
     */
    private function existingStatementResults(FinDocument $document): array
    {
        return $document->statements()
            ->withCount(['details', 'transactions', 'lots'])
            ->withCount([
                'transactions as fee_transactions_count' => static function ($query): void {
                    $query->where('t_source', self::SYNTHETIC_FEE_SOURCE);
                },
            ])
            ->orderBy('statement_id')
            ->get()
            ->map(static fn ($statement): array => [
                'acct_id' => (int) $statement->acct_id,
                'statement_id' => (int) $statement->statement_id,
                'transactions_count' => (int) $statement->transactions_count,
                'fee_transactions_count' => (int) $statement->getAttribute('fee_transactions_count'),
                'lots_count' => (int) $statement->lots_count,
                'details_count' => (int) $statement->details_count,
            ])
            ->all();
    }

    /**
     * @param  array<int, mixed>  $accounts
     * @return array{period_start: string|null, period_end: string|null}
     */
    private function statementPeriodBounds(array $accounts): array
    {
        $starts = [];
        $ends = [];

        foreach ($accounts as $accountData) {
            if (! is_array($accountData)) {
                continue;
            }

            $statementInfo = is_array($accountData['statementInfo'] ?? null) ? $accountData['statementInfo'] : [];
            $periodStart = $this->dateOnly($statementInfo['periodStart'] ?? null);
            $periodEnd = $this->dateOnly($statementInfo['periodEnd'] ?? null);

            if ($periodStart !== null) {
                $starts[] = $periodStart;
            }

            if ($periodEnd !== null) {
                $ends[] = $periodEnd;
            }
        }

        sort($starts);
        sort($ends);

        return [
            'period_start' => $starts[0] ?? null,
            'period_end' => $ends === [] ? null : $ends[count($ends) - 1],
        ];
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function mergeDocumentDateRange(FinDocument $document, array $attributes): void
    {
        $updates = [];
        $periodStart = $this->dateOnly($attributes['period_start'] ?? null);
        $periodEnd = $this->dateOnly($attributes['period_end'] ?? null);
        $existingStart = $this->dateOnly($document->getAttribute('period_start'));
        $existingEnd = $this->dateOnly($document->getAttribute('period_end'));

        if ($periodStart !== null && ($existingStart === null || $periodStart < $existingStart)) {
            $updates['period_start'] = $periodStart;
        }

        if ($periodEnd !== null && ($existingEnd === null || $periodEnd > $existingEnd)) {
            $updates['period_end'] = $periodEnd;
        }

        if ($updates !== []) {
            $document->forceFill($updates)->save();
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function attributesFromTaxDocument(FileForTaxDocument $taxDocument, bool $includeKeys = true): array
    {
        $attributes = [
            'tax_year' => $taxDocument->tax_year,
            'original_filename' => $taxDocument->original_filename,
            'stored_filename' => $taxDocument->stored_filename,
            's3_path' => $taxDocument->s3_path,
            'mime_type' => $taxDocument->mime_type,
            'file_size_bytes' => $taxDocument->file_size_bytes,
            'file_hash' => $taxDocument->file_hash,
            'uploaded_by_user_id' => $taxDocument->uploaded_by_user_id,
            'genai_job_id' => $taxDocument->genai_job_id,
            'genai_status' => $taxDocument->genai_status,
            'parsed_data' => $taxDocument->parsed_data,
            'parsed_data_needs_review' => $taxDocument->parsed_data_needs_review,
            'parsed_data_warnings' => $taxDocument->parsed_data_warnings,
            'notes' => $taxDocument->notes,
            'is_reviewed' => $taxDocument->is_reviewed,
            'download_history' => $taxDocument->download_history,
        ];

        if ($includeKeys) {
            $attributes['user_id'] = $taxDocument->user_id;
            $attributes['document_kind'] = FinDocument::KIND_TAX_FORM;
        }

        return $attributes;
    }

    /**
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    private function documentAttributesFromTaxAttributes(array $attributes): array
    {
        return [
            'user_id' => $attributes['user_id'],
            'document_kind' => FinDocument::KIND_TAX_FORM,
            'tax_year' => $attributes['tax_year'] ?? null,
            'original_filename' => $attributes['original_filename'] ?? null,
            'stored_filename' => $attributes['stored_filename'] ?? null,
            's3_path' => $attributes['s3_path'] ?? null,
            'mime_type' => $attributes['mime_type'] ?? null,
            'file_size_bytes' => $attributes['file_size_bytes'] ?? null,
            'file_hash' => $attributes['file_hash'] ?? null,
            'uploaded_by_user_id' => $attributes['uploaded_by_user_id'] ?? null,
            'genai_job_id' => $attributes['genai_job_id'] ?? null,
            'genai_status' => $attributes['genai_status'] ?? null,
            'parsed_data' => $attributes['parsed_data'] ?? null,
            'parsed_data_needs_review' => (bool) ($attributes['parsed_data_needs_review'] ?? false),
            'parsed_data_warnings' => $attributes['parsed_data_warnings'] ?? null,
            'notes' => $attributes['notes'] ?? null,
            'is_reviewed' => (bool) ($attributes['is_reviewed'] ?? false),
            'download_history' => $attributes['download_history'] ?? null,
        ];
    }

    private function dateOnly(mixed $value): ?string
    {
        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d');
        }

        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        return substr(trim($value), 0, 10);
    }
}
