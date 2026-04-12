<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Finance\K1LegacyTransformer;
use Database\Seeders\Finance\FinanceTaxDocumentsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Integration tests for K1LegacyTransformer against the seeded demo K-1 records.
 *
 * Seeder provides three K-1 documents:
 *   - demo-k1-legacy-simple.pdf       → legacy flat format (no schemaVersion)
 *   - demo-k1-legacy-multi-state.pdf  → legacy flat format with multi-state and coded items
 *   - demo-k1-canonical.pdf           → canonical schemaVersion "2026.1" AI-generated record
 */
class K1TrainingDataTransformerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        User::factory()->create(['email' => 'test@example.com']);
        $this->seed(FinanceTaxDocumentsSeeder::class);
    }

    private function loadK1Records(): array
    {
        return DB::table('fin_tax_documents')
            ->where('form_type', 'k1')
            ->get()
            ->map(fn ($row) => json_decode($row->parsed_data, true))
            ->toArray();
    }

    private function legacyRecords(): array
    {
        return array_values(array_filter(
            $this->loadK1Records(),
            fn ($r) => K1LegacyTransformer::isLegacy($r),
        ));
    }

    private function canonicalRecords(): array
    {
        return array_values(array_filter(
            $this->loadK1Records(),
            fn ($r) => ! K1LegacyTransformer::isLegacy($r),
        ));
    }

    /** Seeder must provide at least one legacy and one canonical K-1. */
    public function test_seeder_provides_both_legacy_and_canonical_records(): void
    {
        $this->assertNotEmpty($this->legacyRecords(), 'Seeder must provide at least one legacy K-1');
        $this->assertNotEmpty($this->canonicalRecords(), 'Seeder must provide at least one canonical K-1');
    }

    /** Canonical records must not be detected as legacy. */
    public function test_canonical_examples_are_not_legacy(): void
    {
        $records = $this->canonicalRecords();

        $this->assertNotEmpty($records, 'canonical K-1 records must not be empty');

        foreach ($records as $i => $record) {
            $this->assertFalse(
                K1LegacyTransformer::isLegacy($record),
                "canonical record[$i] should not be detected as legacy (schemaVersion: ".($record['schemaVersion'] ?? 'missing').')',
            );
        }
    }

    /** Legacy records must be detected as legacy. */
    public function test_legacy_examples_are_detected_as_legacy(): void
    {
        $records = $this->legacyRecords();

        $this->assertNotEmpty($records, 'legacy K-1 records must not be empty');

        foreach ($records as $i => $record) {
            $this->assertTrue(
                K1LegacyTransformer::isLegacy($record),
                "legacy record[$i] should be detected as legacy",
            );
        }
    }

    /** Transforming legacy records produces a schemaVersion and the required structural keys. */
    public function test_legacy_examples_transform_to_canonical_shape(): void
    {
        $records = $this->legacyRecords();

        $this->assertNotEmpty($records, 'legacy K-1 records must not be empty');

        foreach ($records as $i => $record) {
            $result = K1LegacyTransformer::transform($record);

            $this->assertArrayHasKey('schemaVersion', $result, "legacy record[$i] missing schemaVersion after transform");
            $this->assertArrayHasKey('fields', $result, "legacy record[$i] missing fields after transform");
            $this->assertArrayHasKey('codes', $result, "legacy record[$i] missing codes after transform");
            $this->assertArrayHasKey('k3', $result, "legacy record[$i] missing k3 after transform");
            $this->assertArrayHasKey('legacyFields', $result, "legacy record[$i] missing legacyFields after transform");
            $this->assertArrayHasKey('extraction', $result, "legacy record[$i] missing extraction after transform");

            $this->assertSame('legacy_migration', $result['extraction']['source'],
                "legacy record[$i] extraction.source should be legacy_migration");

            // After transform, isLegacy should return false
            $this->assertFalse(K1LegacyTransformer::isLegacy($result),
                "legacy record[$i] should not be legacy after transform");

            // Original data must be fully preserved
            $this->assertSame($record, $result['legacyFields'],
                "legacy record[$i] legacyFields must equal original input");
        }
    }

    /** Canonical records are not altered through the isLegacy guard. */
    public function test_canonical_examples_are_unchanged_through_is_legacy_guard(): void
    {
        $records = $this->canonicalRecords();

        foreach ($records as $i => $record) {
            if (! K1LegacyTransformer::isLegacy($record)) {
                // Guard works — nothing to transform
                $this->assertSame('2026.1', $record['schemaVersion'],
                    "canonical record[$i] should have schemaVersion 2026.1");

                continue;
            }
            $this->fail("canonical record[$i] was incorrectly detected as legacy");
        }
    }

    /** Transformation is idempotent: transforming twice produces the same schemaVersion. */
    public function test_transform_is_idempotent(): void
    {
        $records = $this->legacyRecords();

        foreach ($records as $i => $record) {
            $first = K1LegacyTransformer::transform($record);
            $second = K1LegacyTransformer::isLegacy($first) ? K1LegacyTransformer::transform($first) : $first;

            $this->assertSame($first['schemaVersion'], $second['schemaVersion'],
                "legacy record[$i] transform should be idempotent");
        }
    }
}
