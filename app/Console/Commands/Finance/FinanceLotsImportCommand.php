<?php

namespace App\Console\Commands\Finance;

use HelgeSverre\Toon\Toon;
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
 *  TEXT  – Raw pdftotext -layout output from a Fidelity 1099-B PDF.
 *           Auto-detected when the file contains "FORM 1099-B".
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
 *   # Fidelity pdftotext
 *   pdftotext -layout "2025 1099.pdf" - | php artisan finance:lots-import --account=33
 *
 *   # Print expected schema
 *   php artisan finance:lots-import --schema
 */
class FinanceLotsImportCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:lots-import
        {--account= : Target fin_accounts.acct_id (required unless --schema)}
        {--file= : Path to input file; omit to read from stdin}
        {--input-format= : Force input format: json | csv | toon | text (auto-detected by default)}
        {--dry-run : Show what would be imported without writing to the database}
        {--clear : Delete all existing lots for this account before importing}
        {--schema : Print expected input schemas and exit}
        {--format=table : Output format: table or json}';

    protected $description = 'Import 1099-B lots (JSON / CSV / TOON / Fidelity pdftotext) into fin_account_lots';

    // ── CSV column constants ──────────────────────────────────────────────────

    private const CSV_REQUIRED_COLS = ['symbol', 'quantity', 'purchase_date', 'sale_date', 'proceeds', 'cost_basis', 'realized_gain_loss'];

    private const CSV_OPTIONAL_COLS = ['description', 'cusip', 'wash_sale_disallowed', 'is_short_term', 'form_8949_box', 'is_covered'];

    // ── pdftotext parser state ────────────────────────────────────────────────

    private string $currentSymbol = '';

    private string $currentDescription = '';

    private bool $isLongTerm = false;

    // ── main ──────────────────────────────────────────────────────────────────

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

        if ($doClear) {
            $deleted = DB::table('fin_account_lots')->where('acct_id', $acctId)->delete();
            $this->info("Cleared {$deleted} existing lot record(s) for account {$acctId}.");
        }

        [$inserted, $skipped] = $this->persistLots($acctId, $lots);

        $this->info("Imported: {$inserted} inserted, {$skipped} skipped (duplicate).");

        $sample = array_slice($lots, 0, 10);
        $this->renderLotsTable($sample);

        if (count($lots) > 10) {
            $this->line(sprintf('... and %d more (showing first 10)', count($lots) - 10));
        }

        return 0;
    }

    // ── input ─────────────────────────────────────────────────────────────────

    private function readInput(): ?string
    {
        $filePath = $this->option('file');

        if ($filePath) {
            if (! file_exists($filePath)) {
                $this->error("File not found: {$filePath}");

                return null;
            }

            $raw = file_get_contents($filePath);
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

    // ── JSON parser ───────────────────────────────────────────────────────────

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

        $lots = [];
        foreach ($txns as $i => $row) {
            $missing = array_diff(self::CSV_REQUIRED_COLS, array_keys($row));
            if (! empty($missing)) {
                $this->warn("Row {$i}: missing fields ".implode(', ', $missing).' — skipped.');

                continue;
            }

            $purchaseDate = $this->normaliseDateField($row['purchase_date']);
            $saleDate = $this->normaliseDateField($row['sale_date']);

            if (! $saleDate) {
                $this->warn("Row {$i} ({$row['symbol']}): invalid sale_date '{$row['sale_date']}' — skipped.");

                continue;
            }

            $lots[] = [
                'symbol' => strtoupper(trim($row['symbol'])),
                'description' => trim($row['description'] ?? ''),
                'quantity' => (float) $row['quantity'],
                'purchase_date' => $purchaseDate ?? $saleDate,   // "various" → use sale_date as placeholder
                'sale_date' => $saleDate,
                'cost_basis' => round((float) $row['cost_basis'], 4),
                'proceeds' => round((float) $row['proceeds'], 4),
                'realized_gain_loss' => round((float) $row['realized_gain_loss'], 4),
                'wash_sale_disallowed' => round((float) ($row['wash_sale_disallowed'] ?? 0), 4),
                'is_short_term' => (bool) ($row['is_short_term'] ?? true),
            ];
        }

        return $lots;
    }

    // ── TOON parser ───────────────────────────────────────────────────────────

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

    // ── CSV parser ────────────────────────────────────────────────────────────

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
                'quantity' => (float) str_replace(',', '', $get('quantity')),
                'purchase_date' => $purchaseDate ?? $saleDate,
                'sale_date' => $saleDate,
                'cost_basis' => round((float) str_replace(',', '', $get('cost_basis')), 4),
                'proceeds' => round((float) str_replace(',', '', $get('proceeds')), 4),
                'realized_gain_loss' => round((float) str_replace(',', '', $get('realized_gain_loss')), 4),
                'wash_sale_disallowed' => round((float) str_replace(',', '', $get('wash_sale_disallowed')), 4),
                'is_short_term' => $isShortTermBool,
            ];
        }

        return $lots;
    }

    // ── pdftotext parser ──────────────────────────────────────────────────────

    /**
     * Parse Fidelity 1099-B pdftotext -layout output.
     *
     * Recognises Sale and Merger action rows in both short-term and long-term
     * sections.
     *
     * @return array<int, array<string, mixed>>
     */
    private function parseText(string $text): array
    {
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
                'quantity' => $qty,
                'purchase_date' => $dateAcquired ?? $dateSold,
                'sale_date' => $dateSold,
                'cost_basis' => round($costBasis, 4),
                'proceeds' => round($proceeds, 4),
                'realized_gain_loss' => round($gainLoss, 4),
                'wash_sale_disallowed' => round($washSale, 4),
                'is_short_term' => ! $this->isLongTerm,
            ];
        }

        return $lots;
    }

    // ── persistence ───────────────────────────────────────────────────────────

    /**
     * Insert parsed lots, skipping exact duplicates already in the table.
     *
     * A duplicate is defined as: same acct_id + symbol + quantity + purchase_date
     * + sale_date + proceeds + cost_basis (within 0.01 rounding).
     *
     * @param  array<int, array<string, mixed>>  $lots
     * @return array{0: int, 1: int} [inserted, skipped]
     */
    private function persistLots(int $acctId, array $lots): array
    {
        $inserted = 0;
        $skipped = 0;
        $now = now();

        foreach ($lots as $lot) {
            // Duplicate check
            $exists = DB::table('fin_account_lots')
                ->where('acct_id', $acctId)
                ->where('symbol', $lot['symbol'])
                ->whereRaw('ABS(quantity - ?) < 0.0001', [$lot['quantity']])
                ->where('purchase_date', $lot['purchase_date'])
                ->where('sale_date', $lot['sale_date'])
                ->whereRaw('ABS(proceeds - ?) < 0.01', [$lot['proceeds']])
                ->whereRaw('ABS(cost_basis - ?) < 0.01', [$lot['cost_basis']])
                ->exists();

            if ($exists) {
                $skipped++;

                continue;
            }

            $costPerUnit = $lot['quantity'] > 0
                ? round($lot['cost_basis'] / $lot['quantity'], 8)
                : null;

            $closeId = $this->findClosingTransaction($acctId, $lot);
            $openId = $this->findOpeningTransaction($acctId, $lot);

            DB::table('fin_account_lots')->insert([
                'acct_id' => $acctId,
                'symbol' => $lot['symbol'],
                'description' => $lot['description'],
                'quantity' => $lot['quantity'],
                'purchase_date' => $lot['purchase_date'],
                'cost_basis' => $lot['cost_basis'],
                'cost_per_unit' => $costPerUnit,
                'sale_date' => $lot['sale_date'],
                'proceeds' => $lot['proceeds'],
                'realized_gain_loss' => $lot['realized_gain_loss'],
                'is_short_term' => $lot['is_short_term'] ? 1 : 0,
                'lot_source' => 'import_1099b',
                'open_t_id' => $openId,
                'close_t_id' => $closeId,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $inserted++;
        }

        return [$inserted, $skipped];
    }

    /**
     * Find the closing (sell/disposal) transaction for a lot.
     *
     * Handles sign conventions per type:
     *  - Sell / Sell Short / Merger / Cash In Lieu / Transfer: qty is negative
     *  - Cover (buy-to-cover a short): qty is positive
     * We match on ABS(qty) and allow either sign.
     *
     * @param  array<string, mixed>  $lot
     */
    private function findClosingTransaction(int $acctId, array $lot): ?int
    {
        $row = DB::table('fin_account_line_items')
            ->where('t_account', $acctId)
            ->where('t_symbol', $lot['symbol'])
            ->where('t_date', $lot['sale_date'])
            ->whereIn('t_type', ['Sell', 'Cover', 'Sell Short', 'Transfer', 'Merger', 'Cash In Lieu'])
            ->orderByRaw('ABS(ABS(t_qty) - ?) ASC', [$lot['quantity']])
            ->first(['t_id']);

        return $row?->t_id;
    }

    /**
     * Find the opening (buy) transaction for a lot.
     *
     * For long positions: Buy / Reinvest / Transfer with positive qty.
     * For short positions: 'Sell Short' with negative qty (short opening).
     * We match on ABS(qty) regardless of sign.
     *
     * @param  array<string, mixed>  $lot
     */
    private function findOpeningTransaction(int $acctId, array $lot): ?int
    {
        $row = DB::table('fin_account_line_items')
            ->where('t_account', $acctId)
            ->where('t_symbol', $lot['symbol'])
            ->where('t_date', $lot['purchase_date'])
            ->whereIn('t_type', ['Buy', 'Sell Short', 'Transfer', 'Reinvest'])
            ->orderByRaw('ABS(ABS(t_qty) - ?) ASC', [$lot['quantity']])
            ->first(['t_id']);

        return $row?->t_id;
    }

    // ── helpers ───────────────────────────────────────────────────────────────

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

    // ── schema ────────────────────────────────────────────────────────────────

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
                    'realized_gain_loss' => 'number — proceeds minus cost_basis (negative = loss)',
                    'wash_sale_disallowed' => 'number (optional, default 0)',
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
        $this->line('symbol,description,quantity,purchase_date,sale_date,proceeds,cost_basis,realized_gain_loss,wash_sale_disallowed,is_short_term');
        $this->line('AAPL,"APPLE INC",10,2025-01-15,2025-11-20,2350.00,2000.00,350.00,0.00,true');
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
        $this->line('    is_short_term: true');
        $this->line('');
        $this->line('Files with .toon extension are auto-detected. Use --input-format=toon to force.');
        $this->line('');

        $this->line('=== Fidelity pdftotext text format ===');
        $this->line('');
        $this->line('Extract with:  pdftotext -layout "2025 1099 Fidelity.pdf" - | \\');
        $this->line('               php artisan finance:lots-import --account=<id>');
        $this->line('');
        $this->line('The file must contain "FORM 1099-B" and "Short-term transactions" or');
        $this->line('"Long-term transactions" section headers (standard Fidelity layout).');
    }

    // ── output ────────────────────────────────────────────────────────────────

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
