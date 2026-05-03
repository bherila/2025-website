<?php

namespace App\Services\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Collection;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class Form8949LotExportService
{
    /**
     * @param  array<string, mixed>  $validated
     * @return Form8949ExportLot[]
     */
    public function lotsForRequest(int $userId, array $validated): array
    {
        if (($validated['source'] ?? null) === 'analyzer') {
            return $this->analyzerLots($validated['lots'] ?? []);
        }

        $lots = match ($validated['scope'] ?? null) {
            'all' => $this->databaseLotsForYear($userId, (int) $validated['tax_year']),
            'account_document' => $this->databaseLotsForAccountDocument(
                $userId,
                (int) $validated['account_id'],
                (int) $validated['tax_document_id'],
                isset($validated['account_link_id']) ? (int) $validated['account_link_id'] : null,
            ),
            default => collect(),
        };

        return $lots->map(fn (FinAccountLot $lot): Form8949ExportLot => $this->fromModel($lot))->all();
    }

    /**
     * @return EloquentCollection<int, FinAccountLot>
     */
    private function databaseLotsForYear(int $userId, int $taxYear): EloquentCollection
    {
        $accountIds = FinAccounts::forOwner($userId)->pluck('acct_id');

        return $this->reportedLotQuery()
            ->whereIn('acct_id', $accountIds)
            ->whereBetween('sale_date', ["{$taxYear}-01-01", "{$taxYear}-12-31"])
            ->get();
    }

    /**
     * @return EloquentCollection<int, FinAccountLot>
     */
    private function databaseLotsForAccountDocument(int $userId, int $accountId, int $taxDocumentId, ?int $accountLinkId): EloquentCollection
    {
        $account = FinAccounts::forOwner($userId)->where('acct_id', $accountId)->first();
        if (! $account instanceof FinAccounts) {
            throw new NotFoundHttpException;
        }

        $document = FileForTaxDocument::query()
            ->where('id', $taxDocumentId)
            ->where('user_id', $userId)
            ->first();
        if (! $document instanceof FileForTaxDocument) {
            throw new NotFoundHttpException;
        }

        if ($accountLinkId !== null) {
            $link = TaxDocumentAccount::query()
                ->where('id', $accountLinkId)
                ->where('tax_document_id', $taxDocumentId)
                ->where('account_id', $accountId)
                ->where('form_type', '1099_b')
                ->first();
            if (! $link instanceof TaxDocumentAccount) {
                throw new NotFoundHttpException;
            }
        }

        return $this->reportedLotQuery()
            ->where('acct_id', $accountId)
            ->where('tax_document_id', $taxDocumentId)
            ->get();
    }

    /**
     * @return Builder<FinAccountLot>
     */
    private function reportedLotQuery(): Builder
    {
        return FinAccountLot::query()
            ->whereNotNull('sale_date')
            ->whereNotNull('proceeds')
            ->whereNull('superseded_by_lot_id')
            ->where(function (Builder $query): void {
                $query->whereIn('lot_source', ['1099b', '1099_b'])
                    ->orWhereNotNull('tax_document_id');
            })
            ->with(['account', 'taxDocument:id,original_filename,form_type,tax_year,parsed_data'])
            ->orderBy('acct_id')
            ->orderBy('sale_date')
            ->orderBy('symbol')
            ->orderBy('lot_id');
    }

    private function fromModel(FinAccountLot $lot): Form8949ExportLot
    {
        $isShortTerm = (bool) $lot->is_short_term;
        $form8949Box = $this->normalizeBox($lot->form_8949_box, $isShortTerm, $lot->is_covered);
        $proceeds = $this->floatValue($lot->proceeds);
        $costBasis = $this->floatValue($lot->cost_basis);
        $gain = $this->floatValue($lot->realized_gain_loss);
        $adjustment = round($proceeds - $costBasis - $gain, 2);
        $washSaleDisallowed = $lot->wash_sale_disallowed !== null ? $this->floatValue($lot->wash_sale_disallowed) : ($adjustment !== 0.0 ? $adjustment : null);
        $payerData = $this->payerData($lot);
        $account = $lot->account;
        $accountName = $account instanceof FinAccounts ? (string) $account->acct_name : null;

        return new Form8949ExportLot(
            description: $this->description($lot->description, $lot->symbol, $lot->quantity),
            dateAcquired: $lot->purchase_date->format('Y-m-d'),
            dateSold: $lot->sale_date?->format('Y-m-d') ?? '',
            proceeds: $proceeds,
            costBasis: $costBasis,
            adjustmentAmount: $adjustment,
            adjustmentCode: $adjustment !== 0.0 ? 'W' : null,
            isShortTerm: $isShortTerm,
            form8949Box: $form8949Box,
            quantity: $this->floatValue($lot->quantity),
            symbol: $lot->symbol,
            accountName: $accountName,
            payerName: $payerData['payer_name'] ?? $accountName,
            payerTin: $payerData['payer_tin'] ?? null,
            isCovered: $lot->is_covered,
            accruedMarketDiscount: $lot->accrued_market_discount !== null ? $this->floatValue($lot->accrued_market_discount) : null,
            washSaleDisallowed: $washSaleDisallowed,
        );
    }

