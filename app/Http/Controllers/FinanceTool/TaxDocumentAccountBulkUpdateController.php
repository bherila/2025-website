<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\BulkUpdateDocumentAccountsRequest;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class TaxDocumentAccountBulkUpdateController extends Controller
{
    public function store(BulkUpdateDocumentAccountsRequest $request, int $id): JsonResponse
    {
        $userId = (int) Auth::id();
        $document = FileForTaxDocument::query()
            ->where('user_id', $userId)
            ->findOrFail($id);

        /** @var list<array{link_id: int, account_id?: int|null, is_reviewed?: bool}> $updates */
        $updates = $request->validated('links');
        $linkIds = array_values(array_unique(array_map(
            static fn (array $update): int => (int) $update['link_id'],
            $updates
        )));

        /** @var Collection<int, TaxDocumentAccount> $links */
        $links = TaxDocumentAccount::query()
            ->where('document_id', $document->document_id)
            ->whereIn('id', $linkIds)
            ->get()
            ->keyBy('id');

        if ($links->count() !== count($linkIds)) {
            abort(404);
        }

        $accountIds = collect($updates)
            ->pluck('account_id')
            ->filter(static fn (mixed $accountId): bool => $accountId !== null)
            ->map(static fn (mixed $accountId): int => (int) $accountId)
            ->unique()
            ->values()
            ->all();

        if ($accountIds !== []) {
            $ownedAccountCount = FinAccounts::withoutGlobalScopes()
                ->where('acct_owner', $userId)
                ->whereIn('acct_id', $accountIds)
                ->count();

            if ($ownedAccountCount !== count($accountIds)) {
                abort(404);
            }
        }

        $affectedLinkIds = DB::transaction(function () use ($updates, $links): array {
            $affected = [];

            foreach ($updates as $update) {
                /** @var TaxDocumentAccount $link */
                $link = $links->get((int) $update['link_id']);

                if (array_key_exists('account_id', $update)) {
                    $link->account_id = $update['account_id'] !== null ? (int) $update['account_id'] : null;
                }

                if (array_key_exists('is_reviewed', $update)) {
                    $link->is_reviewed = (bool) $update['is_reviewed'];
                }

                $link->save();
                $affected[] = (int) $link->id;
            }

            return $affected;
        });

        /** @var Collection<int, TaxDocumentAccount> $freshLinks */
        $freshLinks = TaxDocumentAccount::query()
            ->whereIn('id', $affectedLinkIds)
            ->with('account:acct_id,acct_name,acct_number')
            ->orderBy('id')
            ->get();

        return response()->json([
            'affected_link_ids' => $affectedLinkIds,
            'links' => $freshLinks
                ->map(fn (TaxDocumentAccount $link): array => $this->linkPayload($link))
                ->values(),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function linkPayload(TaxDocumentAccount $link): array
    {
        $account = $link->relationLoaded('account') ? $link->account : null;

        return [
            'id' => (int) $link->id,
            'document_id' => (int) $link->document_id,
            'account_id' => $link->account_id !== null ? (int) $link->account_id : null,
            'form_type' => $link->form_type,
            'tax_year' => $link->tax_year,
            'ai_identifier' => $link->ai_identifier,
            'ai_account_name' => $link->ai_account_name,
            'is_reviewed' => (bool) $link->is_reviewed,
            'account' => $account instanceof FinAccounts ? [
                'acct_id' => (int) $account->acct_id,
                'acct_name' => (string) $account->acct_name,
                'acct_number' => $account->acct_number,
            ] : null,
        ];
    }
}
