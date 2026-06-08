<?php

namespace App\Console\Commands\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinDocument;
use App\Models\FinanceTool\FinDocumentAccount;
use App\Models\FinanceTool\FinStatement;
use App\Models\User;
use App\Services\FileStorageService;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

class FinancePrivateFundsReconcileCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:private-funds:reconcile
        {--root= : Financial document root; defaults to FINANCE_PRIVATE_FUNDS_ROOT}
        {--map= : Folder-to-account map JSON file; defaults to FINANCE_PRIVATE_FUNDS_MAP}
        {--user= : User ID; defaults to FINANCE_CLI_USER_ID, then 1}
        {--apply : Write account/document changes and upload files to configured storage}
        {--format=table : Output format: table or json}';

    protected $description = 'Reconcile local private fund documents into finance accounts and canonical documents';

    public function __construct(private readonly FileStorageService $fileStorageService)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        if (! $this->validateFormat()) {
            return 1;
        }

        $user = $this->targetUser();
        if (! $user instanceof User) {
            return 1;
        }

        $rootOption = $this->option('root') ?: getenv('FINANCE_PRIVATE_FUNDS_ROOT');
        if (! is_string($rootOption) || trim($rootOption) === '') {
            $this->error('Document root is required. Pass --root or set FINANCE_PRIVATE_FUNDS_ROOT.');

            return 1;
        }

        $root = $this->normaliseRoot($rootOption);
        if (! is_dir($root)) {
            $this->error("Document root not found: {$root}");

            return 1;
        }

        $folderMap = $this->loadFolderMap();
        if ($folderMap === null) {
            return 1;
        }

        $apply = (bool) $this->option('apply');
        $events = [];
        $documents = $this->scanDocuments($root, $folderMap, $events);
        $accounts = $this->ensureAccounts((int) $user->id, $folderMap, $apply, $events);

        foreach ($documents as $document) {
            $account = $accounts[$document['account_name']] ?? null;

            if (! $account instanceof FinAccounts) {
                if (! $apply) {
                    $events[] = $this->event('document', (string) $document['relative_path'], 'would_import', (string) $document['document_type']);

                    continue;
                }

                $events[] = $this->event('document', $document['relative_path'], 'missing_account', $document['account_name']);

                continue;
            }

            $this->reconcileDocument((int) $user->id, $account, $document, $apply, $events);
        }

        $summary = [
            'mode' => $apply ? 'apply' : 'dry-run',
            'root' => $root,
            'user_id' => (int) $user->id,
            'documents_scanned' => count($documents),
            'events' => $events,
        ];

        if (($this->option('format') ?? 'table') === 'json') {
            $this->outputJson($summary);

            return 0;
        }

        $this->line('Mode: '.$summary['mode']);
        $this->line('Root: '.$summary['root']);
        $this->line('Documents scanned: '.$summary['documents_scanned']);
        $this->renderTable(
            ['area', 'target', 'status', 'details'],
            array_map(
                static fn (array $event): array => [$event['area'], $event['target'], $event['status'], $event['details']],
                $events,
            ),
        );

        return 0;
    }

    private function targetUser(): ?User
    {
        $environmentUserId = getenv('FINANCE_CLI_USER_ID');
        $userId = (int) ($this->option('user') ?: ($environmentUserId !== false ? $environmentUserId : 1) ?: 1);
        $user = User::query()->find($userId);

        if (! $user instanceof User) {
            $this->error("User ID {$userId} not found.");

            return null;
        }

        return $user;
    }

    private function normaliseRoot(string $root): string
    {
        return rtrim($root, DIRECTORY_SEPARATOR);
    }

    /**
     * Load the folder-to-account map from the JSON file given by --map or
     * FINANCE_PRIVATE_FUNDS_MAP. The map keeps confidential fund, partnership,
     * and account names out of the repository.
     *
     * Expected JSON shape (object keyed by folder name):
     *
     *   {
     *     "folder name": {
     *       "account": "canonical account name",
     *       "aliases": ["existing account name", "..."],
     *       "date_prefixed": false
     *     }
     *   }
     *
     * @return array<string, array{account: string, aliases: list<string>, date_prefixed: bool}>|null
     */
    private function loadFolderMap(): ?array
    {
        $mapOption = $this->option('map') ?: getenv('FINANCE_PRIVATE_FUNDS_MAP');
        if (! is_string($mapOption) || trim($mapOption) === '') {
            $this->error('Folder map is required. Pass --map or set FINANCE_PRIVATE_FUNDS_MAP.');

            return null;
        }

        if (! is_file($mapOption)) {
            $this->error("Folder map not found: {$mapOption}");

            return null;
        }

        $raw = file_get_contents($mapOption);
        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        if (! is_array($decoded)) {
            $this->error("Folder map is not valid JSON: {$mapOption}");

            return null;
        }

        $map = [];
        foreach ($decoded as $folder => $config) {
            if (! is_string($folder) || ! is_array($config) || ! isset($config['account']) || ! is_string($config['account'])) {
                $this->error('Folder map entries must be keyed by folder name and contain a string "account".');

                return null;
            }

            $aliases = $config['aliases'] ?? [$config['account']];
            if (! is_array($aliases)) {
                $this->error("Folder map \"aliases\" for {$folder} must be a list of strings.");

                return null;
            }

            $map[$folder] = [
                'account' => $config['account'],
                'aliases' => array_values(array_filter($aliases, 'is_string')),
                'date_prefixed' => (bool) ($config['date_prefixed'] ?? false),
            ];
        }

        if ($map === []) {
            $this->error('Folder map is empty.');

            return null;
        }

        return $map;
    }

    /**
     * @param  array<string, array{account: string, aliases: list<string>, date_prefixed: bool}>  $folderMap
     * @param  list<array{area: string, target: string, status: string, details: string}>  $events
     * @return list<array<string, mixed>>
     */
    private function scanDocuments(string $root, array $folderMap, array &$events): array
    {
        $documents = [];

        foreach ($folderMap as $folder => $config) {
            $folderPath = $root.DIRECTORY_SEPARATOR.$folder;
            if (! is_dir($folderPath)) {
                $events[] = $this->event('folder', $folder, 'missing', 'folder not found');

                continue;
            }

            foreach (File::files($folderPath) as $file) {
                $extension = Str::lower($file->getExtension());
                if (! in_array($extension, ['pdf', 'docx'], true)) {
                    continue;
                }

                $parsed = $this->parseFilename($file->getFilename(), $config['date_prefixed'], $config['account']);
                if ($parsed === null) {
                    $events[] = $this->event('document', $file->getFilename(), 'unparsed', 'filename did not match supported patterns');

                    continue;
                }

                $documents[] = [
                    ...$parsed,
                    'account_name' => $config['account'],
                    'folder' => $folder,
                    'absolute_path' => $file->getPathname(),
                    'relative_path' => $folder.'/'.$file->getFilename(),
                    'original_filename' => $file->getFilename(),
                    'extension' => $extension,
                    'file_size_bytes' => $file->getSize(),
                ];
            }
        }

        usort(
            $documents,
            static fn (array $left, array $right): int => [$left['account_name'], $left['document_date'], $left['original_filename']]
                <=> [$right['account_name'], $right['document_date'], $right['original_filename']],
        );

        return $documents;
    }

    /**
     * @return array<string, string>|null
     */
    private function parseFilename(string $filename, bool $datePrefixed, string $accountName): ?array
    {
        $nameWithoutExtension = preg_replace('/\.(pdf|docx)$/i', '', $filename);
        if (! is_string($nameWithoutExtension)) {
            return null;
        }

        if (preg_match('/^(.+?)\s+-\s+(.+?)\s+-\s+(\d{4}\.\d{2}\.\d{2})$/', $nameWithoutExtension, $matches) === 1) {
            $label = $this->cleanLabel($matches[1]);
            $date = $this->parseDateToken($matches[3]);

            return $date === null ? null : $this->parsedMetadata($label, $date);
        }

        if ($datePrefixed && preg_match('/^(\d{4}\.\d{2}(?:\.\d{2})?)\s+(.+)$/', $nameWithoutExtension, $matches) === 1) {
            $label = $this->cleanLabel($matches[2]);
            $label = trim((string) preg_replace('/^'.preg_quote($accountName, '/').'\s+/i', '', $label));
            $date = $this->parseDateToken(
                $matches[1],
                $this->documentKind($this->normaliseDocumentType($label)) === FinDocument::KIND_STATEMENT,
            );

            return $date === null ? null : $this->parsedMetadata($label, $date);
        }

        return null;
    }

    /**
     * @return array<string, string>
     */
    private function parsedMetadata(string $label, CarbonImmutable $date): array
    {
        $documentType = $this->normaliseDocumentType($label);

        return [
            'label' => $label,
            'document_type' => $documentType,
            'document_kind' => $this->documentKind($documentType),
            'document_date' => $date->toDateString(),
            'tax_year' => $documentType === FinDocument::TYPE_SCHEDULE_K1 || $documentType === FinDocument::TYPE_SCHEDULE_K1_AMENDED
                ? (string) $date->year
                : '',
        ];
    }

    private function parseDateToken(string $token, bool $monthOnlyAsEndOfMonth = false): ?CarbonImmutable
    {
        $format = substr_count($token, '.') === 1 ? 'Y.m' : 'Y.m.d';

        try {
            $date = CarbonImmutable::createFromFormat($format, $token);
        } catch (\Throwable) {
            return null;
        }

        if (! $date instanceof CarbonImmutable) {
            return null;
        }

        $errors = CarbonImmutable::getLastErrors();
        if ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0)) {
            return null;
        }
        if ($date->format($format) !== $token) {
            return null;
        }

        if ($format !== 'Y.m') {
            return $date;
        }

        return $monthOnlyAsEndOfMonth ? $date->endOfMonth() : $date->startOfMonth();
    }

    private function cleanLabel(string $label): string
    {
        return Str::of($label)->lower()->replaceMatches('/\s+/', ' ')->trim()->toString();
    }

    private function normaliseDocumentType(string $label): string
    {
        return match (true) {
            str_contains($label, 'schedule k-1 amended') => FinDocument::TYPE_SCHEDULE_K1_AMENDED,
            str_contains($label, 'schedule k-1') => FinDocument::TYPE_SCHEDULE_K1,
            str_contains($label, 'capital account statement') => FinDocument::TYPE_CAPITAL_ACCOUNT_STATEMENT,
            str_contains($label, 'capital call notice') => FinDocument::TYPE_CAPITAL_CALL_NOTICE,
            str_contains($label, 'distribution notice') => FinDocument::TYPE_DISTRIBUTION_NOTICE,
            str_contains($label, 'unaudited financial') => FinDocument::TYPE_UNAUDITED_FINANCIALS,
            str_contains($label, 'financial statement') => FinDocument::TYPE_FINANCIAL_STATEMENTS,
            str_contains($label, 'fund performance report') => FinDocument::TYPE_FUND_PERFORMANCE_REPORT,
            str_contains($label, 'investor signature package') => FinDocument::TYPE_INVESTOR_SIGNATURE_PACKAGE,
            str_contains($label, 'limited partnership agreement') => FinDocument::TYPE_LIMITED_PARTNERSHIP_AGREEMENT,
            str_contains($label, 'partnership agreement') => FinDocument::TYPE_PARTNERSHIP_AGREEMENT,
            str_contains($label, 'management agreement') => FinDocument::TYPE_MANAGEMENT_AGREEMENT,
            str_contains($label, 'subscription agreement') => FinDocument::TYPE_SUBSCRIPTION_AGREEMENT,
            str_contains($label, 'subscriber information') => FinDocument::TYPE_SUBSCRIBER_INFORMATION,
            str_contains($label, 'investor questionnaire') => FinDocument::TYPE_INVESTOR_QUESTIONNAIRE,
            str_contains($label, 'term sheet') => FinDocument::TYPE_TERM_SHEET,
            str_contains($label, 'transparency report') => FinDocument::TYPE_TRANSPARENCY_REPORT,
            str_contains($label, 'form adv') => FinDocument::TYPE_ADV,
            str_contains($label, 'ppm') => FinDocument::TYPE_PPM,
            str_contains($label, 'w-9') => FinDocument::TYPE_W9,
            str_contains($label, 'lp update') => FinDocument::TYPE_LP_UPDATE,
            str_contains($label, 'confirm') => FinDocument::TYPE_CONFIRM,
            str_contains($label, 'statement') => FinDocument::TYPE_STATEMENT,
            default => FinDocument::TYPE_OTHER,
        };
    }

    private function documentKind(string $documentType): string
    {
        return match ($documentType) {
            FinDocument::TYPE_SCHEDULE_K1,
            FinDocument::TYPE_SCHEDULE_K1_AMENDED => FinDocument::KIND_TAX_FORM,
            FinDocument::TYPE_STATEMENT,
            FinDocument::TYPE_CAPITAL_ACCOUNT_STATEMENT => FinDocument::KIND_STATEMENT,
            default => FinDocument::KIND_MANUAL,
        };
    }

    /**
     * @param  array<string, array{account: string, aliases: list<string>, date_prefixed: bool}>  $folderMap
     * @param  list<array{area: string, target: string, status: string, details: string}>  $events
     * @return array<string, FinAccounts>
     */
    private function ensureAccounts(int $userId, array $folderMap, bool $apply, array &$events): array
    {
        $resolved = [];

        foreach ($folderMap as $config) {
            $canonicalName = $config['account'];
            $account = $this->accountByName($userId, $canonicalName);

            if ($account instanceof FinAccounts) {
                $resolved[$canonicalName] = $account;
                $events[] = $this->event('account', $canonicalName, 'exists', 'account already uses canonical name');

                continue;
            }

            $alias = $this->accountByAliases($userId, $config['aliases']);
            if ($alias instanceof FinAccounts) {
                if ($apply) {
                    $oldName = (string) $alias->acct_name;
                    $alias->acct_name = $canonicalName;
                    $alias->save();
                    $events[] = $this->event('account', $canonicalName, 'renamed', "from {$oldName}");
                } else {
                    $events[] = $this->event('account', $canonicalName, 'would_rename', "from {$alias->acct_name}");
                }
                $resolved[$canonicalName] = $alias;

                continue;
            }

            if ($apply) {
                FinAccounts::withoutEvents(function () use ($userId, $canonicalName): void {
                    FinAccounts::query()->withoutGlobalScopes()->create([
                        'acct_owner' => (string) $userId,
                        'acct_name' => $canonicalName,
                        'acct_last_balance' => '0',
                        'acct_is_debt' => false,
                        'acct_is_retirement' => false,
                    ]);
                });
                $created = $this->accountByName($userId, $canonicalName);
                if ($created instanceof FinAccounts) {
                    $resolved[$canonicalName] = $created;
                }
                $events[] = $this->event('account', $canonicalName, 'created', 'new private fund account');
            } else {
                $events[] = $this->event('account', $canonicalName, 'would_create', 'new private fund account');
            }
        }

        $accounts = FinAccounts::query()
            ->withoutGlobalScopes()
            ->where('acct_owner', (string) $userId)
            ->whereIn('acct_name', array_map(static fn (array $config): string => $config['account'], $folderMap))
            ->get()
            ->keyBy('acct_name')
            ->all();

        return $accounts + $resolved;
    }

    private function accountByName(int $userId, string $name): ?FinAccounts
    {
        return FinAccounts::query()
            ->withoutGlobalScopes()
            ->where('acct_owner', (string) $userId)
            ->where('acct_name', $name)
            ->first();
    }

    /**
     * @param  list<string>  $aliases
     */
    private function accountByAliases(int $userId, array $aliases): ?FinAccounts
    {
        return FinAccounts::query()
            ->withoutGlobalScopes()
            ->where('acct_owner', (string) $userId)
            ->whereIn('acct_name', $aliases)
            ->orderBy('acct_id')
            ->first();
    }

    /**
     * @param  array<string, mixed>  $localDocument
     * @param  list<array{area: string, target: string, status: string, details: string}>  $events
     */
    private function reconcileDocument(int $userId, FinAccounts $account, array $localDocument, bool $apply, array &$events): void
    {
        $hash = hash_file('sha256', (string) $localDocument['absolute_path']);
        if (! is_string($hash)) {
            $events[] = $this->event('document', (string) $localDocument['relative_path'], 'hash_failed', 'could not hash file');

            return;
        }

        $document = FinDocument::query()
            ->where('user_id', $userId)
            ->where('document_kind', (string) $localDocument['document_kind'])
            ->where('file_hash', $hash)
            ->first();

        if (! $apply) {
            $events[] = $this->event(
                'document',
                (string) $localDocument['relative_path'],
                $document instanceof FinDocument ? 'exists' : 'would_import',
                (string) $localDocument['document_type'],
            );

            return;
        }

        DB::transaction(function () use ($userId, $account, $localDocument, $hash, $document, &$events): void {
            if (! $document instanceof FinDocument) {
                $document = $this->createDocument($userId, $localDocument, $hash);
                $events[] = $this->event('document', (string) $localDocument['relative_path'], 'imported', (string) $localDocument['document_type']);
            } else {
                $document->fill($this->documentDateFields($localDocument));
                if ($document->isDirty()) {
                    $document->save();
                }
                $events[] = $this->event('document', (string) $localDocument['relative_path'], 'exists', "document_id {$document->id}");
            }

            $statement = $this->reconcileStatement($account, $document, $localDocument);
            $this->reconcileDocumentAccountLink($account, $document, $statement, $localDocument);
            $this->reconcileTaxDocument($userId, $account, $document, $localDocument);
        });
    }

    /**
     * @param  array<string, mixed>  $localDocument
     */
    private function createDocument(int $userId, array $localDocument, string $hash): FinDocument
    {
        $storedFilename = FinDocument::generateStoredFilename((string) $localDocument['original_filename']);
        $s3Path = FinDocument::generateS3Path($userId, $storedFilename, (string) $localDocument['document_kind']);
        $content = file_get_contents((string) $localDocument['absolute_path']);
        if (! is_string($content)) {
            throw new \RuntimeException("Unable to read {$localDocument['absolute_path']}");
        }

        if (! $this->fileStorageService->uploadContent($content, $s3Path)) {
            throw new \RuntimeException("Unable to upload {$localDocument['relative_path']} to configured storage");
        }

        return FinDocument::query()->create([
            'user_id' => $userId,
            'document_kind' => $localDocument['document_kind'],
            ...$this->documentDateFields($localDocument),
            'original_filename' => $localDocument['original_filename'],
            'stored_filename' => $storedFilename,
            's3_path' => $s3Path,
            'mime_type' => $this->mimeType((string) $localDocument['absolute_path'], (string) $localDocument['extension']),
            'file_size_bytes' => $localDocument['file_size_bytes'],
            'file_hash' => $hash,
            'uploaded_by_user_id' => $userId,
            'parsed_data' => [
                'source' => 'finance:private-funds:reconcile',
                'source_path' => $localDocument['relative_path'],
                'account_name' => $localDocument['account_name'],
                'label' => $localDocument['label'],
            ],
            'parsed_data_needs_review' => false,
            'is_reviewed' => false,
            'notes' => 'Imported from private fund document reconciliation.',
        ]);
    }

    /**
     * @param  array<string, mixed>  $localDocument
     * @return array<string, mixed>
     */
    private function documentDateFields(array $localDocument): array
    {
        return [
            'document_type' => $localDocument['document_type'],
            'document_date' => $localDocument['document_date'],
            'tax_year' => $localDocument['tax_year'] !== '' ? (int) $localDocument['tax_year'] : null,
            'period_end' => in_array($localDocument['document_kind'], [FinDocument::KIND_STATEMENT, FinDocument::KIND_TAX_FORM], true)
                ? $localDocument['document_date']
                : null,
        ];
    }

    /**
     * @param  array<string, mixed>  $localDocument
     */
    private function reconcileStatement(FinAccounts $account, FinDocument $document, array $localDocument): ?FinStatement
    {
        if ((string) $localDocument['document_kind'] !== FinDocument::KIND_STATEMENT) {
            return null;
        }

        $statement = FinStatement::query()
            ->where('document_id', $document->id)
            ->where('acct_id', $account->acct_id)
            ->first();

        if (! $statement instanceof FinStatement) {
            $statement = new FinStatement;
            $statement->document_id = $document->id;
            $statement->acct_id = $account->acct_id;
        }

        $statement->statement_closing_date = $localDocument['document_date'];
        $statement->balance = null;
        $statement->save();

        return $statement;
    }

    /**
     * @param  array<string, mixed>  $localDocument
     */
    private function reconcileDocumentAccountLink(FinAccounts $account, FinDocument $document, ?FinStatement $statement, array $localDocument): void
    {
        $link = FinDocumentAccount::query()
            ->where('document_id', $document->id)
            ->where('account_id', $account->acct_id)
            ->first() ?? new FinDocumentAccount([
                'document_id' => $document->id,
                'account_id' => $account->acct_id,
            ]);

        $link->fill([
            'statement_id' => $statement?->statement_id,
            'form_type' => $document->document_kind === FinDocument::KIND_TAX_FORM ? 'k1' : null,
            'tax_year' => $localDocument['tax_year'] !== '' ? (int) $localDocument['tax_year'] : null,
            'account_section_label' => $account->acct_name,
            'payload_kind' => $document->document_kind === FinDocument::KIND_STATEMENT ? FinDocumentAccount::PAYLOAD_POSITIONS : null,
            'is_reviewed' => false,
            'notes' => "Imported from {$localDocument['relative_path']}",
        ]);
        $link->save();
    }

    /**
     * @param  array<string, mixed>  $localDocument
     */
    private function reconcileTaxDocument(int $userId, FinAccounts $account, FinDocument $document, array $localDocument): void
    {
        if ((string) $localDocument['document_kind'] !== FinDocument::KIND_TAX_FORM) {
            return;
        }

        FileForTaxDocument::query()->updateOrCreate(
            ['document_id' => $document->id],
            [
                'user_id' => $userId,
                'tax_year' => (int) $localDocument['tax_year'],
                'form_type' => 'k1',
                'account_id' => $account->acct_id,
                'original_filename' => $document->original_filename,
                'stored_filename' => $document->stored_filename,
                's3_path' => $document->s3_path,
                'mime_type' => $document->mime_type,
                'file_size_bytes' => $document->file_size_bytes,
                'file_hash' => $document->file_hash,
                'uploaded_by_user_id' => $userId,
                'notes' => "Imported from {$localDocument['relative_path']}",
                'is_reviewed' => false,
                'parsed_data_needs_review' => false,
            ],
        );
    }

    private function mimeType(string $path, string $extension): string
    {
        return match ($extension) {
            'pdf' => 'application/pdf',
            'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            default => File::mimeType($path) ?: 'application/octet-stream',
        };
    }

    /**
     * @return array{area: string, target: string, status: string, details: string}
     */
    private function event(string $area, string $target, string $status, string $details): array
    {
        return [
            'area' => $area,
            'target' => $target,
            'status' => $status,
            'details' => $details,
        ];
    }
}
