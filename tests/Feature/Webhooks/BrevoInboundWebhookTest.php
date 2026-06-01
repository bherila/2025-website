<?php

namespace Tests\Feature\Webhooks;

use App\Jobs\ProcessInboundEmail;
use App\Models\InboundEmail;
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
}
