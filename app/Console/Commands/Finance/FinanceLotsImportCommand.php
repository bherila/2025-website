<?php

namespace App\Console\Commands\Finance;

use App\Enums\Finance\LotMatcherAutoTrigger;
use App\Models\FinanceTool\FinAccountLot;
use App\Services\Finance\CapitalGains\BrokerWashSaleTreatmentNormalizer;
use App\Services\Finance\CapitalGains\LotMatcherAutoDispatchService;
use App\Services\Finance\Exceptions\WealthfrontPdfParseException;
use App\Services\Finance\Wealthfront1099BLotParser;
use HelgeSverre\Toon\Toon;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Import closed-lot (1099-B) records into fin_account_lots.
 *
 * Accepts four input formats via --file or stdin:
 *
 *  JSON  – The canonical broker_1099 lot JSON format.  Run --schema to print
 *           the expected shape.  Pass --input-format=json (or let the command
 *           auto-detect a .json extension / leading "{").
 *
 *  CSV   – A flat CSV with headers matching the JSON transaction fields.
 *           Required columns: symbol, quantity, purchase_date, sale_date,
 *           proceeds, cost_basis, realized_gain_loss.
 *           Optional: description, cusip, wash_sale_disallowed, is_short_term.
 *           Run --schema to print an example CSV header line.
 *
 *  TOON  – Token-Oriented Object Notation (helgesverre/toon).  Same schema as
 *           JSON but ~30-60% fewer tokens — ideal for AI-generated input.
 *           Auto-detected when the file does not start with "{" or contain CSV
 *           headers.  Use --input-format=toon to force.
 *
 *  TEXT  – Raw broker 1099-B text output, or a Wealthfront PDF read directly
 *           by the command.
 *
 * Usage:
 *   # JSON
 *   php artisan finance:lots-import --account=33 --file=1099b.json
 *   cat 1099b.json | php artisan finance:lots-import --account=33
 *
 *   # CSV
 *   php artisan finance:lots-import --account=33 --file=lots.csv --input-format=csv
 *
 *   # TOON
 *   php artisan finance:lots-import --account=33 --file=lots.toon
 *
 *   # Fidelity pdftotext or Wealthfront PDF
 *   pdftotext -layout "2025 1099.pdf" - | php artisan finance:lots-import --account=33
 *   php artisan finance:lots-import --account=33 --file="2025 1099 Wealthfront.pdf"
 *
 *   # Print expected schema
 *   php artisan finance:lots-import --schema
 */
class FinanceLotsImportCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:lots-import
        {--account= : Target fin_accounts.acct_id (required unless --schema)}
        {--tax-document= : Optional fin_tax_documents.id to stamp imported lots}
        {--file= : Path to input file; omit to read from stdin}
        {--input-format= : Force input format: json | csv | toon | text (auto-detected by default)}
        {--dry-run : Show what would be imported without writing to the database}
        {--clear : Delete all existing lots for this account before importing}
        {--schema : Print expected input schemas and exit}
        {--format=table : Output format: table or json}';

    protected $description = 'Import 1099-B lots (JSON / CSV / TOON / broker PDF/text) into fin_account_lots';

    private const CSV_REQUIRED_COLS = ['symbol', 'quantity', 'purchase_date', 'sale_date', 'proceeds', 'cost_basis', 'realized_gain_loss'];

    private const CSV_OPTIONAL_COLS = ['description', 'cusip', 'wash_sale_disallowed', 'wash_sale_treatment', 'is_short_term', 'form_8949_box', 'is_covered'];

    private string $currentSymbol = '';

    private string $currentDescription = '';

    private bool $isLongTerm = false;

    public function __construct(
        private readonly LotMatcherAutoDispatchService $lotMatcherAutoDispatchService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        if ($this->option('schema')) {
            $this->printSchema();

            return 0;
        }

        if (! $this->validateFormat()) {
            return 1;
        }

        $acctId = (int) $this->option('account');
        if ($acctId <= 0) {
            $this->error('--account is required and must be a positive integer.');

            return 1;
        }

        if ($this->resolveUser() === null) {
            return 1;
        }

        $userId = $this->userId();
        $accountExists = DB::table('fin_accounts')
            ->where('acct_id', $acctId)
            ->where('acct_owner', $userId)
            ->exists();

        if (! $accountExists) {
            $this->error("Account {$acctId} not found or does not belong to user {$userId}.");

            return 1;
        }

        $raw = $this->readInput();
        if ($raw === null) {
            return 1;
        }

        $inputFormat = $this->detectFormat($raw);
        $this->info("Detected input format: {$inputFormat}");

        $lots = match ($inputFormat) {
            'json' => $this->parseJson($raw),
            'csv' => $this->parseCsv($raw),
            'toon' => $this->parseToon($raw),
            default => $this->parseText($raw),
        };

        if ($lots === null) {
            return 1;
        }

        $lots = $this->normaliseImportedLotWashSales($lots);

        $this->info(sprintf('Parsed %d lot record(s).', count($lots)));

        if (empty($lots)) {
            $this->warn('No lot records found in the input. Use --schema to see the expected format.');

            return 1;
        }

        $isDryRun = (bool) $this->option('dry-run');
        $doClear = (bool) $this->option('clear');

        if ($isDryRun) {
            $this->renderLotsTable(array_slice($lots, 0, 20));
            if (count($lots) > 20) {
                $this->line(sprintf('... and %d more (showing first 20)', count($lots) - 20));
            }
            $this->line('Dry-run mode: no changes written.');

            return 0;
        }

        $deletedYears = $doClear ? $this->closedLotYearsForAccount($acctId) : [];
        $deleted = 0;

        if ($doClear) {
            $deleted = DB::table('fin_account_lots')->where('acct_id', $acctId)->delete();
            $this->info("Cleared {$deleted} existing lot record(s) for account {$acctId}.");
        }

        $documentId = $this->documentIdFromTaxDocumentOption();
        if ($documentId === false) {
            return 1;
        }

        [$inserted, $skipped] = $this->persistLots($acctId, $lots, $documentId, skipDuplicateCheck: $doClear);
        $this->dispatchMatcherAfterImport($userId, $acctId, $documentId, $inserted, $deleted, $lots, $deletedYears);

        $this->info("Imported: {$inserted} inserted, {$skipped} skipped (duplicate).");

        $sample = array_slice($lots, 0, 10);
        $this->renderLotsTable($sample);

        if (count($lots) > 10) {
            $this->line(sprintf('... and %d more (showing first 10)', count($lots) - 10));
        }

        return 0;
    }

    private function readInput(): ?string
    {
        $filePath = $this->option('file');

        if ($filePath) {
            if (! file_exists($filePath)) {
                $this->error("File not found: {$filePath}");

                return null;
            }

            if (strtolower(pathinfo($filePath, PATHINFO_EXTENSION)) === 'pdf') {
                try {
                    $raw = app(Wealthfront1099BLotParser::class)->textFromPdf($filePath);
                } catch (WealthfrontPdfParseException $exception) {
                    $this->error($exception->getMessage());

                    return null;
                }
            } else {
                $raw = file_get_contents($filePath);
            }
        } else {
            $raw = '';
            while (! feof(STDIN)) {
                $chunk = fread(STDIN, 65536);
                if ($chunk === false) {
                    break;
                }
                $raw .= $chunk;
            }
        }

        if (! $raw || trim($raw) === '') {
            $this->error('No input received. Pipe data to stdin or use --file.');

            return null;
        }

        return $raw;
    }

    /**
     * Detect the input format from content or --input-format flag.
     */
    private function detectFormat(string $raw): string
    {
        $forced = $this->option('input-format');
        if ($forced && in_array($forced, ['json', 'csv', 'toon', 'text'], true)) {
            return $forced;
        }

        // Auto-detect by file extension when --file is specified
        $filePath = $this->option('file');
        if ($filePath) {
            $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
            if ($ext === 'json') {
                return 'json';
            }
            if ($ext === 'csv') {
                return 'csv';
            }
            if ($ext === 'toon') {
                return 'toon';
            }
        }

        // Auto-detect by content
        $firstChars = ltrim(substr($raw, 0, 50));
        if (str_starts_with($firstChars, '{') || str_starts_with($firstChars, '[')) {
            return 'json';
        }

        if (stripos($raw, 'FORM 1099-B') !== false || stripos($raw, 'Short-term transactions for which basis is reported') !== false) {
            return 'text';
        }

        // TOON: attempt to decode — if it succeeds and yields an array, it's TOON
        try {
            $decoded = Toon::decode($raw);
            if (is_array($decoded) && count($decoded) > 0) {
                return 'toon';
            }
        } catch (\Throwable) {
            // Not TOON — fall through
        }

        // CSV: first non-blank line looks like a header
        $lines = explode("\n", $raw);
        $firstLine = trim((string) $lines[0]);
        if (str_contains($firstLine, ',') && ! str_contains($firstLine, ':')) {
            return 'csv';
        }

        return 'text';
    }

    /**
     * Parse broker_1099 JSON (the format used by the AI-extracted 1099b.json).
     *
     * @return array<int, array<string, mixed>>|null
     */
    private function parseJson(string $raw): ?array
    {
        $data = json_decode($raw, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            $this->error('Invalid JSON: '.json_last_error_msg());

            return null;
        }

        // Support both {"transactions": [...]} wrapper and bare [...] array
        if (isset($data['transactions']) && is_array($data['transactions'])) {
            $txns = $data['transactions'];
        } elseif (is_array($data) && isset($data[0])) {
            $txns = $data;
        } else {
            $this->error('JSON must contain a "transactions" array or be a top-level array of lot objects.');

            return null;
        }

        $defaultWashSaleTreatment = $data['wash_sale_treatment'] ?? $data['wash_sale_basis_treatment'] ?? null;
        $lots = [];
        foreach ($txns as $i => $row) {
            if (! is_array($row)) {
                $this->warn("Row {$i}: expected an object — skipped.");

                continue;
            }

            $missing = array_diff(self::CSV_REQUIRED_COLS, array_keys($row));
            if (! empty($missing)) {
                $this->warn("Row {$i}: missing fields ".implode(', ', $missing).' — skipped.');

                continue;
            }

            $symbol = $this->normaliseSymbol($row);
            $purchaseDate = $this->normaliseDateField((string) $row['purchase_date']);
            $saleDate = $this->normaliseDateField((string) $row['sale_date']);

            if (! $saleDate) {
                $this->warn("Row {$i} ({$symbol}): invalid sale_date '{$row['sale_date']}' — skipped.");

                continue;
            }

            $lots[] = [
                'symbol' => $symbol,
                'description' => trim((string) ($row['description'] ?? '')),
                'cusip' => isset($row['cusip']) ? strtoupper(trim((string) $row['cusip'])) : null,
                'quantity' => (float) $row['quantity'],
                'purchase_date' => $purchaseDate ?? $saleDate,
                'sale_date' => $saleDate,
                'cost_basis' => round((float) $row['cost_basis'], 4),
                'proceeds' => round((float) $row['proceeds'], 4),
                'realized_gain_loss' => round((float) $row['realized_gain_loss'], 4),
                'wash_sale_disallowed' => round((float) ($row['wash_sale_disallowed'] ?? 0), 4),
                'wash_sale_treatment' => $row['wash_sale_treatment'] ?? $defaultWashSaleTreatment,
                'is_short_term' => (bool) ($row['is_short_term'] ?? true),
                'form_8949_box' => isset($row['form_8949_box']) ? strtoupper(trim((string) $row['form_8949_box'])) : null,
                'is_covered' => array_key_exists('is_covered', $row) ? (bool) $row['is_covered'] : null,
                'date_acquired_various' => $purchaseDate === null,
                'reconciliation_notes' => $purchaseDate === null ? 'Date acquired reported as Various; purchase_date stores sale_date as a database placeholder.' : null,
            ];
        }

        return $lots;
    }

    /**
     * Parse TOON-encoded lot data (helgesverre/toon).
     *
     * TOON decodes to the same structure as JSON, so this method delegates to
     * parseJson after decoding.
     *
     * @return array<int, array<string, mixed>>|null
     */
    private function parseToon(string $raw): ?array
    {
        try {
            $decoded = Toon::decode($raw);
        } catch (\Throwable $e) {
            $this->error('TOON decode failed: '.$e->getMessage());

            return null;
        }

        // Re-encode as JSON and pass through the JSON parser for uniform field handling.
        $asJson = json_encode($decoded);
        if ($asJson === false) {
            $this->error('Failed to re-encode TOON decoded value as JSON.');

            return null;
        }

        return $this->parseJson($asJson);
    }

    /**
     * Parse a flat CSV file.  The first row must be a header row.
     *
     * @return array<int, array<string, mixed>>|null
     */
    private function parseCsv(string $raw): ?array
    {
        $lines = preg_split('/\r?\n/', trim($raw));
        if (empty($lines)) {
            $this->error('CSV input is empty.');

            return null;
        }

        $rawHeader = array_shift($lines);
        $headers = array_map('trim', str_getcsv((string) $rawHeader));
        $headers = array_map('strtolower', $headers);

        $missing = array_diff(self::CSV_REQUIRED_COLS, $headers);
        if (! empty($missing)) {
            $this->error('CSV is missing required columns: '.implode(', ', $missing));
            $this->line('Run --schema to see the expected CSV format.');

            return null;
        }

        $colIndex = array_flip($headers);
        $lots = [];

        foreach ($lines as $lineNo => $line) {
            if (trim($line) === '') {
                continue;
            }

            $cells = str_getcsv($line);

            $get = fn (string $col) => trim($cells[$colIndex[$col] ?? -1] ?? '');

            $purchaseDate = $this->normaliseDateField($get('purchase_date'));
            $saleDate = $this->normaliseDateField($get('sale_date'));

            if (! $saleDate) {
                $this->warn('CSV line '.($lineNo + 2).": invalid sale_date '".$get('sale_date')."' — skipped.");

                continue;
            }

            $symbol = strtoupper($get('symbol'));
            if (! $symbol) {
                continue;
            }

            $isShortTerm = $get('is_short_term');
            $isShortTermBool = ! in_array(strtolower($isShortTerm), ['0', 'false', 'no', 'n', 'lt'], true);

            $lots[] = [
                'symbol' => $symbol,
                'description' => $get('description'),
                'cusip' => strtoupper($get('cusip')) ?: null,
                'quantity' => (float) str_replace(',', '', $get('quantity')),
                'purchase_date' => $purchaseDate ?? $saleDate,
                'sale_date' => $saleDate,
                'cost_basis' => round((float) str_replace(',', '', $get('cost_basis')), 4),
                'proceeds' => round((float) str_replace(',', '', $get('proceeds')), 4),
                'realized_gain_loss' => round((float) str_replace(',', '', $get('realized_gain_loss')), 4),
                'wash_sale_disallowed' => round((float) str_replace(',', '', $get('wash_sale_disallowed')), 4),
                'wash_sale_treatment' => $get('wash_sale_treatment') ?: null,
                'is_short_term' => $isShortTermBool,
                'form_8949_box' => strtoupper($get('form_8949_box')) ?: null,
                'is_covered' => $get('is_covered') !== '' ? ! in_array(strtolower($get('is_covered')), ['0', 'false', 'no', 'n'], true) : null,
                'date_acquired_various' => $purchaseDate === null,
                'reconciliation_notes' => $purchaseDate === null ? 'Date acquired reported as Various; purchase_date stores sale_date as a database placeholder.' : null,
            ];
        }

        return $lots;
    }

    /**
     * Parse broker 1099-B text output.
     *
     * Recognises the canonical Wealthfront layout first, then falls back to the
     * original Fidelity row parser.
     *
     * @return array<int, array<string, mixed>>
     */
    private function parseText(string $text): array
    {
        if (stripos($text, 'Wealthfront Brokerage LLC') !== false) {
            return app(Wealthfront1099BLotParser::class)->parse($text);
        }

        $lots = [];
        $this->isLongTerm = false;
        $this->currentSymbol = '';
        $this->currentDescription = '';

        foreach (explode("\n", $text) as $line) {
            if (stripos($line, 'Short-term transactions for which basis is reported') !== false) {
                $this->isLongTerm = false;

                continue;
            }
            if (stripos($line, 'Long-term transactions for which basis is reported') !== false) {
                $this->isLongTerm = true;

                continue;
            }

            // Security header: "   DESCRIPTION, SYMBOL, CUSIP"
            if (preg_match('/^\s{1,6}([A-Z][^,]+),\s*([A-Z0-9]{1,10}),\s*([A-Z0-9]{7,9})\s*$/i', $line, $m)) {
                $this->currentDescription = trim($m[1]);
                $this->currentSymbol = strtoupper(trim($m[2]));

                continue;
            }

            // Sale / Merger / Cash-in-Lieu rows (all are taxable dispositions on 1099-B)
            if (! preg_match('/^\s+(Sale|Merger|Cash In Lieu)\s/i', $line)) {
                continue;
            }

            $parts = preg_split('/\s{2,}/', trim($line));
            if (! $parts || count($parts) < 6) {
                continue;
            }

            $qty = $this->amountFromText((string) $parts[1]);
            $dateAcquired = $this->parseFidelityDate((string) $parts[2]);
            $dateSold = $this->parseFidelityDate((string) $parts[3]);
            $proceeds = $this->amountFromText((string) $parts[4]);
            $costBasis = $this->amountFromText((string) $parts[5]);

            /** @var list<string> $remaining */
            $remaining = array_slice($parts, 6);
            $washSale = 0.0;
            $gainLoss = 0.0;

            $n = count($remaining);
            if ($n === 1) {
                $gainLoss = $this->amountFromText($remaining[0]);
            } elseif ($n === 2) {
                $washSale = $this->amountFromText($remaining[0]);
                $gainLoss = $this->amountFromText($remaining[1]);
            } elseif ($n >= 3) {
                $washSale = $this->amountFromText($remaining[1]);
                $gainLoss = $this->amountFromText($remaining[2]);
            }

            if (! $dateSold || $qty == 0.0) {
                continue;
            }

            if ($this->currentSymbol === '') {
                $this->warn('Skipping sale row with no security header parsed yet.');

                continue;
            }

            $lots[] = [
                'symbol' => $this->currentSymbol,
                'description' => $this->currentDescription,
                'cusip' => null,
                'quantity' => $qty,
                'purchase_date' => $dateAcquired ?? $dateSold,
                'sale_date' => $dateSold,
                'cost_basis' => round($costBasis, 4),
                'proceeds' => round($proceeds, 4),
                'realized_gain_loss' => round($gainLoss, 4),
                'wash_sale_disallowed' => round($washSale, 4),
                'wash_sale_treatment' => BrokerWashSaleTreatmentNormalizer::TREATMENT_ALREADY_REFLECTED_IN_COST_BASIS,
                'is_short_term' => ! $this->isLongTerm,
                'date_acquired_various' => $dateAcquired === null,
                'reconciliation_notes' => $dateAcquired === null ? 'Date acquired reported as Various; purchase_date stores sale_date as a database placeholder.' : null,
            ];
        }

        return $lots;
    }

    /**
     * @param  array<int, array<string, mixed>>  $lots
     * @return array<int, array<string, mixed>>
     */
    private function normaliseImportedLotWashSales(array $lots): array
    {
        return array_map(fn (array $lot): array => $this->normaliseImportedLotWashSale($lot), $lots);
    }

    /**
     * @param  array<string, mixed>  $lot
     * @return array<string, mixed>
     */
    private function normaliseImportedLotWashSale(array $lot): array
    {
        $washSaleNormalizer = app(BrokerWashSaleTreatmentNormalizer::class);
        $amounts = $washSaleNormalizer->normalizeAmounts(
            proceeds: (float) ($lot['proceeds'] ?? 0),
            costBasis: (float) ($lot['cost_basis'] ?? 0),
            reportedGainLoss: is_numeric($lot['realized_gain_loss'] ?? null) ? (float) $lot['realized_gain_loss'] : null,
            washSaleDisallowed: is_numeric($lot['wash_sale_disallowed'] ?? null) ? (float) $lot['wash_sale_disallowed'] : 0.0,
            treatment: $lot['wash_sale_treatment'] ?? null,
        );

        $lot['realized_gain_loss'] = round($amounts['realized_gain_loss'], 4);
        $lot['wash_sale_disallowed'] = round($amounts['wash_sale_disallowed'], 4);
        $lot['wash_sale_treatment'] = $amounts['wash_sale_treatment'];
        $lot['reconciliation_notes'] = BrokerWashSaleTreatmentNormalizer::appendReconciliationNotes(
            is_string($lot['reconciliation_notes'] ?? null) ? $lot['reconciliation_notes'] : null,
            $amounts['note'],
        );

        return $lot;
    }

    /**
     * Insert parsed lots, skipping exact duplicates already in the table.
     *
     * A duplicate is defined as: same acct_id + symbol + quantity + purchase_date
     * + sale_date + proceeds + cost_basis (within 0.01 rounding).
     *
     * @param  array<int, array<string, mixed>>  $lots
     * @return array{0: int, 1: int} [inserted, skipped]
     */
    private function persistLots(int $acctId, array $lots, ?int $documentId = null, bool $skipDuplicateCheck = false): array
    {
        $now = now();
        $lotsToInsert = $skipDuplicateCheck ? $this->filterDuplicateLotsInMemory($lots) : $this->filterDuplicateLots($acctId, $lots);
        $skipped = count($lots) - count($lotsToInsert);

        if (empty($lotsToInsert)) {
            return [0, $skipped];
        }

        foreach (array_chunk($lotsToInsert, 500) as $chunk) {
            $rows = array_map(
                fn (array $lot): array => $this->makeLotInsertRow($acctId, $lot, $documentId, $now),
                $chunk,
            );

            FinAccountLot::query()->insert($rows);
        }

        $this->bulkMatchTransactions($acctId, $documentId, $lotsToInsert);

        return [count($lotsToInsert), $skipped];
    }

    /**
     * @param  array<int, array<string, mixed>>  $lots
     * @param  list<int>  $deletedYears
     */
    private function dispatchMatcherAfterImport(
        int $userId,
        int $acctId,
        ?int $documentId,
        int $inserted,
        int $deleted,
        array $lots,
        array $deletedYears,
    ): void {
        if ($inserted === 0 && $deleted === 0) {
            return;
        }

        if ($documentId !== null) {
            $this->lotMatcherAutoDispatchService->dispatchForDocument(
                documentId: $documentId,
                trigger: LotMatcherAutoTrigger::LotsImportCli,
                accountId: $acctId,
            );

            return;
        }

        $years = $deletedYears;
        if ($inserted > 0) {
            $years = array_merge($years, $this->closedLotYearsFromLots($lots));
        }

        $this->lotMatcherAutoDispatchService->dispatchForAccountYears(
            userId: $userId,
            accountId: $acctId,
            taxYears: $years,
            trigger: LotMatcherAutoTrigger::LotsImportCli,
        );
    }

    /**
     * @return list<int>
     */
    private function closedLotYearsForAccount(int $acctId): array
    {
        return LotMatcherAutoDispatchService::yearsFromDates(FinAccountLot::query()
            ->where('acct_id', $acctId)
            ->whereNotNull('sale_date')
            ->pluck('sale_date'));
    }

    /**
     * @param  array<int, array<string, mixed>>  $lots
     * @return list<int>
     */
    private function closedLotYearsFromLots(array $lots): array
    {
        return LotMatcherAutoDispatchService::yearsFromDates(array_map(
            static fn (array $lot): mixed => $lot['sale_date'] ?? null,
            $lots,
        ));
    }

    /**
     * @param  array<int, array<string, mixed>>  $lots
     * @return array<int, array<string, mixed>>
     */
    private function filterDuplicateLotsInMemory(array $lots): array
    {
        $filtered = [];
        $seenKeys = [];

        foreach ($lots as $lot) {
            $key = $this->lotDuplicateKey($lot);
            if (isset($seenKeys[$key])) {
                continue;
            }

            $seenKeys[$key] = true;
            $filtered[] = $lot;
        }

        return $filtered;
    }

    /**
     * @param  array<int, array<string, mixed>>  $lots
     * @return array<int, array<string, mixed>>
     */
    private function filterDuplicateLots(int $acctId, array $lots): array
    {
        $symbols = array_values(array_unique(array_map(fn (array $lot): string => (string) $lot['symbol'], $lots)));
        $purchaseDates = array_values(array_unique(array_map(fn (array $lot): string => (string) $lot['purchase_date'], $lots)));
        $saleDates = array_values(array_unique(array_map(fn (array $lot): string => (string) $lot['sale_date'], $lots)));
        $existingKeys = [];

        if (! empty($symbols) && ! empty($purchaseDates) && ! empty($saleDates)) {
            $existingRows = DB::table('fin_account_lots')
                ->where('acct_id', $acctId)
                ->whereIn('symbol', $symbols)
                ->whereIn('purchase_date', $purchaseDates)
                ->whereIn('sale_date', $saleDates)
                ->get(['symbol', 'quantity', 'purchase_date', 'sale_date', 'proceeds', 'cost_basis']);

            foreach ($existingRows as $row) {
                $existingKeys[$this->lotDuplicateKey((array) $row)] = true;
            }
        }

        $filtered = [];
        foreach ($lots as $lot) {
            $key = $this->lotDuplicateKey($lot);
            if (isset($existingKeys[$key])) {
                continue;
            }

            $existingKeys[$key] = true;
            $filtered[] = $lot;
        }

        return $filtered;
    }

    /**
     * @param  array<string, mixed>  $lot
     */
    private function lotDuplicateKey(array $lot): string
    {
        return implode('|', [
            (string) $lot['symbol'],
            number_format((float) $lot['quantity'], 4, '.', ''),
            (string) $lot['purchase_date'],
            (string) $lot['sale_date'],
            number_format((float) $lot['proceeds'], 2, '.', ''),
            number_format((float) $lot['cost_basis'], 2, '.', ''),
        ]);
    }

    /**
     * @param  array<string, mixed>  $lot
     * @return array<string, mixed>
     */
    private function makeLotInsertRow(
        int $acctId,
        array $lot,
        ?int $documentId,
        Carbon $now,
    ): array {
        $costPerUnit = $lot['quantity'] > 0
            ? round($lot['cost_basis'] / $lot['quantity'], 8)
            : null;

        return [
            'acct_id' => $acctId,
            'symbol' => $lot['symbol'],
            'description' => $lot['description'],
            'cusip' => $lot['cusip'] ?? null,
            'quantity' => $lot['quantity'],
            'purchase_date' => $lot['purchase_date'],
            'cost_basis' => $lot['cost_basis'],
            'cost_per_unit' => $costPerUnit,
            'sale_date' => $lot['sale_date'],
            'proceeds' => $lot['proceeds'],
            'realized_gain_loss' => $lot['realized_gain_loss'],
            'is_short_term' => $lot['is_short_term'] ? 1 : 0,
            'lot_source' => 'import_1099b',
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
            'open_t_id' => null,
            'close_t_id' => null,
            'document_id' => $documentId,
            'lot_origin' => FinAccountLot::ORIGIN_1099B_DISPOSITION,
            'form_8949_box' => $lot['form_8949_box'] ?? null,
            'is_covered' => $lot['is_covered'] ?? null,
            'wash_sale_disallowed' => $lot['wash_sale_disallowed'] ?? 0,
            'reconciliation_notes' => $lot['reconciliation_notes'] ?? ((bool) ($lot['date_acquired_various'] ?? false) ? 'Date acquired reported as Various; purchase_date stores sale_date as a database placeholder.' : null),
            'created_at' => $now,
            'updated_at' => $now,
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $lots
     */
    private function bulkMatchTransactions(int $acctId, ?int $documentId, array $lots): void
    {
        $matchingLots = [];
        foreach ($lots as $lot) {
            if (! (bool) ($lot['skip_transaction_matching'] ?? false)) {
                $matchingLots[$this->lotDuplicateKey($lot)] = $lot;
            }
        }

        if (empty($matchingLots)) {
            return;
        }

        $matchingLotRows = array_values($matchingLots);
        $insertedLots = $this->loadInsertedLots($acctId, $documentId, $matchingLotRows);
        if (empty($insertedLots)) {
            return;
        }

        $openingCandidates = $this->loadTransactionCandidates(
            $acctId,
            $matchingLotRows,
            'purchase_date',
            ['Buy', 'Sell Short', 'Transfer', 'Reinvest'],
        );
        $closingCandidates = $this->loadTransactionCandidates(
            $acctId,
            $matchingLotRows,
            'sale_date',
            ['Sell', 'Cover', 'Sell Short', 'Transfer', 'Merger', 'Cash In Lieu'],
        );

        $updates = [];
        foreach ($insertedLots as $insertedLot) {
            $key = $this->lotDuplicateKey($insertedLot);
            $lot = $matchingLots[$key] ?? null;
            if ($lot === null) {
                continue;
            }

            $openId = $this->bestTransactionId($openingCandidates, (string) $lot['symbol'], (string) $lot['purchase_date'], (float) $lot['quantity']);
            $closeId = $this->bestTransactionId($closingCandidates, (string) $lot['symbol'], (string) $lot['sale_date'], (float) $lot['quantity']);
            if ($openId === null && $closeId === null) {
                continue;
            }

            $updates[] = [
                'lot_id' => (int) $insertedLot['lot_id'],
                'open_t_id' => $openId,
                'close_t_id' => $closeId,
            ];
        }

        $this->bulkUpdateLotTransactionIds($updates);
    }

    /**
     * @param  array<int, array<string, mixed>>  $lots
     * @return array<string, array<string, mixed>>
     */
    private function loadInsertedLots(int $acctId, ?int $documentId, array $lots): array
    {
        $lotKeys = [];
        $symbols = [];
        $purchaseDates = [];
        $saleDates = [];

        foreach ($lots as $index => $lot) {
            $key = $this->lotDuplicateKey($lot);
            $lotKeys[$key] = $lot + ['_index' => $index];
            $symbols[] = (string) $lot['symbol'];
            $purchaseDates[] = (string) $lot['purchase_date'];
            $saleDates[] = (string) $lot['sale_date'];
        }

        $query = DB::table('fin_account_lots')
            ->where('acct_id', $acctId)
            ->where('lot_source', 'import_1099b')
            ->whereIn('symbol', array_values(array_unique($symbols)))
            ->whereIn('purchase_date', array_values(array_unique($purchaseDates)))
            ->whereIn('sale_date', array_values(array_unique($saleDates)));

        if ($documentId === null) {
            $query->whereNull('document_id');
        } else {
            $query->where('document_id', $documentId);
        }

        $insertedLots = [];
        $rows = $query->get(['lot_id', 'symbol', 'quantity', 'purchase_date', 'sale_date', 'proceeds', 'cost_basis']);
        foreach ($rows as $row) {
            $rowArray = (array) $row;
            $key = $this->lotDuplicateKey($rowArray);
            if (isset($lotKeys[$key])) {
                $insertedLots[$key] = $rowArray;
            }
        }

        return $insertedLots;
    }

    /**
     * @param  array<int, array<string, mixed>>  $lots
     * @param  array<int, string>  $types
     * @return array<string, array<int, object>>
     */
    private function loadTransactionCandidates(int $acctId, array $lots, string $dateField, array $types): array
    {
        $symbols = array_values(array_unique(array_map(fn (array $lot): string => (string) $lot['symbol'], $lots)));
        $dates = array_values(array_unique(array_map(fn (array $lot): string => (string) $lot[$dateField], $lots)));
        if (empty($symbols) || empty($dates)) {
            return [];
        }

        $rows = DB::table('fin_account_line_items')
            ->where('t_account', $acctId)
            ->whereIn('t_symbol', $symbols)
            ->whereIn('t_date', $dates)
            ->whereIn('t_type', $types)
            ->get(['t_id', 't_symbol', 't_date', 't_qty']);

        $grouped = [];
        foreach ($rows as $row) {
            $grouped[$this->transactionCandidateKey((string) $row->t_symbol, (string) $row->t_date)][] = $row;
        }

        return $grouped;
    }

    /**
     * @param  array<string, array<int, object>>  $candidates
     */
    private function bestTransactionId(array $candidates, string $symbol, string $date, float $quantity): ?int
    {
        $rows = $candidates[$this->transactionCandidateKey($symbol, $date)] ?? [];
        $bestId = null;
        $bestDelta = null;

        foreach ($rows as $row) {
            $delta = abs(abs((float) $row->t_qty) - $quantity);
            if ($bestDelta === null || $delta < $bestDelta) {
                $bestId = (int) $row->t_id;
                $bestDelta = $delta;
            }
        }

        return $bestId;
    }

    private function transactionCandidateKey(string $symbol, string $date): string
    {
        return $symbol.'|'.$date;
    }

    /**
     * @param  array<int, array{lot_id: int, open_t_id: int|null, close_t_id: int|null}>  $updates
     */
    private function bulkUpdateLotTransactionIds(array $updates): void
    {
        foreach (array_chunk($updates, 500) as $chunk) {
            $lotIds = array_map(static fn (array $update): int => $update['lot_id'], $chunk);
            FinAccountLot::query()
                ->whereIn('lot_id', $lotIds)
                ->update([
                    'open_t_id' => DB::raw($this->caseLotUpdateSql($chunk, 'open_t_id')),
                    'close_t_id' => DB::raw($this->caseLotUpdateSql($chunk, 'close_t_id')),
                    'updated_at' => now(),
                ]);
        }
    }

    /**
     * @param  array<int, array{lot_id: int, open_t_id: int|null, close_t_id: int|null}>  $updates
     */
    private function caseLotUpdateSql(array $updates, string $field): string
    {
        $cases = ['CASE lot_id'];

        foreach ($updates as $update) {
            $value = $update[$field] === null ? 'NULL' : (string) (int) $update[$field];
            $cases[] = sprintf('WHEN %d THEN %s', $update['lot_id'], $value);
        }

        $cases[] = "ELSE {$field}";
        $cases[] = 'END';

        return implode(' ', $cases);
    }

    private function documentIdFromTaxDocumentOption(): int|false|null
    {
        $raw = $this->option('tax-document');
        if ($raw === null || $raw === '') {
            return null;
        }

        $taxDocumentId = (int) $raw;
        if ($taxDocumentId <= 0 || (string) $taxDocumentId !== (string) $raw) {
            $this->error('--tax-document must be a positive integer.');

            return false;
        }

        $documentId = DB::table('fin_tax_documents')
            ->where('id', $taxDocumentId)
            ->where('user_id', $this->userId())
            ->value('document_id');

        if (! is_numeric($documentId)) {
            $this->error("Tax document {$taxDocumentId} not found or does not belong to user {$this->userId()}.");

            return false;
        }

        return (int) $documentId;
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private function normaliseSymbol(array $row): string
    {
        $symbol = strtoupper(trim((string) ($row['symbol'] ?? '')));
        if ($symbol !== '') {
            return $symbol;
        }

        $cusip = strtoupper(trim((string) ($row['cusip'] ?? '')));
        if ($cusip !== '') {
            return $cusip;
        }

        $description = preg_replace('/[^A-Z0-9]+/i', '', (string) ($row['description'] ?? 'LOT')) ?? 'LOT';

        return strtoupper(substr($description, 0, 20)) ?: 'LOT';
    }

    /**
     * Parse "MM/DD/YY" → "YYYY-MM-DD".
     *
     * Uses a pivot-year approach: 2-digit years ≤ (current year + 10) mod 100
     * are treated as 20xx; years above the pivot are treated as 19xx.
     * This correctly handles long-held positions acquired in the late 1990s
     * (e.g. "12/31/99" → 1999-12-31, not 2099-12-31).
     */
    private function parseFidelityDate(string $raw): ?string
    {
        $raw = trim($raw);
        if (! preg_match('#^(\d{1,2})/(\d{1,2})/(\d{2})$#', $raw, $m)) {
            return null;
        }

        $twoDigitYear = (int) $m[3];
        $pivotYear = (int) date('y') + 10; // e.g. 2025 → pivot = 35
        $century = $twoDigitYear <= $pivotYear ? 2000 : 1900;

        return sprintf('%04d-%02d-%02d', $century + $twoDigitYear, (int) $m[1], (int) $m[2]);
    }

    /**
     * Normalise a date field from JSON/CSV to YYYY-MM-DD.
     * Accepts: "2025-10-08", "10/08/25", "10/08/2025".
     * Returns null if unparseable (e.g. "various").
     */
    private function normaliseDateField(string $raw): ?string
    {
        $raw = trim($raw);
        if (! $raw || strtolower($raw) === 'various') {
            return null;
        }

        // Already ISO
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) {
            return $raw;
        }

        // MM/DD/YYYY
        if (preg_match('#^(\d{1,2})/(\d{1,2})/(\d{4})$#', $raw, $m)) {
            return sprintf('%04d-%02d-%02d', (int) $m[3], (int) $m[1], (int) $m[2]);
        }

        // MM/DD/YY
        return $this->parseFidelityDate($raw);
    }

    /** Strip commas and cast to float. */
    private function amountFromText(string $raw): float
    {
        return (float) str_replace(',', '', trim($raw));
    }

    private function printSchema(): void
    {
        $this->line('');
        $this->line('=== JSON format (broker_1099 lot transactions) ===');
        $this->line('');
        $schema = [
            'payer_name' => 'string (optional, for reference)',
            'transactions' => [
                [
                    'symbol' => 'string — ticker symbol, e.g. "AAPL"',
                    'description' => 'string (optional)',
                    'cusip' => 'string (optional)',
                    'quantity' => 'number — shares/units sold',
                    'purchase_date' => 'string — YYYY-MM-DD or "various" (lots acquired over multiple dates)',
                    'sale_date' => 'string — YYYY-MM-DD',
                    'proceeds' => 'number — gross proceeds in USD',
                    'cost_basis' => 'number — total cost basis in USD',
                    'realized_gain_loss' => 'number — broker-reported gain/loss (negative = loss)',
                    'wash_sale_disallowed' => 'number (optional, default 0)',
                    'wash_sale_treatment' => 'string (optional) — gross_of_wash_sales, already_reflected_in_cost_basis, already_net_of_wash_sales, no_wash_sale_amount, or unknown',
                    'is_short_term' => 'boolean — true if held ≤ 1 year',
                    'form_8949_box' => 'string (optional) — A=ST covered, D=LT covered, etc.',
                    'is_covered' => 'boolean (optional) — whether basis is reported to IRS',
                ],
            ],
        ];
        $this->line(json_encode($schema, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        $this->line('');

        $this->line('=== CSV format ===');
        $this->line('');
        $requiredCols = implode(',', self::CSV_REQUIRED_COLS);
        $optionalCols = implode(',', self::CSV_OPTIONAL_COLS);
        $this->line('Required columns (in any order):');
        $this->line('  '.$requiredCols);
        $this->line('Optional columns:');
        $this->line('  '.$optionalCols);
        $this->line('');
        $this->line('Example CSV (header + one row):');
        $this->line('symbol,description,quantity,purchase_date,sale_date,proceeds,cost_basis,realized_gain_loss,wash_sale_disallowed,wash_sale_treatment,is_short_term');
        $this->line('AAPL,"APPLE INC",10,2025-01-15,2025-11-20,2350.00,2000.00,350.00,0.00,no_wash_sale_amount,true');
        $this->line('');
        $this->line('Dates may be YYYY-MM-DD, MM/DD/YYYY, MM/DD/YY, or "various" (purchase_date only).');
        $this->line('is_short_term: true/false/1/0/yes/no/lt/st');
        $this->line('');

        $this->line('=== TOON format (Token-Oriented Object Notation) ===');
        $this->line('');
        $this->line('TOON uses the same schema as JSON but 30-60% fewer tokens — ideal for AI-generated input.');
        $this->line('See: https://github.com/helgesverre/toon');
        $this->line('');
        $this->line('Example TOON (same structure as JSON, indentation-based):');
        $this->line('transactions');
        $this->line('  - symbol: AAPL');
        $this->line('    description: APPLE INC COM');
        $this->line('    quantity: 10');
        $this->line('    purchase_date: 2025-01-15');
        $this->line('    sale_date: 2025-11-20');
        $this->line('    proceeds: 2350.00');
        $this->line('    cost_basis: 2000.00');
        $this->line('    realized_gain_loss: 350.00');
        $this->line('    wash_sale_treatment: no_wash_sale_amount');
        $this->line('    is_short_term: true');
        $this->line('');
        $this->line('Files with .toon extension are auto-detected. Use --input-format=toon to force.');
        $this->line('');

        $this->line('=== Broker PDF/text format ===');
        $this->line('');
        $this->line('Fidelity pdftotext remains supported for Fidelity statements.');
        $this->line('Extract with:  pdftotext -layout "2025 1099 Fidelity.pdf" - | \\');
        $this->line('               php artisan finance:lots-import --account=<id>');
        $this->line('Or import a supported broker PDF directly:');
        $this->line('               php artisan finance:lots-import --account=<id> --file="2025 1099 Wealthfront.pdf"');
        $this->line('');
        $this->line('The file must contain "FORM 1099-B" and "Short-term transactions" or');
        $this->line('"Long-term transactions" section headers, or the standard Wealthfront covered-lot layout.');
    }

    /** @param  array<int, array<string, mixed>>  $lots */
    private function renderLotsTable(array $lots): void
    {
        $headers = ['symbol', 'qty', 'acquired', 'sold', 'proceeds', 'cost_basis', 'gain_loss', 'term'];
        $rows = [];

        foreach ($lots as $lot) {
            $rows[] = [
                $lot['symbol'],
                number_format((float) $lot['quantity'], 3),
                $lot['purchase_date'],
                $lot['sale_date'],
                number_format((float) $lot['proceeds'], 2),
                number_format((float) $lot['cost_basis'], 2),
                number_format((float) $lot['realized_gain_loss'], 2),
                $lot['is_short_term'] ? 'ST' : 'LT',
            ];
        }

        $this->outputData($headers, $rows, ['lots' => $lots]);
    }
}
