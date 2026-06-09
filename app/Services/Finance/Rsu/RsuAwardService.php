<?php

namespace App\Services\Finance\Rsu;

use App\Models\FinanceTool\FinEquityAwards;
use App\Models\FinanceTool\FinRsuVestSettlement;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class RsuAwardService
{
    public const string PRICE_SOURCE_MANUAL = 'manual';

    public const string PRICE_SOURCE_IMPORTED = 'imported';

    public const string PRICE_SOURCE_QUOTE_CLOSE = 'quote_close';

    public const string PRICE_SOURCE_UNKNOWN = 'unknown';

    public function __construct(
        private readonly RsuSettlementService $settlementService,
    ) {}

    /**
     * @param  array<int, array<string, mixed>>  $grants
     * @return array<int, FinEquityAwards>
     */
    public function upsertMany(int $userId, array $grants, string $priceSource = self::PRICE_SOURCE_MANUAL): array
    {
        return DB::transaction(function () use ($userId, $grants, $priceSource): array {
            $awards = [];
            foreach ($grants as $grant) {
                $awards[] = $this->upsert($userId, $grant, $priceSource);
            }

            return $awards;
        });
    }

    /** @param array<string, mixed> $payload */
    public function upsert(int $userId, array $payload, string $priceSource = self::PRICE_SOURCE_MANUAL): FinEquityAwards
    {
        $data = $this->validated($payload);
        $identity = [
            'uid' => $userId,
            'award_id' => $data['award_id'],
            'grant_date' => $data['grant_date'],
            'vest_date' => $data['vest_date'],
            'symbol' => $data['symbol'],
        ];

        $award = isset($data['id'])
            ? FinEquityAwards::query()->where('uid', $userId)->findOrFail($data['id'])
            : FinEquityAwards::query()->firstOrNew($identity);

        $award->fill($identity + ['share_count' => $data['share_count']]);
        $this->applyNullablePrice($award, $data, 'grant_price', 'grant_price_source', 'grant_price_fetched_at', $priceSource);
        $this->applyNullablePrice($award, $data, 'vest_price', 'vest_price_source', 'vest_price_fetched_at', $priceSource);
        $award->save();

        return $award;
    }

    public function deleteForUser(int $userId, int $awardId): bool
    {
        return DB::transaction(function () use ($userId, $awardId): bool {
            $award = FinEquityAwards::query()
                ->where('uid', $userId)
                ->where('id', $awardId)
                ->first();

            if ($award === null) {
                return false;
            }

            $settlementIds = FinRsuVestSettlement::query()
                ->where('uid', $userId)
                ->whereDate('vest_date', $award->vest_date)
                ->where('symbol', $award->symbol)
                ->pluck('id')
                ->all();

            $deleted = $award->delete();

            foreach (array_unique($settlementIds) as $settlementId) {
                $this->settlementService->reconcileAfterAwardDeletion($userId, (int) $settlementId);
            }

            return $deleted;
        });
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function validated(array $payload): array
    {
        $payload['share_count'] = $this->numericValue($payload['share_count'] ?? null);
        $payload['grant_price'] = $this->priceValue($payload['grant_price'] ?? null);
        $payload['vest_price'] = $this->priceValue($payload['vest_price'] ?? null);
        $payload['symbol'] = strtoupper(trim((string) ($payload['symbol'] ?? '')));

        $validator = Validator::make($payload, [
            'id' => ['sometimes', 'integer'],
            'award_id' => ['required', 'string', 'max:64'],
            'grant_date' => ['required', 'date_format:Y-m-d'],
            'vest_date' => ['required', 'date_format:Y-m-d'],
            'share_count' => ['required', 'numeric', 'gt:0'],
            'symbol' => ['required', 'string', 'max:16', 'regex:/^[A-Z0-9.]+$/'],
            'grant_price' => ['nullable', 'numeric', 'gte:0'],
            'vest_price' => ['nullable', 'numeric', 'gte:0'],
            'clear_grant_price' => ['sometimes', 'boolean'],
            'clear_vest_price' => ['sometimes', 'boolean'],
            'grant_price_source' => ['sometimes', 'nullable', Rule::in($this->sourceValues())],
            'vest_price_source' => ['sometimes', 'nullable', Rule::in($this->sourceValues())],
        ]);

        $validated = $validator->validate();
        $validated['grant_date'] = Carbon::parse($validated['grant_date'])->format('Y-m-d');
        $validated['vest_date'] = Carbon::parse($validated['vest_date'])->format('Y-m-d');

        return $validated;
    }

    /** @param array<string, mixed> $data */
    private function applyNullablePrice(FinEquityAwards $award, array $data, string $priceColumn, string $sourceColumn, string $fetchedAtColumn, string $defaultSource): void
    {
        $clearKey = 'clear_'.$priceColumn;
        if (($data[$clearKey] ?? false) === true) {
            $award->{$priceColumn} = null;
            $award->{$sourceColumn} = null;
            $award->{$fetchedAtColumn} = null;

            return;
        }

        if (! array_key_exists($priceColumn, $data) || $data[$priceColumn] === null) {
            return;
        }

        $award->{$priceColumn} = $data[$priceColumn];
        $award->{$sourceColumn} = $data[$sourceColumn] ?? $defaultSource;
        $award->{$fetchedAtColumn} = null;
    }

    private function numericValue(mixed $value): mixed
    {
        if (is_array($value) && array_key_exists('value', $value)) {
            return $value['value'];
        }

        return $value;
    }

    private function priceValue(mixed $value): mixed
    {
        if ($value === '' || $value === false) {
            return null;
        }

        return $this->numericValue($value);
    }

    /** @return array<int, string> */
    private function sourceValues(): array
    {
        return [self::PRICE_SOURCE_MANUAL, self::PRICE_SOURCE_IMPORTED, self::PRICE_SOURCE_QUOTE_CLOSE, self::PRICE_SOURCE_UNKNOWN];
    }
}
