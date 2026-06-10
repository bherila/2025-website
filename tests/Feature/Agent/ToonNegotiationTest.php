<?php

namespace Tests\Feature\Agent;

use App\Http\Middleware\NegotiatesAgentPayload;
use App\Support\Payload\AgentPayload;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class ToonNegotiationTest extends TestCase
{
    /** @var array<string, mixed> */
    private array $samplePayload = [
        'module' => 'finance',
        'limit' => 100,
        'include_closed' => false,
        'tags' => ['groceries', 'travel'],
        'rows' => [
            ['id' => 1, 'name' => 'Checking'],
            ['id' => 2, 'name' => 'Brokerage'],
        ],
    ];

    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware(NegotiatesAgentPayload::class)->post('/_test/agent/echo', function (Request $request) {
            return response()->json($request->except('format'));
        });

        Route::middleware(NegotiatesAgentPayload::class)->get('/_test/agent/not-found', function () {
            return response()->json(['message' => 'Not found.'], 404);
        });
    }

    public function test_json_request_returns_json_by_default(): void
    {
        $this->postJson('/_test/agent/echo', $this->samplePayload)
            ->assertStatus(200)
            ->assertHeader('Content-Type', 'application/json')
            ->assertExactJson($this->samplePayload);
    }

    public function test_toon_request_body_is_decoded_into_request_input(): void
    {
        $response = $this->call(
            'POST',
            '/_test/agent/echo',
            server: ['CONTENT_TYPE' => 'text/toon', 'HTTP_ACCEPT' => 'application/json'],
            content: AgentPayload::encode($this->samplePayload),
        );

        $response->assertStatus(200)->assertExactJson($this->samplePayload);
    }

    public function test_same_payload_via_toon_and_json_validates_identically(): void
    {
        $jsonResponse = $this->postJson('/_test/agent/echo', $this->samplePayload);
        $toonResponse = $this->call(
            'POST',
            '/_test/agent/echo',
            server: ['CONTENT_TYPE' => 'text/toon', 'HTTP_ACCEPT' => 'application/json'],
            content: AgentPayload::encode($this->samplePayload),
        );

        $this->assertSame($jsonResponse->json(), $toonResponse->json());
    }

    public function test_invalid_toon_body_returns_422(): void
    {
        $response = $this->call(
            'POST',
            '/_test/agent/echo',
            server: ['CONTENT_TYPE' => 'text/toon', 'HTTP_ACCEPT' => 'application/json'],
            content: 'name: "unterminated',
        );

        $response->assertStatus(422)->assertJsonStructure(['message', 'error']);
        $this->assertSame('Invalid TOON payload', $response->json('message'));
    }

    public function test_unsupported_content_type_with_body_returns_415(): void
    {
        $response = $this->call(
            'POST',
            '/_test/agent/echo',
            server: ['CONTENT_TYPE' => 'text/csv', 'HTTP_ACCEPT' => 'application/json'],
            content: "id,name\n1,Checking",
        );

        $response->assertStatus(415);
    }

    public function test_accept_toon_encodes_response_and_round_trips(): void
    {
        $response = $this->call(
            'POST',
            '/_test/agent/echo',
            server: ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'text/toon'],
            content: json_encode($this->samplePayload),
        );

        $response->assertStatus(200)->assertHeader('Content-Type', 'text/toon; charset=utf-8');
        $this->assertSame($this->samplePayload, AgentPayload::decode($response->getContent()));
    }

    public function test_format_toon_query_param_forces_toon_output(): void
    {
        $response = $this->postJson('/_test/agent/echo?format=toon', $this->samplePayload);

        $response->assertStatus(200)->assertHeader('Content-Type', 'text/toon; charset=utf-8');
        $this->assertSame($this->samplePayload, AgentPayload::decode($response->getContent()));
    }

    public function test_format_json_query_param_overrides_accept_toon(): void
    {
        $response = $this->call(
            'POST',
            '/_test/agent/echo?format=json',
            server: ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'text/toon'],
            content: json_encode($this->samplePayload),
        );

        $response->assertStatus(200)
            ->assertHeader('Content-Type', 'application/json')
            ->assertExactJson($this->samplePayload);
    }

    public function test_toon_output_preserves_error_status_code(): void
    {
        $response = $this->get('/_test/agent/not-found?format=toon');

        $response->assertStatus(404)->assertHeader('Content-Type', 'text/toon; charset=utf-8');
        $this->assertSame(['message' => 'Not found.'], AgentPayload::decode($response->getContent()));
    }

    public function test_registered_agent_route_group_applies_negotiation(): void
    {
        $this->getJson('/api/agent/v1/ping')
            ->assertStatus(200)
            ->assertExactJson(['ok' => true]);

        $toonResponse = $this->get('/api/agent/v1/ping?format=toon');
        $toonResponse->assertStatus(200)->assertHeader('Content-Type', 'text/toon; charset=utf-8');
        $this->assertSame(['ok' => true], AgentPayload::decode($toonResponse->getContent()));

        // The agent group must be stateless: no session cookie is started.
        $this->assertEmpty($toonResponse->headers->getCookies());
    }
}
