<?php

namespace App\Services\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinDocument;
use App\Models\FinanceTool\FinDocumentAccount;
use Illuminate\Database\Eloquent\Collection;

class AccountSuggestionService
{
    /**
     * @return array{
     *     hints: array<string, mixed>,
     *     suggestions: list<array<string, mixed>>,
     *     similar_links: list<array<string, mixed>>
     * }
     */
    public function suggestionsForLink(FinDocumentAccount $link, int $userId, bool $includeClosed = false): array
    {
        $link->loadMissing(['document.taxDocument', 'taxDocument']);

        $document = $link->document;
        $taxDocument = $link->taxDocument;
        $hints = $this->hints($link, $document, $taxDocument);

        /** @var Collection<int, FinAccounts> $accounts */
        $accounts = FinAccounts::query()
            ->forOwner($userId)
            ->when(! $includeClosed, fn ($query) => $query->whereNull('when_closed'))
            ->orderBy('when_closed')
            ->orderBy('acct_sort_order')
            ->orderBy('acct_name')
            ->get();

        $suggestions = $accounts
            ->map(fn (FinAccounts $account): array => $this->scoreAccount($account, $hints))
            ->sortBy([
                ['score', 'desc'],
                ['is_closed', 'asc'],
                ['account.acct_name', 'asc'],
            ])
            ->values()
            ->all();

        return [
            'hints' => $hints,
            'suggestions' => $suggestions,
            'similar_links' => $this->similarLinks($link),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function hints(FinDocumentAccount $link, ?FinDocument $document, ?FileForTaxDocument $taxDocument): array
    {
        $broker = $this->brokerName($taxDocument);

        return [
            'document_id' => (int) $link->document_id,
            'link_id' => (int) $link->id,
            'tax_document_id' => $taxDocument instanceof FileForTaxDocument ? (int) $taxDocument->id : null,
            'form_type' => $link->form_type,
            'tax_year' => $link->tax_year,
            'account_section_label' => $link->account_section_label,
            'ai_identifier' => $link->ai_identifier,
            'ai_account_name' => $link->ai_account_name,
            'source_filename' => $document instanceof FinDocument
                ? $document->original_filename
                : $taxDocument?->original_filename,
            'broker' => $broker,
        ];
    }

    /**
     * @param  array<string, mixed>  $hints
     * @return array<string, mixed>
     */
    private function scoreAccount(FinAccounts $account, array $hints): array
    {
        $score = 0;
        $reasons = [];

        $identifierDigits = $this->digits($hints['ai_identifier'] ?? null);
        $accountDigits = $this->digits($account->acct_number);

        if ($identifierDigits !== '' && $accountDigits !== '') {
            if (str_contains($identifierDigits, $accountDigits) || str_contains($accountDigits, $identifierDigits)) {
                $score += 60;
                $reasons[] = 'Account number matches';
            } elseif (strlen($identifierDigits) >= 4 && strlen($accountDigits) >= 4 && substr($identifierDigits, -4) === substr($accountDigits, -4)) {
                $score += 45;
                $reasons[] = 'Last four digits match';
            }
        }

        $accountName = (string) $account->acct_name;
        $nameScore = $this->nameScore((string) ($hints['ai_account_name'] ?? ''), $accountName);
        if ($nameScore > 0) {
            $score += $nameScore;
            $reasons[] = $nameScore >= 40 ? 'Account name matches' : 'Account name overlaps';
        }

        $contextScore = max(
            $this->nameScore((string) ($hints['broker'] ?? ''), $accountName),
            $this->nameScore((string) ($hints['source_filename'] ?? ''), $accountName),
            $this->nameScore((string) ($hints['account_section_label'] ?? ''), $accountName),
        );
        if ($contextScore > 0) {
            $score += min(20, $contextScore);
            $reasons[] = 'Document context overlaps';
        }

        $isClosed = $account->when_closed !== null;
        if ($isClosed) {
            $score = max(0, $score - 20);
            $reasons[] = 'Closed account';
        }

        if ($reasons === []) {
            $reasons[] = 'Available account';
        }

        return [
            'account' => [
                'acct_id' => (int) $account->acct_id,
                'acct_name' => (string) $account->acct_name,
                'acct_number' => $account->acct_number,
                'when_closed' => $this->dateString($account->when_closed),
            ],
            'score' => min(100, $score),
            'reasons' => array_values(array_unique($reasons)),
            'is_closed' => $isClosed,
        ];
    }

    private function nameScore(string $hint, string $accountName): int
    {
        $hintNormalized = $this->normalizeText($hint);
        $accountNormalized = $this->normalizeText($accountName);

        if ($hintNormalized === '' || $accountNormalized === '') {
            return 0;
        }

        if (str_contains($hintNormalized, $accountNormalized) || str_contains($accountNormalized, $hintNormalized)) {
            return 45;
        }

        $hintTokens = $this->tokens($hintNormalized);
        $accountTokens = $this->tokens($accountNormalized);
        $overlap = array_intersect($hintTokens, $accountTokens);

        return min(30, count($overlap) * 8);
    }

    /**
     * @return list<string>
     */
    private function tokens(string $value): array
    {
        $tokens = preg_split('/\s+/', $value) ?: [];

        return array_values(array_filter(
            array_unique($tokens),
            static fn (string $token): bool => strlen($token) >= 3
        ));
    }

    private function normalizeText(string $value): string
    {
        $value = strtolower($value);
        $value = preg_replace('/[^a-z0-9]+/', ' ', $value) ?? '';

        return trim($value);
    }

    private function digits(mixed $value): string
    {
        if (! is_string($value) && ! is_numeric($value)) {
            return '';
        }

        return preg_replace('/\D+/', '', (string) $value) ?? '';
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function similarLinks(FinDocumentAccount $link): array
    {
        $query = FinDocumentAccount::query()
            ->where('document_id', $link->document_id)
            ->whereNull('account_id')
            ->with('taxDocument')
            ->orderBy('id');

        $query->where(function ($query) use ($link): void {
            $hasPredicate = false;

            if ($this->filled($link->ai_identifier)) {
                $query->orWhere('ai_identifier', $link->ai_identifier);
                $hasPredicate = true;
            }

            if ($this->filled($link->ai_account_name)) {
                $query->orWhere('ai_account_name', $link->ai_account_name);
                $hasPredicate = true;
            }

            if ($this->filled($link->form_type)) {
                $query->orWhere('form_type', $link->form_type);
                $hasPredicate = true;
            }

            if (! $hasPredicate) {
                $query->whereKey($link->id);
            }
        });

        return $query
            ->get()
            ->map(fn (FinDocumentAccount $similar): array => $this->linkPayload($similar))
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function linkPayload(FinDocumentAccount $link): array
    {
        $taxDocument = $link->relationLoaded('taxDocument') ? $link->taxDocument : null;

        return [
            'id' => (int) $link->id,
            'document_id' => (int) $link->document_id,
            'tax_document_id' => $taxDocument instanceof FileForTaxDocument ? (int) $taxDocument->id : null,
            'form_type' => $link->form_type,
            'tax_year' => $link->tax_year,
            'account_section_label' => $link->account_section_label,
            'ai_identifier' => $link->ai_identifier,
            'ai_account_name' => $link->ai_account_name,
        ];
    }

    private function brokerName(?FileForTaxDocument $taxDocument): ?string
    {
        if (! $taxDocument instanceof FileForTaxDocument) {
            return null;
        }

        $parsedData = $taxDocument->parsed_data;
        $entries = is_array($parsedData) && array_is_list($parsedData) ? $parsedData : [$parsedData];

        foreach ($entries as $entry) {
            if (! is_array($entry)) {
                continue;
            }

            $payload = is_array($entry['parsed_data'] ?? null) ? $entry['parsed_data'] : $entry;

            foreach (['payer_name', 'broker', 'broker_name', 'issuer_name'] as $key) {
                $value = $payload[$key] ?? $entry[$key] ?? null;
                if (is_string($value) && trim($value) !== '') {
                    return trim($value);
                }
            }

            $accountName = $entry['account_name'] ?? null;
            if (is_string($accountName) && trim($accountName) !== '') {
                return trim($accountName);
            }
        }

        return $taxDocument->original_filename;
    }

    private function dateString(mixed $value): ?string
    {
        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d');
        }

        if (is_string($value) && trim($value) !== '') {
            return $value;
        }

        return null;
    }

    private function filled(?string $value): bool
    {
        return is_string($value) && trim($value) !== '';
    }
}
