<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Services\Billing\StripeBillingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Stripe\Exception\SignatureVerificationException;
use UnexpectedValueException;

class StripeWebhookController extends Controller
{
    public function __invoke(Request $request, StripeBillingService $billing): JsonResponse
    {
        try {
            $event = $billing->constructWebhookEvent(
                $request->getContent(),
                $request->header('Stripe-Signature'),
            );

            $record = $billing->processWebhookEvent($event);
        } catch (SignatureVerificationException|UnexpectedValueException $exception) {
            return response()->json([
                'error' => $exception->getMessage(),
            ], 400);
        } catch (\Throwable $throwable) {
            report($throwable);

            return response()->json([
                'error' => 'Stripe webhook processing failed.',
            ], 500);
        }

        return response()->json([
            'received' => true,
            'event_id' => $record->stripe_event_id,
            'processed_at' => $record->processed_at?->toIso8601String(),
        ]);
    }
}
