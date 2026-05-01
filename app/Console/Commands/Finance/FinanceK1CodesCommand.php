<?php

namespace App\Console\Commands\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Services\Finance\K1CodeCharacterResolver;
use Illuminate\Database\Eloquent\Builder;

class FinanceK1CodesCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:k1-codes
        {--year= : Tax year to inspect (required unless --document is provided)}
        {--account= : Filter to K-1 documents linked to a financial account ID}
        {--document= : Inspect a single tax document ID}
        {--box= : Filter to a K-1 box number, e.g. 11, 13, 20}
        {--code= : Filter to a K-1 statement code, e.g. S, ZZ, AJ}
        {--format=table : Output format: table or json}';

    protected $description = 'List K-1 coded statement rows and resolved routing character metadata';

    public function __construct(private readonly K1CodeCharacterResolver $characterResolver)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        if (! $this->validateFormat()) {
            return 1;
        }

        $year = $this->option('year');
        $documentId = $this->option('document');

        if ($documentId === null && (! $year || ! ctype_digit((string) $year) || (int) $year < 1900 || (int) $year > 2100)) {
            $this->error('--year is required and must be a valid 4-digit year unless --document is provided.');

            return 1;
        }

        if ($this->resolveUser() === null) {
            return 1;
        }

        $rows = $this->buildRows();

        if (($this->option('format') ?? 'table') === 'json') {
            $this->outputJson($rows);

            return 0;
        }

        $tableRows = array_map(fn (array $row): array => [
            (string) $row['doc_id'],
            (string) $row['account_ids'],
            (string) $row['partnership'],
            (string) $row['box'],
            (string) $row['code'],
            (string) $row['value'],
            (string) ($row['character'] ?? ''),
            (string) ($row['character_source'] ?? ''),
            (string) ($row['destination'] ?? ''),
            (string) ($row['notes'] ?? ''),
        ], $rows);

        $this->renderTable(
            ['doc', 'accounts', 'partnership', 'box', 'code', 'value', 'char', 'char_source', 'destination', 'notes'],
            $tableRows,
        );

        return 0;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function buildRows(): array
    {
        return $this->queryDocuments()
            ->get()
            ->flatMap(fn (FileForTaxDocument $doc) => $this->rowsForDocument($doc))
            ->values()
            ->all();
    }

    /**
     * @return Builder<FileForTaxDocument>
     */
    private function queryDocuments(): Builder
    {
        $query = FileForTaxDocument::query()
            ->where('user_id', $this->userId())
            ->where('form_type', 'k1')
            ->whereNotNull('parsed_data')
            ->with(['accountLinks'])
            ->orderBy('tax_year')
            ->orderBy('id');

        if ($this->option('document') !== null) {
            $query->where('id', (int) $this->option('document'));
        } else {
            $query->where('tax_year', (int) $this->option('year'));
        }

        if ($this->option('account') !== null) {
            $accountId = (int) $this->option('account');
            $query->whereHas('accountLinks', fn (Builder $q): Builder => $q->where('account_id', $accountId));
        }

        return $query;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function rowsForDocument(FileForTaxDocument $doc): array
    {
        $data = $doc->parsed_data;
        if (! is_array($data)) {
            return [];
        }

        $codes = $data['codes'] ?? [];
        if (! is_array($codes)) {
            return [];
        }

        $boxFilter = $this->option('box') !== null ? strtoupper(trim((string) $this->option('box'))) : null;
        $codeFilter = $this->option('code') !== null ? $this->characterResolver->normalizeCode($this->option('code')) : null;
        $partnership = $this->partnershipName($data);
        $accountIds = $doc->accountLinks->pluck('account_id')->filter()->implode(',');
        $rows = [];

        foreach ($codes as $box => $items) {
            $normalizedBox = strtoupper(trim((string) $box));
            if ($boxFilter !== null && $normalizedBox !== $boxFilter) {
                continue;
            }
            if (! is_array($items)) {
                continue;
            }

            foreach ($items as $item) {
                if (! is_array($item)) {
                    continue;
                }

                $normalizedCode = $this->characterResolver->normalizeCode($item['code'] ?? null);
                if ($codeFilter !== null && $normalizedCode !== $codeFilter) {
                    continue;
                }

                $character = $this->characterResolver->resolve($normalizedBox, $item);
                $rows[] = [
                    'doc_id' => $doc->id,
                    'tax_year' => $doc->tax_year,
                    'account_ids' => $accountIds,
                    'partnership' => $partnership,
                    'filename' => $doc->original_filename,
                    'box' => $normalizedBox,
                    'code' => $normalizedCode,
                    'value' => (string) ($item['value'] ?? ''),
                    'notes' => (string) ($item['notes'] ?? ''),
                    'stored_character' => $item['character'] ?? null,
                    'character' => $character['character'] ?? null,
                    'character_source' => $character['source'] ?? null,
                    'destination' => $this->destination($normalizedBox, $normalizedCode, $character['character'] ?? null),
                ];
            }
        }

        return $rows;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function partnershipName(array $data): string
    {
        $fields = $data['fields'] ?? [];
        if (! is_array($fields)) {
            return 'Partnership';
        }

        $name = $fields['B']['value'] ?? $fields['A']['value'] ?? 'Partnership';

        return trim(strtok((string) $name, "\n") ?: (string) $name);
    }

    private function destination(string $box, string $code, ?string $character): ?string
    {
        if ($box === '11' && $code === 'S') {
            return match ($character) {
                'short' => 'Schedule D line 5',
                'long' => 'Schedule D line 12',
                default => 'Needs ST/LT classification',
            };
        }

        if ($box === '11' && $code === 'ZZ') {
            return 'Schedule E Part II nonpassive';
        }

        if ($box === '13' && $code === 'H') {
            return 'Form 4952, then Schedule E if K-1 footnote directs nonpassive treatment';
        }

        if ($box === '13' && $code === 'ZZ') {
            return 'Schedule E Part II nonpassive';
        }

        if ($box === '20' && $code === 'AJ') {
            return 'Form 461 support only';
        }

        return null;
    }
}
