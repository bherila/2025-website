<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\AccountSuggestRequest;
use App\Models\FinanceTool\FinDocumentAccount;
use App\Services\Finance\AccountSuggestionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class AccountSuggestController extends Controller
{
    public function __construct(
        private readonly AccountSuggestionService $accountSuggestionService,
    ) {}

    public function index(AccountSuggestRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $documentId = (int) $validated['document_id'];
        $linkId = (int) $validated['link_id'];
        $userId = (int) Auth::id();

        $link = FinDocumentAccount::query()
            ->with(['document', 'taxDocument'])
            ->whereKey($linkId)
            ->where('document_id', $documentId)
            ->whereHas('document', fn ($query) => $query->where('user_id', $userId))
            ->firstOrFail();

        return response()->json($this->accountSuggestionService->suggestionsForLink(
            $link,
            $userId,
            $request->boolean('include_closed')
        ));
    }
}
