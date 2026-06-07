<?php

namespace App\Http\Controllers\Toon;

use App\Http\Controllers\Controller;
use App\Http\Requests\Toon\StoreToonDocumentRequest;
use App\Http\Requests\Toon\UpdateToonDocumentRequest;
use App\Models\ToonDocument;
use App\Support\ShortCode;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class ToonConverterController extends Controller
{
    public function show(): View
    {
        return view('tools.toon-json', [
            'initialData' => [
                'document' => null,
                'toon' => '',
                'title' => null,
                'canEdit' => false,
                'authenticated' => Auth::check(),
            ],
        ]);
    }

    public function showByCode(string $code): View
    {
        $document = ToonDocument::query()
            ->where('short_code', $code)
            ->firstOrFail();

        return view('tools.toon-json', [
            'initialData' => [
                'document' => [
                    'id' => $document->id,
                    'shortCode' => $document->short_code,
                    'title' => $document->title,
                    'shareUrl' => url("/tools/toon-json/s/{$document->short_code}"),
                    'ownerUserId' => $document->user_id,
                ],
                'toon' => (string) $document->toon_content,
                'title' => $document->title,
                'canEdit' => Auth::id() !== null && (int) Auth::id() === (int) $document->user_id,
                'authenticated' => Auth::check(),
            ],
        ]);
    }

    public function store(StoreToonDocumentRequest $request): JsonResponse
    {
        $shortCode = ShortCode::generate(
            fn (string $code): bool => ToonDocument::query()->where('short_code', $code)->exists(),
        );

        $document = ToonDocument::query()->create([
            'user_id' => Auth::id(),
            'short_code' => $shortCode,
            'title' => $request->validated('title'),
            'toon_content' => $request->validated('toon_content'),
        ]);

        return response()->json([
            'id' => $document->id,
            'shortCode' => $document->short_code,
            'shareUrl' => url("/tools/toon-json/s/{$document->short_code}"),
            'title' => $document->title,
        ], 201);
    }

    public function update(UpdateToonDocumentRequest $request, string $code): JsonResponse
    {
        $document = ToonDocument::query()
            ->where('short_code', $code)
            ->firstOrFail();

        abort_unless(Auth::id() !== null && (int) Auth::id() === (int) $document->user_id, 403);

        $document->update([
            'title' => $request->validated('title'),
            'toon_content' => $request->validated('toon_content'),
        ]);

        return response()->json([
            'id' => $document->id,
            'shortCode' => $document->short_code,
            'shareUrl' => url("/tools/toon-json/s/{$document->short_code}"),
            'title' => $document->title,
        ]);
    }
}
