<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Services\Finance\CapitalGains\LotReconciliationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;

class TaxDocumentLotReconciliationController extends Controller
{
    public function __construct(
        private readonly LotReconciliationService $lotReconciliationService,
    ) {}

    public function show(int $id): JsonResponse
    {
        $taxDocument = FileForTaxDocument::query()
            ->where('user_id', (int) Auth::id())
            ->findOrFail($id);

        return response()->json($this->lotReconciliationService->reconcileTaxDocument((int) $taxDocument->id));
    }

    public function links(int $id): JsonResponse
    {
        $taxDocument = FileForTaxDocument::query()
            ->with(['accountLinks.account'])
            ->where('user_id', (int) Auth::id())
            ->findOrFail($id);

        /** @var Collection<int, FinLotReconciliationLink> $links */
        $links = FinLotReconciliationLink::query()
            ->where('tax_document_id', $taxDocument->id)
            ->with(['brokerLot.account', 'accountLot.account'])
            ->orderBy('id')
            ->get();

        return response()->json([
            'document' => [
                'id' => (int) $taxDocument->id,
                'broker' => $this->documentBrokerName($taxDocument),
                'tax_year' => (int) $taxDocument->tax_year,
                'form_type' => (string) $taxDocument->form_type,
                'original_filename' => $taxDocument->original_filename,
            ],
            'summary' => [
                'total' => $links->count(),
                'link_state_counts' => $this->linkStateCounts($links),
            ],
            'links' => $links
                ->map(fn (FinLotReconciliationLink $link): array => $this->linkPayload($link))
                ->values(),
            'relink_candidates' => $this->relinkCandidates($taxDocument, $links)
                ->map(fn (FinAccountLot $lot): array => $this->lotPayload($lot))
                ->values(),
        ]);
    }

    public function year(int $year): JsonResponse
    {
        if ($year < 1900 || $year > 2100) {
            return response()->json([
                'message' => 'The selected year is invalid.',
                'errors' => [
                    'year' => ['The year must be between 1900 and 2100.'],
                ],
            ], 422);
        }

        return response()->json($this->lotReconciliationService->reconcileYear((int) Auth::id(), $year));
    }

    /**
     * @param  Collection<int, FinLotReconciliationLink>  $links
     * @return array<string, int>
     */
    private function linkStateCounts(Collection $links): array
    {
        $counts = array_fill_keys(FinLotReconciliationLink::STATES, 0);

        foreach ($links as $link) {
            $counts[(string) $link->state] = ($counts[(string) $link->state] ?? 0) + 1;
        }

        return $counts;
    }

