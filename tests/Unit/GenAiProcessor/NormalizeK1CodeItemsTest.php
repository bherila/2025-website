<?php

namespace Tests\Unit\GenAiProcessor;

use App\GenAiProcessor\Services\GenAiJobDispatcherService;
use ReflectionMethod;
use Tests\TestCase;

/**
 * Tests GenAiJobDispatcherService::normalizeCodeItems(), which converts the
 * Gemini tool-call payload for a coded K-1 box into the canonical
 * FK1StructuredData K1CodeItem shape.
 *
 * In particular the `character` field (added to disambiguate Box 11 code S
 * sub-lines as short-term vs long-term capital gain/loss) must round-trip
 * "short" / "long" while ignoring blanks, whitespace, and unknown tokens.
 */
class NormalizeK1CodeItemsTest extends TestCase
{
    private function normalize(array $items): array
    {
        $service = new GenAiJobDispatcherService;
        $method = new ReflectionMethod(GenAiJobDispatcherService::class, 'normalizeCodeItems');
        $method->setAccessible(true);

        return $method->invoke($service, $items);
    }

    public function test_basic_code_item_without_character(): void
    {
        $result = $this->normalize([
            ['code' => ' c ', 'value' => 32545, 'notes' => 'Section 1256 contracts'],
        ]);

        $this->assertSame([
            ['code' => 'C', 'value' => '32545', 'notes' => 'Section 1256 contracts'],
        ], $result);
    }

    public function test_preserves_short_character_on_box_11s(): void
    {
        $result = $this->normalize([
            ['code' => 'S', 'value' => -101298, 'notes' => 'Net short-term capital loss', 'character' => 'short'],
        ]);

        $this->assertCount(1, $result);
        $this->assertSame('short', $result[0]['character']);
    }

    public function test_preserves_long_character(): void
    {
        $result = $this->normalize([
            ['code' => 'S', 'value' => 62473, 'notes' => 'Net long-term capital gain', 'character' => 'long'],
        ]);

        $this->assertSame('long', $result[0]['character']);
    }

    public function test_drops_unknown_character_token(): void
    {
        $result = $this->normalize([
            ['code' => 'S', 'value' => 1, 'character' => 'mid-term'],
            ['code' => 'S', 'value' => 2, 'character' => ''],
            ['code' => 'S', 'value' => 3, 'character' => 'SHORT'],
        ]);

        $this->assertArrayNotHasKey('character', $result[0]);
        $this->assertArrayNotHasKey('character', $result[1]);
        // case-insensitive match
        $this->assertSame('short', $result[2]['character']);
    }

    public function test_drops_invalid_items_silently(): void
    {
        $result = $this->normalize([
            ['code' => 'A', 'value' => 1],
            'not-an-array',
            ['value' => 99], // missing code
            ['code' => 'B'], // missing value → empty string
        ]);

        $this->assertCount(2, $result);
        $this->assertSame('A', $result[0]['code']);
        $this->assertSame('B', $result[1]['code']);
        $this->assertSame('', $result[1]['value']);
    }

    public function test_normalizes_code_casing_and_whitespace(): void
    {
        $result = $this->normalize([
            ['code' => ' zz ', 'value' => -10],
            ['code' => 's', 'value' => 20],
        ]);

        $this->assertSame('ZZ', $result[0]['code']);
        $this->assertSame('S', $result[1]['code']);
    }
}
