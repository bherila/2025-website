<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreClassActionClaimRequest;
use App\Http\Requests\UpdateClassActionClaimRequest;
use App\Http\Resources\ClassActionClaimResource;
use App\Models\ClassActionClaim;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ClassActionClaimController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ClassActionClaim::query()
            ->with(['paymentTransaction.account'])
            ->orderByDesc('notification_received_on')
            ->orderByDesc('id');

        if ($request->filled('q')) {
            $search = trim((string) $request->query('q'));
            $query->where(function (Builder $query) use ($search): void {
                $query
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('claim_id', 'like', "%{$search}%")
                    ->orWhere('administrator', 'like', "%{$search}%")
                    ->orWhere('notes', 'like', "%{$search}%")
                    ->orWhere('notification_email_copy', 'like', "%{$search}%");
            });
        }

        if ($request->filled('payment_received')) {
            $query->where('payment_received', $request->boolean('payment_received'));
        }

        return response()->json(ClassActionClaimResource::collection($query->get())->resolve($request));
    }

    public function store(StoreClassActionClaimRequest $request): JsonResponse
    {
        $claim = ClassActionClaim::query()->create($this->normalizedPayload($request->validated(), $request->boolean('payment_received')));
        $claim->load('paymentTransaction.account');

        return response()->json((new ClassActionClaimResource($claim))->resolve($request), 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $claim = ClassActionClaim::query()
            ->with(['paymentTransaction.account'])
            ->findOrFail($id);

        return response()->json((new ClassActionClaimResource($claim))->resolve($request));
    }

    public function update(UpdateClassActionClaimRequest $request, int $id): JsonResponse
    {
        $claim = ClassActionClaim::query()
            ->with(['paymentTransaction.account'])
            ->findOrFail($id);

        $payload = $request->validated();
        if (array_key_exists('payment_received', $payload)) {
            $payload = $this->normalizedPayload($payload, $request->boolean('payment_received'));
        }

        $claim->update($payload);
        $claim->load('paymentTransaction.account');

        return response()->json((new ClassActionClaimResource($claim))->resolve($request));
    }

    public function destroy(int $id): JsonResponse
    {
        ClassActionClaim::query()->findOrFail($id)->delete();

        return response()->json(['ok' => true]);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function normalizedPayload(array $payload, bool $paymentReceived): array
    {
        $payload['payment_received'] = $paymentReceived;

        if (! $paymentReceived) {
            $payload['payment_received_on'] = null;
            $payload['payment_fin_transaction_id'] = null;
        }

        return $payload;
    }
}
