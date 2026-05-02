<?php

namespace Tests\Unit\Services\Finance;

use App\Services\Finance\K1CodeCharacterResolver;
use PHPUnit\Framework\TestCase;

class K1CodeCharacterResolverTest extends TestCase
{
    public function test_matches_shared_11s_character_fixtures(): void
    {
        $resolver = new K1CodeCharacterResolver;
        $fixtures = $this->characterFixtures();

        foreach ($fixtures as $fixture) {
            $result = $resolver->resolve('11', [
                'code' => 'S',
                'value' => '100',
                'notes' => $fixture['notes'],
            ]);

            $this->assertSame(
                $fixture['expected'],
                $result['character'] ?? null,
                'Unexpected classification for: '.$fixture['notes'],
            );
        }
    }

    /**
     * @return list<array{notes: string, expected: 'short'|'long'|null}>
     */
    private function characterFixtures(): array
    {
        $path = dirname(__DIR__, 4).'/resources/js/lib/finance/__tests__/fixtures/k1-11s-character-fixtures.json';
        $contents = file_get_contents($path);

        $this->assertIsString($contents);

        $decoded = json_decode($contents, true);

        $this->assertIsArray($decoded);

        return $decoded;
    }
}
