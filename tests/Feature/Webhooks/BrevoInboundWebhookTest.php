<?php

namespace Tests\Feature\Webhooks;

use App\Jobs\ProcessInboundEmail;
use App\Models\InboundEmail;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class BrevoInboundWebhookTest extends TestCase
{
    use RefreshDatabase;

    private string $secret = 'test-inbound-secret';

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.brevo.inbound_secret' => $this->secret]);
    }

    /**
     * @return array<string, mixed>
     */
    private function samplePayload(): array
    {
        return [
            'items' => [
                [
                    'MessageId' => '<abc123@app.bherila.net>',
                    'From' => ['Name' => 'Jane Doe', 'Address' => 'jane@example.com'],
                    'To' => [['Name' => 'Inbound', 'Address' => 'inbound@app.bherila.net']],
                    'Subject' => 'Monthly statement',
                    'RawTextBody' => 'Please find my statement attached.',
                    'RawHtmlBody' => '<p>Please find my statement attached.</p>',
                    'Headers' => ['Subject' => 'Monthly statement'],
                    'Attachments' => [['Name' => 'statement.pdf', 'ContentType' => 'application/pdf']],
                    'SentAtDate' => '2026-05-31T12:00:00Z',
                ],
            ],
        ];
    }

    public function test_valid_secret_persists_email_and_queues_job(): void
    {
        Queue::fake();

        $response = $this->postJson('/api/webhooks/brevo/inbound?secret='.$this->secret, $this->samplePayload());

        $response->assertOk()
            ->assertJson(['received' => true, 'count' => 1]);

        $this->assertDatabaseHas('inbound_emails', [
            'message_id' => '<abc123@app.bherila.net>',
            'from_email' => 'jane@example.com',
            'from_name' => 'Jane Doe',
            'to_email' => 'inbound@app.bherila.net',
            'subject' => 'Monthly statement',
            'status' => 'received',
        ]);

        $email = InboundEmail::firstOrFail();
        $this->assertSame('application/pdf', $email->attachments[0]['ContentType']);
        $this->assertNotNull($email->received_at);

        Queue::assertPushed(ProcessInboundEmail::class, 1);
    }

    public function test_duplicate_message_id_reuses_email_and_does_not_queue_again(): void
    {
        Queue::fake();

        $this->postJson('/api/webhooks/brevo/inbound?secret='.$this->secret, $this->samplePayload())
            ->assertOk();
        $this->postJson('/api/webhooks/brevo/inbound?secret='.$this->secret, $this->samplePayload())
            ->assertOk();

        $this->assertDatabaseCount('inbound_emails', 1);
        Queue::assertPushed(ProcessInboundEmail::class, 1);
    }

    public function test_duplicate_uuid_array_reuses_email_when_message_id_is_absent(): void
    {
        Queue::fake();

        $payload = $this->samplePayload();
        unset($payload['items'][0]['MessageId']);
        $payload['items'][0]['Uuid'] = ['brevo-uuid-123'];

        $this->postJson('/api/webhooks/brevo/inbound?secret='.$this->secret, $payload)
            ->assertOk();
        $this->postJson('/api/webhooks/brevo/inbound?secret='.$this->secret, $payload)
            ->assertOk();

        $this->assertDatabaseCount('inbound_emails', 1);
        Queue::assertPushed(ProcessInboundEmail::class, 1);
    }

    public function test_long_header_values_are_persisted(): void
    {
        Queue::fake();

        $payload = $this->samplePayload();
        $payload['items'][0]['MessageId'] = '<'.str_repeat('m', 300).'@app.bherila.net>';
        $payload['items'][0]['From']['Name'] = str_repeat('LongSender', 40);
        $payload['items'][0]['From']['Address'] = str_repeat('long-local-part-', 20).'@example.com';
        $payload['items'][0]['Subject'] = str_repeat('MonthlyStatement', 30);

        $this->postJson('/api/webhooks/brevo/inbound?secret='.$this->secret, $payload)
            ->assertOk();

        $email = InboundEmail::firstOrFail();
        $this->assertSame($payload['items'][0]['MessageId'], $email->message_id);
        $this->assertSame($payload['items'][0]['From']['Name'], $email->from_name);
        $this->assertSame($payload['items'][0]['From']['Address'], $email->from_email);
        $this->assertSame($payload['items'][0]['Subject'], $email->subject);
    }

    public function test_missing_secret_is_forbidden(): void
    {
        $this->postJson('/api/webhooks/brevo/inbound', $this->samplePayload())
            ->assertForbidden();

        $this->assertDatabaseCount('inbound_emails', 0);
    }

    public function test_wrong_secret_is_forbidden(): void
    {
        $this->postJson('/api/webhooks/brevo/inbound?secret=nope', $this->samplePayload())
            ->assertForbidden();

        $this->assertDatabaseCount('inbound_emails', 0);
    }

    public function test_valid_secret_with_empty_items_is_rejected(): void
    {
        $this->postJson('/api/webhooks/brevo/inbound?secret='.$this->secret, ['items' => []])
            ->assertStatus(422);
    }

    public function test_processing_job_marks_email_processed(): void
    {
        $email = InboundEmail::factory()->create(['status' => 'received']);

        (new ProcessInboundEmail($email))->handle();

        $this->assertSame('processed', $email->fresh()->status);
    }

    public function test_received_at_serializes_as_local_datetime(): void
    {
        $email = InboundEmail::factory()->create([
            'received_at' => CarbonImmutable::parse('2026-05-31 12:00:00', 'UTC'),
        ]);

        $this->assertSame('2026-05-31 12:00:00', $email->toArray()['received_at']);
    }
}
