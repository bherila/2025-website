<?php

namespace App\Http\Controllers\Webhooks;

use App\Http\Controllers\Controller;
use App\Http\Requests\Webhooks\BrevoInboundRequest;
use App\Jobs\ProcessInboundEmail;
use App\Models\InboundEmail;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;

class BrevoInboundController extends Controller
{
    /**
     * Receive a Brevo Inbound Parsing webhook. Each message in the payload is
     * persisted as an InboundEmail and handed to a queued job for downstream
     * processing (statement import, GenAI analysis, receipt/class-action capture).
     */
    public function handle(BrevoInboundRequest $request): JsonResponse
    {
        // Validation (BrevoInboundRequest) guarantees a non-empty items array with
        // a From.Address; read the full input since payloads carry keys beyond the rules.
        $ids = [];

        /** @var array<int, array<string, mixed>> $items */
        $items = $request->input('items');

        foreach ($items as $item) {
            $idempotencyKey = $this->idempotencyKey($item);
            $values = [
                'message_id' => $item['MessageId'] ?? null,
                'from_email' => data_get($item, 'From.Address'),
                'from_name' => data_get($item, 'From.Name'),
                'to_email' => data_get($item, 'To.0.Address'),
                'subject' => $item['Subject'] ?? null,
                'text_body' => $item['RawTextBody'] ?? ($item['ExtractedMarkdownMessage'] ?? null),
                'html_body' => $item['RawHtmlBody'] ?? null,
                'headers' => $item['Headers'] ?? null,
                'attachments' => $item['Attachments'] ?? [],
                'raw_payload' => $item,
                'status' => 'received',
                'received_at' => $this->parseDate($item['SentAtDate'] ?? null),
            ];

            $email = $idempotencyKey === null
                ? InboundEmail::create($values)
                : InboundEmail::firstOrCreate(['idempotency_key' => $idempotencyKey], $values);

            if ($email->wasRecentlyCreated) {
                ProcessInboundEmail::dispatch($email);
            }

            $ids[] = $email->id;
        }

        return response()->json([
            'received' => true,
            'count' => count($ids),
            'ids' => $ids,
        ]);
    }

    /**
     * Brevo retries failed webhook deliveries. Use stable provider identifiers
     * when present so the same delivery does not create duplicate rows/jobs.
     *
     * @param  array<string, mixed>  $item
     */
    private function idempotencyKey(array $item): ?string
    {
        foreach (['MessageId', 'Uuid'] as $field) {
            $value = $this->firstStringValue($item[$field] ?? null);
            if ($value !== null) {
                return hash('sha256', $field.':'.$value);
            }
        }

        return null;
    }

    private function firstStringValue(mixed $value): ?string
    {
        if (is_string($value)) {
            $value = trim($value);

            return $value === '' ? null : $value;
        }

        if (is_array($value)) {
            foreach ($value as $item) {
                $normalized = $this->firstStringValue($item);
                if ($normalized !== null) {
                    return $normalized;
                }
            }
        }

        return null;
    }

    private function parseDate(?string $value): ?CarbonImmutable
    {
        if (empty($value)) {
            return null;
        }

        try {
            return CarbonImmutable::parse($value);
        } catch (\Throwable) {
            return null;
        }
    }
}