    /**
     * @param  array<int, mixed>  $rows
     * @return Form8949ExportLot[]
     */
    private function analyzerLots(array $rows): array
    {
        $lots = [];
        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }

            $isShortTerm = $this->boolValue($row['isShortTerm'] ?? $row['is_short_term'] ?? null) ?? true;
            $proceeds = $this->floatValue($row['proceeds'] ?? 0);
            $costBasis = $this->floatValue($row['costBasis'] ?? $row['cost_basis'] ?? 0);
            $gain = $this->floatValue($row['gainOrLoss'] ?? $row['realized_gain_loss'] ?? ($proceeds - $costBasis));
            $adjustment = $this->floatValue($row['adjustmentAmount'] ?? ($proceeds - $costBasis - $gain));

            $lots[] = new Form8949ExportLot(
                description: $this->description(
                    isset($row['description']) ? (string) $row['description'] : null,
                    isset($row['symbol']) ? (string) $row['symbol'] : null,
                    $row['quantity'] ?? null,
                ),
                dateAcquired: $this->stringValue($row['dateAcquired'] ?? $row['purchase_date'] ?? null),
                dateSold: $this->stringValue($row['dateSold'] ?? $row['sale_date'] ?? null) ?? '',
                proceeds: $proceeds,
                costBasis: $costBasis,
                adjustmentAmount: $adjustment,
                adjustmentCode: $this->stringValue($row['adjustmentCode'] ?? null) ?? ($adjustment !== 0.0 ? 'W' : null),
                isShortTerm: $isShortTerm,
                form8949Box: $isShortTerm ? 'C' : 'F',
                quantity: isset($row['quantity']) ? $this->floatValue($row['quantity']) : null,
                symbol: $this->stringValue($row['symbol'] ?? null),
            );
        }

        return $lots;
    }

    private function normalizeBox(mixed $box, bool $isShortTerm, ?bool $isCovered): string
    {
        if (is_string($box)) {
            $normalized = strtoupper(trim($box));
            if (in_array($normalized, ['A', 'B', 'C', 'D', 'E', 'F'], true)) {
                return $normalized;
            }
        }

        if ($isCovered === false) {
            return $isShortTerm ? 'B' : 'E';
        }

        return $isShortTerm ? 'A' : 'D';
    }

    private function description(?string $description, ?string $symbol, mixed $quantity): string
    {
        $cleanDescription = trim((string) ($description ?? ''));
        if ($cleanDescription !== '') {
            return $cleanDescription;
        }

        $cleanSymbol = trim((string) ($symbol ?? ''));
        if ($cleanSymbol === '') {
            return '1099-B transaction';
        }

        $quantityValue = is_numeric($quantity) ? $this->floatValue($quantity) : null;
        if ($quantityValue !== null && $quantityValue > 0) {
            return rtrim(rtrim(number_format($quantityValue, 8, '.', ''), '0'), '.').' sh. '.$cleanSymbol;
        }

        return $cleanSymbol;
    }

    /**
     * @return array{payer_name?: string|null, payer_tin?: string|null}
     */
    private function payerData(FinAccountLot $lot): array
    {
        $document = $lot->taxDocument;
        if (! $document instanceof FileForTaxDocument || ! is_array($document->parsed_data)) {
            return [];
        }

        if (array_key_exists('payer_name', $document->parsed_data) || array_key_exists('payer_tin', $document->parsed_data)) {
            return [
                'payer_name' => $this->stringValue($document->parsed_data['payer_name'] ?? null),
                'payer_tin' => $this->stringValue($document->parsed_data['payer_tin'] ?? null),
            ];
        }

        foreach ($document->parsed_data as $entry) {
            if (! is_array($entry) || ($entry['form_type'] ?? null) !== '1099_b') {
                continue;
            }

            $parsedData = $entry['parsed_data'] ?? null;
            if (! is_array($parsedData)) {
                continue;
            }

            return [
                'payer_name' => $this->stringValue($parsedData['payer_name'] ?? null),
                'payer_tin' => $this->stringValue($parsedData['payer_tin'] ?? null),
            ];
        }

        return [];
    }

    private function floatValue(mixed $value): float
    {
        return is_numeric($value) ? (float) $value : 0.0;
    }

    private function boolValue(mixed $value): ?bool
    {
        if (is_bool($value)) {
            return $value;
        }
        if ($value === 1 || $value === '1' || $value === 'true') {
            return true;
        }
        if ($value === 0 || $value === '0' || $value === 'false') {
            return false;
        }

        return null;
    }

    private function stringValue(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed !== '' ? $trimmed : null;
    }
}
