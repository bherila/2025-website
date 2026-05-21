<?php

namespace App\Http\Controllers\MD;

use App\Http\Controllers\Controller;
use App\Http\Requests\MD\StoreMarkdownDocumentRequest;
use App\Http\Requests\MD\UpdateMarkdownDocumentRequest;
use App\Models\MarkdownDocument;
use App\Support\ShortCode;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class MarkdownRendererController extends Controller
{
    public function show(): View
    {
        return view('tools.markdown', [
            'initialData' => [
                'document' => null,
                'markdown' => '',
                'title' => null,
                'canEdit' => false,
                'authenticated' => Auth::check(),
            ],
        ]);
    }

    public function showByCode(string $code): View
    {
        $document = MarkdownDocument::query()
            ->where('short_code', $code)
            ->firstOrFail();

        return view('tools.markdown', [
            'initialData' => [
                'document' => [
                    'id' => $document->id,
                    'shortCode' => $document->short_code,
                    'title' => $document->title,
                    'shareUrl' => url("/tools/markdown/s/{$document->short_code}"),
                    'ownerUserId' => $document->user_id,
                ],
                'markdown' => (string) $document->markdown_content,
                'title' => $document->title,
                'canEdit' => Auth::id() !== null && (int) Auth::id() === (int) $document->user_id,
                'authenticated' => Auth::check(),
            ],
        ]);
    }

    public function store(StoreMarkdownDocumentRequest $request): JsonResponse
    {
        $shortCode = ShortCode::generate(
            fn (string $code): bool => MarkdownDocument::query()->where('short_code', $code)->exists(),
        );

        $document = MarkdownDocument::query()->create([
            'user_id' => Auth::id(),
            'short_code' => $shortCode,
            'title' => $request->validated('title'),
            'markdown_content' => $request->validated('markdown_content'),
        ]);

        return response()->json([
            'id' => $document->id,
            'shortCode' => $document->short_code,
            'shareUrl' => url("/tools/markdown/s/{$document->short_code}"),
            'title' => $document->title,
        ], 201);
    }

    public function update(UpdateMarkdownDocumentRequest $request, string $code): JsonResponse
    {
        $document = MarkdownDocument::query()
            ->where('short_code', $code)
            ->firstOrFail();

        abort_unless(Auth::id() !== null && (int) Auth::id() === (int) $document->user_id, 403);

        $document->update([
            'title' => $request->validated('title'),
            'markdown_content' => $request->validated('markdown_content'),
        ]);

        return response()->json([
            'id' => $document->id,
            'shortCode' => $document->short_code,
            'shareUrl' => url("/tools/markdown/s/{$document->short_code}"),
            'title' => $document->title,
        ]);
    }
}