    /**
     * @return array<string, mixed>
     */
    private function linkPayload(FinLotReconciliationLink $link): array
    {
        $brokerLot = $link->relationLoaded('brokerLot') ? $link->getRelation('brokerLot') : null;
        $accountLot = $link->relationLoaded('accountLot') ? $link->getRelation('accountLot') : null;

        return [
            'id' => (int) $link->id,
            'tax_document_id' => $link->tax_document_id !== null ? (int) $link->tax_document_id : null,
            'broker_lot_id' => $link->broker_lot_id !== null ? (int) $link->broker_lot_id : null,
            'account_lot_id' => $link->account_lot_id !== null ? (int) $link->account_lot_id : null,
            'state' => (string) $link->state,
            'match_reason' => $link->match_reason,
            'accepted_by_user_id' => $link->accepted_by_user_id !== null ? (int) $link->accepted_by_user_id : null,
            'accepted_at' => $link->accepted_at,
            'broker_lot' => $brokerLot instanceof FinAccountLot ? $this->lotPayload($brokerLot) : null,
            'account_lot' => $accountLot instanceof FinAccountLot ? $this->lotPayload($accountLot) : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function lotPayload(FinAccountLot $lot): array
    {
        $account = $lot->relationLoaded('account') ? $lot->getRelation('account') : null;

        return [
            'lot_id' => (int) $lot->lot_id,
            'acct_id' => (int) $lot->acct_id,
            'account_name' => $account instanceof FinAccounts ? $account->acct_name : null,
            'symbol' => $lot->symbol,
            'description' => $lot->description,
            'cusip' => $lot->cusip,
            'quantity' => $this->nullableFloat($lot->quantity),
            'purchase_date' => $lot->purchase_date,
            'sale_date' => $lot->sale_date,
            'proceeds' => $this->nullableFloat($lot->proceeds),
            'cost_basis' => $this->nullableFloat($lot->cost_basis),
            'wash_sale_disallowed' => $this->nullableFloat($lot->wash_sale_disallowed),
            'realized_gain_loss' => $this->nullableFloat($lot->realized_gain_loss),
            'is_short_term' => $lot->is_short_term,
            'form_8949_box' => $lot->form_8949_box,
            'is_covered' => $lot->is_covered,
            'source' => $lot->source,
            'lot_source' => $lot->lot_source,
            'reconciliation_status' => $lot->reconciliation_status,
            'superseded_by_lot_id' => $lot->superseded_by_lot_id !== null ? (int) $lot->superseded_by_lot_id : null,
        ];
    }

    /**
     * @param  Collection<int, FinLotReconciliationLink>  $links
     * @return Collection<int, FinAccountLot>
     */
    private function relinkCandidates(FileForTaxDocument $taxDocument, Collection $links): Collection
    {
        $accountIds = $links
            ->flatMap(function (FinLotReconciliationLink $link): array {
                return array_filter([
                    $link->brokerLot instanceof FinAccountLot ? (int) $link->brokerLot->acct_id : null,
                    $link->accountLot instanceof FinAccountLot ? (int) $link->accountLot->acct_id : null,
                ]);
            })
            ->merge($taxDocument->accountLinks->pluck('account_id')->filter())
            ->map(static fn (int|string $accountId): int => (int) $accountId)
            ->unique()
            ->values()
            ->all();

        if ($accountIds === []) {
            return collect();
        }

        $start = (new \DateTimeImmutable("{$taxDocument->tax_year}-01-01"))->modify('-5 days')->format('Y-m-d');
        $end = (new \DateTimeImmutable("{$taxDocument->tax_year}-12-31"))->modify('+5 days')->format('Y-m-d');

        return FinAccountLot::query()
            ->whereIn('acct_id', $accountIds)
            ->whereNull('tax_document_id')
            ->whereBetween('sale_date', [$start, $end])
            ->where(function ($query): void {
                $query->whereNull('source')
                    ->orWhereNotIn('source', [
                        FinAccountLot::SOURCE_BROKER_1099B,
                        FinAccountLot::SOURCE_SYNTHETIC_ADJUSTMENT,
                    ]);
            })
            ->with('account')
            ->orderBy('acct_id')
            ->orderBy('symbol')
            ->orderBy('sale_date')
            ->orderBy('lot_id')
            ->get();
    }

    private function documentBrokerName(FileForTaxDocument $taxDocument): string
    {
        $parsedData = $taxDocument->parsed_data;
        $entries = is_array($parsedData) && array_is_list($parsedData) ? $parsedData : [$parsedData];

        foreach ($entries as $entry) {
            if (! is_array($entry)) {
                continue;
            }

            $payload = is_array($entry['parsed_data'] ?? null) ? $entry['parsed_data'] : $entry;
            $payerName = $payload['payer_name'] ?? null;
            if (is_string($payerName) && trim($payerName) !== '') {
                return trim($payerName);
            }

            $accountName = $entry['account_name'] ?? null;
            if (is_string($accountName) && trim($accountName) !== '') {
                return trim($accountName);
            }
        }

        return $taxDocument->original_filename;
    }

    private function nullableFloat(mixed $value): ?float
    {
        return is_numeric($value) ? (float) $value : null;
    }
}
