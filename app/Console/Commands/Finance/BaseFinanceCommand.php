<?php

namespace App\Console\Commands\Finance;

use App\Models\User;
use HelgeSverre\Toon\DecodeOptions;
use HelgeSverre\Toon\Exceptions\DecodeException;
use HelgeSverre\Toon\Toon;
use Illuminate\Console\Command;

/**
 * Base class for Finance CLI commands.
 *
 * Provides shared utilities for user resolution, output formatting,
 * and monospaced table rendering — used by all `finance:*` artisan commands.
 *
 * ## User resolution
 * User ID is read from the `FINANCE_CLI_USER_ID` environment variable,
 * defaulting to 1 if not set. All queries are scoped to this user.
 *
 * ## Output formats
 * Commands expose a `--format` option (table|json|toon). Use `outputData()` to
 * emit rows in the caller-chosen format. Use `outputJson()` or `renderTable()`
 * directly when you need explicit control.
 */
abstract class BaseFinanceCommand extends Command
{
    private ?int $cachedUserId = null;

    /**
     * Resolve the target user ID from the environment.
     *
     * Reads FINANCE_CLI_USER_ID; falls back to 1. Cached after first call.
     */
    protected function userId(): int
    {
        return $this->cachedUserId ??= (int) (env('FINANCE_CLI_USER_ID', 1) ?: 1);
    }

    /**
     * Resolve the target User model, returning null if not found.
     *
     * Callers should return 1 immediately on null:
     *
     *   if ($this->resolveUser() === null) { return 1; }
     */
    protected function resolveUser(): ?User
    {
        $user = User::find($this->userId());

        if (! $user) {
            $this->error("User ID {$this->userId()} not found. Set FINANCE_CLI_USER_ID to a valid user.");

            return null;
        }

        return $user;
    }

    /**
     * Output an array of rows in the format selected by --format (table|json|toon).
     *
     * @param  array<string>  $headers  Column headers (for table mode)
     * @param  array<array<array-key, mixed>>  $rows  Rows of scalar values (for table mode)
     * @param  array<mixed>  $data  Raw data (for json mode)
     */
    protected function outputData(array $headers, array $rows, array $data): void
    {
        $format = $this->option('format') ?? 'table';

        if ($format === 'json') {
            $this->outputJson($data);
        } elseif ($format === 'toon') {
            $this->outputToon($data);
        } else {
            $this->renderTable($headers, $rows);
        }
    }

    /**
     * Emit $data as a JSON string on stdout.
     *
     * @param  array<mixed>  $data
     */
    protected function outputJson(array $data): void
    {
        $this->line(json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    /**
     * Emit $data as TOON on stdout.
     *
     * @param  array<mixed>  $data
     */
    protected function outputToon(array $data): void
    {
        $this->line(Toon::encode($data));
    }

    /**
     * Render a monospaced table to the terminal.
     *
     * Calculates the maximum width of each column across both headers and rows,
     * then pads every cell with spaces so columns are aligned.
     *
     * @param  array<string>  $headers
     * @param  array<array<array-key, mixed>>  $rows
     */
    protected function renderTable(array $headers, array $rows): void
    {
        if (empty($headers)) {
            $this->line('(no columns)');

            return;
        }

        // Compute column widths: max of header width vs. any row cell width.
        $widths = array_map('strlen', $headers);

        foreach ($rows as $row) {
            foreach ($row as $i => $cell) {
                $widths[$i] = max($widths[$i] ?? 0, strlen((string) $cell));
            }
        }

        $separator = '+'.implode('+', array_map(fn ($w) => str_repeat('-', $w + 2), $widths)).'+';
        $formatRow = function (array $cells) use ($widths): string {
            $parts = [];
            foreach ($widths as $i => $w) {
                $parts[] = ' '.str_pad((string) ($cells[$i] ?? ''), $w).' ';
            }

            return '|'.implode('|', $parts).'|';
        };

        $this->line($separator);
        $this->line($formatRow($headers));
        $this->line($separator);

        if (empty($rows)) {
            $totalWidth = array_sum($widths) + count($widths) * 3 + 1;
            $this->line('| '.str_pad('(no results)', $totalWidth - 4).' |');
        } else {
            foreach ($rows as $row) {
                $this->line($formatRow($row));
            }
        }

        $this->line($separator);
        $this->line(count($rows).' row(s)');
    }

    /**
     * Read and decode a JSON payload from stdin.
     *
     * Returns null if stdin is empty or the content is not valid JSON,
     * printing an error in the latter case.
     *
     * @return array<mixed>|null
     */
    protected function readJsonFromStdin(): ?array
    {
        $raw = '';

        while (! feof(STDIN)) {
            $chunk = fread(STDIN, 8192);
            if ($chunk === false) {
                break;
            }
            $raw .= $chunk;
        }

        $raw = trim($raw);

        if ($raw === '') {
            return null;
        }

        $decoded = json_decode($raw, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            $this->error('Invalid JSON from stdin: '.json_last_error_msg());

            return null;
        }

        return $decoded;
    }

    /**
     * Read and decode a JSON or TOON payload from stdin.
     *
     * @return array<mixed>|null
     */
    protected function readStructuredFromStdin(string $format = 'auto'): ?array
    {
        $raw = '';

        while (! feof(STDIN)) {
            $chunk = fread(STDIN, 8192);
            if ($chunk === false) {
                break;
            }
            $raw .= $chunk;
        }

        $raw = trim($raw);

        if ($raw === '') {
            return null;
        }

        if ($format === 'json' || $format === 'auto') {
            $decoded = json_decode($raw, true);

            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                return $decoded;
            }

            if ($format === 'json') {
                $this->error('Invalid JSON from stdin: '.json_last_error_msg());

                return null;
            }
        }

        if ($format === 'toon' || $format === 'auto') {
            try {
                $decoded = Toon::decode($raw, DecodeOptions::lenient());
            } catch (DecodeException $e) {
                $this->error('Invalid TOON from stdin: '.$e->getMessage());

                return null;
            }

            if (is_array($decoded)) {
                return $decoded;
            }

            $this->error('Invalid TOON from stdin: decoded payload must be an object or array.');

            return null;
        }

        $this->error("Invalid --input-format value '{$format}'. Use 'auto', 'json', or 'toon'.");

        return null;
    }

    /**
     * Emit a JSON schema to stdout.
     *
     * Called when the command is invoked with --schema. Intended for LLM context
     * injection: the caller can run `php artisan finance:import-X --schema` to
     * learn the expected stdin payload before generating import data.
     *
     * The caller should return 0 immediately after this call.
     *
     * @param  array<mixed>  $schema
     */
    protected function emitSchema(array $schema): void
    {
        $this->line(json_encode($schema, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    /**
     * Common --format option definition. Add to $signature as {--format=table}.
     * Validated here so individual commands don't need to repeat the check.
     *
     * @param  list<string>  $allowedFormats
     */
    protected function validateFormat(array $allowedFormats = ['table', 'json']): bool
    {
        $format = $this->option('format') ?? 'table';

        if (! in_array($format, $allowedFormats, true)) {
            $this->error("Invalid --format value '{$format}'. Use ".implode(', ', array_map(fn (string $value): string => "'{$value}'", $allowedFormats)).'.');

            return false;
        }

        return true;
    }
}
