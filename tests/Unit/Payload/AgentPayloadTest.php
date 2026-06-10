<?php

namespace Tests\Unit\Payload;

use App\Support\Payload\AgentPayload;
use HelgeSverre\Toon\Exceptions\DecodeException;
use Illuminate\Http\Request;
use PHPUnit\Framework\TestCase;

class AgentPayloadTest extends TestCase
{
    public function test_encode_decode_round_trip_preserves_structure(): void
    {
        $data = [
            'module' => 'finance',
            'count' => 3,
            'ratio' => 0.25,
            'enabled' => true,
            'note' => null,
            'tags' => ['alpha', 'beta'],
            'rows' => [
                ['id' => 1, 'name' => 'Checking', 'closed' => false],
                ['id' => 2, 'name' => 'Brokerage', 'closed' => true],
            ],
            'nested' => ['inner' => ['deep' => 'value']],
        ];

        $this->assertSame($data, AgentPayload::decode(AgentPayload::encode($data)));
    }

    public function test_decode_invalid_toon_throws_decode_exception(): void
    {
        $this->expectException(DecodeException::class);

        AgentPayload::decode('name: "unterminated');
    }

    public function test_is_toon_media_type(): void
    {
        $this->assertTrue(AgentPayload::isToonMediaType('text/toon'));
        $this->assertTrue(AgentPayload::isToonMediaType('text/toon; charset=utf-8'));
        $this->assertTrue(AgentPayload::isToonMediaType('TEXT/TOON'));
        $this->assertFalse(AgentPayload::isToonMediaType('application/json'));
        $this->assertFalse(AgentPayload::isToonMediaType(null));
        $this->assertFalse(AgentPayload::isToonMediaType(''));
    }

    public function test_is_json_media_type(): void
    {
        $this->assertTrue(AgentPayload::isJsonMediaType('application/json'));
        $this->assertTrue(AgentPayload::isJsonMediaType('application/json; charset=utf-8'));
        $this->assertTrue(AgentPayload::isJsonMediaType('application/vnd.api+json'));
        $this->assertFalse(AgentPayload::isJsonMediaType('text/toon'));
        $this->assertFalse(AgentPayload::isJsonMediaType('text/csv'));
        $this->assertFalse(AgentPayload::isJsonMediaType(null));
    }

    public function test_wants_toon_negotiation(): void
    {
        $this->assertFalse(AgentPayload::wantsToon(Request::create('/x')));
        $this->assertTrue(AgentPayload::wantsToon(Request::create('/x', server: ['HTTP_ACCEPT' => 'text/toon'])));
        $this->assertTrue(AgentPayload::wantsToon(Request::create('/x?format=toon')));
        $this->assertFalse(AgentPayload::wantsToon(Request::create('/x?format=json', server: ['HTTP_ACCEPT' => 'text/toon'])));
        $this->assertFalse(AgentPayload::wantsToon(Request::create('/x', server: ['HTTP_ACCEPT' => 'application/json'])));
    }
}
