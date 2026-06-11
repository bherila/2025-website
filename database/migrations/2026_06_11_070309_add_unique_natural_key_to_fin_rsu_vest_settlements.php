<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->dedupeSettlements();

        Schema::table('fin_rsu_vest_settlements', function (Blueprint $table): void {
            $table->unique(['uid', 'vest_date', 'symbol'], 'frvs_uid_date_sym_uq');
        });
    }

    public function down(): void
    {
        Schema::table('fin_rsu_vest_settlements', function (Blueprint $table): void {
            $table->dropUnique('frvs_uid_date_sym_uq');
        });
    }

    private function dedupeSettlements(): void
    {
        DB::table('fin_rsu_vest_settlements')
            ->select('uid', 'vest_date', 'symbol')
            ->groupBy('uid', 'vest_date', 'symbol')
            ->havingRaw('COUNT(*) > 1')
            ->orderBy('uid')
            ->orderBy('vest_date')
            ->orderBy('symbol')
            ->get()
            ->each(function (object $group): void {
                $rows = DB::table('fin_rsu_vest_settlements')
                    ->where('uid', $group->uid)
                    ->where('vest_date', $group->vest_date)
                    ->where('symbol', $group->symbol)
                    ->orderBy('id')
                    ->get();

                $keeper = $this->keeper($rows);
                $loserIds = $rows
                    ->pluck('id')
                    ->map(static fn (mixed $id): int => (int) $id)
                    ->reject(static fn (int $id): bool => $id === $keeper->id)
                    ->values();

                foreach ($loserIds as $loserId) {
                    $this->moveAllocations($loserId, $keeper->id);
                    DB::table('fin_rsu_links')
                        ->where('settlement_id', $loserId)
                        ->update(['settlement_id' => $keeper->id]);
                }

                DB::table('fin_rsu_vest_settlements')->whereIn('id', $loserIds)->delete();
            });
    }

    /** @param Collection<int, object> $rows */
    private function keeper(Collection $rows): object
    {
        $keeper = $rows
            ->sortByDesc(fn (object $row): array => [
                $this->statusPriority((string) $row->status),
                $this->childCount((int) $row->id),
                strtotime((string) ($row->updated_at ?? $row->created_at ?? '1970-01-01')),
                -((int) $row->id),
            ])
            ->first();

        if ($keeper === null) {
            throw new RuntimeException('Unable to choose an RSU settlement dedupe keeper.');
        }

        return $keeper;
    }

    private function statusPriority(string $status): int
    {
        return match ($status) {
            'reconciled' => 5,
            'partially_reconciled' => 4,
            'confirmed' => 3,
            'ignored' => 2,
            default => 1,
        };
    }

    private function childCount(int $settlementId): int
    {
        return DB::table('fin_rsu_vest_settlement_allocations')->where('settlement_id', $settlementId)->count()
            + DB::table('fin_rsu_links')->where('settlement_id', $settlementId)->count();
    }

    private function moveAllocations(int $fromSettlementId, int $toSettlementId): void
    {
        DB::table('fin_rsu_vest_settlement_allocations')
            ->where('settlement_id', $fromSettlementId)
            ->orderBy('id')
            ->get()
            ->each(function (object $allocation) use ($toSettlementId): void {
                $existingAllocationId = DB::table('fin_rsu_vest_settlement_allocations')
                    ->where('settlement_id', $toSettlementId)
                    ->where('equity_award_id', $allocation->equity_award_id)
                    ->value('id');

                if ($existingAllocationId !== null) {
                    DB::table('fin_rsu_links')
                        ->where('settlement_allocation_id', $allocation->id)
                        ->update([
                            'settlement_id' => $toSettlementId,
                            'settlement_allocation_id' => $existingAllocationId,
                        ]);

                    DB::table('fin_rsu_vest_settlement_allocations')->where('id', $allocation->id)->delete();

                    return;
                }

                DB::table('fin_rsu_vest_settlement_allocations')
                    ->where('id', $allocation->id)
                    ->update(['settlement_id' => $toSettlementId]);
            });
    }
};
