<?php

namespace Tests\Feature\Finance\Parsers;

use App\GenAiProcessor\Services\GenAiJobDispatcherService;
use App\Services\Finance\DocumentIngestionService;
use App\Services\Finance\TaxPreviewFactsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression tests for the schemaVersion "2026.1" Schedule K-1 parser
 * (GenAiJobDispatcherService::coerceK1Args).
 *
 * Specifically asserts the Box 10 / Box 13 / Box 20 behaviour that broke on
 * Pioneer-style 21-page partnership K-1s:
 *   - Box 10 (Net §1231 gain/loss) must stay null when the printed Box 10 row
 *     is blank; the parser must NEVER source it from Box 20 Code B.
 *   - Box 13 may contain multiple sibling entries under the SAME code letter
 *     (e.g. two AE rows: management fees + other deductions). Each row must
 *     appear as a separate code item — never summed into a single entry.
 *   - Box 20 codes A and B must round-trip through the parser exactly as the
 *     AI returned them; they are NOT to be dropped.
 *
 * The parser is exercised via extractGenerateContentData() so the public
 * entrypoint, not the private coercion method, is what's verified.
 */
class K1Schema2026ParserTest extends TestCase
{
    use RefreshDatabase;

    private const FIXTURE_DIR = __DIR__.'/../../../Fixtures/Finance/k1-2025';

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    private function k1ToolResponse(array $args): array
    {
        return [
            'candidates' => [[
                'content' => [
                    'parts' => [[
                        'functionCall' => [
                            'name' => GenAiJobDispatcherService::TAX_DOCUMENT_K1_TOOL_NAME,
                            'args' => $args,
                        ],
                    ]],
                ],
            ]],
        ];
    }

    /**
     * Tool args that would produce the canonical canonical-1065-21page.json
     * fixture when the AI extracts the form correctly.
     *
     * @return array<string, mixed>
     */
    private function canonicalToolArgs(): array
    {
        return [
            'formType' => 'K-1-1065',
            'formId' => 'TEST-FUND-ONE-001-2025',
            'partnerNumber' => '001',
            'pages' => 21,
            'taxYearBeginning' => '2025-01-01',
            'taxYearEnding' => '2025-12-31',
            'field_A' => '99-9999999',
            'field_B' => 'TEST FUND ONE L.P.',
            'field_E' => '999-99-9999',
            'field_F' => 'TEST PARTNER',
            'field_G' => 'LIMITED_PARTNER',
            'field_I1' => 'INDIVIDUAL',
            'field_5' => 21,
            'field_9a' => -500,
            // field_10 deliberately omitted — Box 10 is blank on the form.
            'field_21' => 11,
            'codes_13' => [
                ['code' => 'AE', 'value' => 796, 'notes' => 'Management fees. SUSPENDED under §67(g).'],
                ['code' => 'AE', 'value' => 224, 'notes' => 'Other deductions. SUSPENDED under §67(g).'],
            ],
            'codes_20' => [
                ['code' => 'A', 'value' => 21, 'notes' => 'Investment income for Form 4952.'],
                ['code' => 'B', 'value' => 1020, 'notes' => 'Investment expenses for Form 4952 line 5.'],
            ],
        ];
    }

    public function test_canonical_extraction_keeps_box_10_absent_when_form_is_blank(): void
    {
        $service = new GenAiJobDispatcherService;

        $data = $service->extractGenerateContentData(
            'document_extract',
            $this->k1ToolResponse($this->canonicalToolArgs()),
        );

        $this->assertIsArray($data);
        $this->assertSame('2026.1', $data['schemaVersion']);
        $this->assertSame('K-1-1065', $data['formType']);
        $this->assertArrayNotHasKey('10', $data['fields'], 'Box 10 must be absent when the K-1 row is blank.');
    }

    public function test_canonical_extraction_preserves_two_distinct_box_13_ae_entries(): void
    {
        $service = new GenAiJobDispatcherService;

        $data = $service->extractGenerateContentData(
            'document_extract',
            $this->k1ToolResponse($this->canonicalToolArgs()),
        );

        $this->assertIsArray($data);
        $this->assertArrayHasKey('13', $data['codes']);
        $this->assertCount(2, $data['codes']['13'], 'Both Box 13 AE rows must be preserved (not summed).');
        $this->assertSame('AE', $data['codes']['13'][0]['code']);
        $this->assertSame('796', $data['codes']['13'][0]['value']);
        $this->assertSame('AE', $data['codes']['13'][1]['code']);
        $this->assertSame('224', $data['codes']['13'][1]['value']);
    }

    public function test_canonical_extraction_preserves_box_20_codes_a_and_b(): void
    {
        $service = new GenAiJobDispatcherService;

        $data = $service->extractGenerateContentData(
            'document_extract',
            $this->k1ToolResponse($this->canonicalToolArgs()),
        );

        $this->assertIsArray($data);
        $this->assertArrayHasKey('20', $data['codes']);
        $this->assertCount(2, $data['codes']['20'], 'Box 20 codes A and B must both be extracted.');

        $byCode = collect($data['codes']['20'])->keyBy('code')->all();
        $this->assertArrayHasKey('A', $byCode);
        $this->assertArrayHasKey('B', $byCode);
        $this->assertSame('21', $byCode['A']['value']);
        $this->assertSame('1020', $byCode['B']['value']);
    }

    public function test_box_10_value_matching_box_20_code_b_is_dropped_with_warning(): void
    {
        $service = new GenAiJobDispatcherService;

        // The historical bug: Gemini puts the Box 20 Code B investment-expense
        // value (1020) into field_10. The parser guard must drop it.
        $args = $this->canonicalToolArgs();
        $args['field_10'] = 1020;

        $data = $service->extractGenerateContentData(
            'document_extract',
            $this->k1ToolResponse($args),
        );

        $this->assertIsArray($data);
        $this->assertArrayNotHasKey('10', $data['fields'], 'Box 10 must be dropped when its value duplicates a Box 20 Code B item.');
        $this->assertArrayHasKey('20', $data['codes']);
        $this->assertCount(2, $data['codes']['20'], 'Box 20 entries must remain intact after the Box 10 guard fires.');
        $matching = array_filter(
            $data['warnings'],
            fn (string $w): bool => str_contains($w, 'Box 10') && str_contains($w, 'Box 20 Code B'),
        );
        $this->assertNotEmpty($matching, 'A warning explaining the Box 10 / Box 20 B collision must be emitted.');
    }

    public function test_box_10_is_kept_when_no_box_20_code_b_collision(): void
    {
        $service = new GenAiJobDispatcherService;

        // Legitimate §1231 gain: 500 on Box 10, separate 1020 on Box 20 Code B.
        $args = $this->canonicalToolArgs();
        $args['field_10'] = 500;

        $data = $service->extractGenerateContentData(
            'document_extract',
            $this->k1ToolResponse($args),
        );

        $this->assertIsArray($data);
        $this->assertArrayHasKey('10', $data['fields']);
        $this->assertSame('500', $data['fields']['10']['value']);
        $this->assertSame([], $data['warnings']);
    }

    public function test_sibling_fund_tool_args_round_trip_to_canonical_shape(): void
    {
        $service = new GenAiJobDispatcherService;

        $data = $service->extractGenerateContentData(
            'document_extract',
            $this->k1ToolResponse([
                'formType' => 'K-1-1065',
                'formId' => 'TEST-FUND-TWO-001-2025',
                'pages' => 21,
                'field_A' => '99-9999999',
                'field_B' => 'TEST FUND TWO L.P.',
                'field_F' => 'TEST PARTNER',
                'codes_13' => [
                    ['code' => 'AE', 'value' => 800, 'notes' => 'Management fees.'],
                    ['code' => 'AE', 'value' => 249, 'notes' => 'Other deductions.'],
                ],
                'codes_20' => [
                    ['code' => 'B', 'value' => 1049, 'notes' => 'Investment expenses for Form 4952 line 5.'],
                ],
            ]),
        );

        $this->assertIsArray($data);
        $this->assertArrayNotHasKey('10', $data['fields']);
        $this->assertCount(2, $data['codes']['13']);
        $this->assertSame(['800', '249'], collect($data['codes']['13'])->pluck('value')->values()->all());
        $this->assertCount(1, $data['codes']['20']);
        $this->assertSame('B', $data['codes']['20'][0]['code']);
        $this->assertSame('1049', $data['codes']['20'][0]['value']);
    }

    public function test_canonical_fixture_files_match_parser_output_shape(): void
    {
        $service = new GenAiJobDispatcherService;

        $data = $service->extractGenerateContentData(
            'document_extract',
            $this->k1ToolResponse($this->canonicalToolArgs()),
        );

        $this->assertIsArray($data);

        $fixture = json_decode(
            (string) file_get_contents(self::FIXTURE_DIR.'/canonical-1065-21page.json'),
            true,
        );
        $this->assertIsArray($fixture);

        // Compare the load-bearing parts of the shape — we intentionally do not
        // assert on extraction.timestamp / createdAt which are time-stamped.
        $this->assertSame($fixture['schemaVersion'], $data['schemaVersion']);
        $this->assertSame($fixture['formType'], $data['formType']);
        $this->assertSame($fixture['formId'], $data['formId']);
        $this->assertSame($fixture['pages'], $data['pages']);

        // Box 10 absent in both:
        $this->assertArrayNotHasKey('10', $fixture['fields']);
        $this->assertArrayNotHasKey('10', $data['fields']);

        // Box 13 AE multi-entry shape preserved by the parser:
        $this->assertCount(count($fixture['codes']['13']), $data['codes']['13']);
        foreach ($fixture['codes']['13'] as $i => $expected) {
            $this->assertSame($expected['code'], $data['codes']['13'][$i]['code']);
            $this->assertSame($expected['value'], $data['codes']['13'][$i]['value']);
        }

        // Box 20 codes A and B preserved by the parser:
        $this->assertCount(count($fixture['codes']['20']), $data['codes']['20']);
        $expectedCodes = array_column($fixture['codes']['20'], 'code');
        $actualCodes = array_column($data['codes']['20'], 'code');
        $this->assertSame($expectedCodes, $actualCodes);
    }

    public function test_sibling_fixture_matches_parser_output_shape(): void
    {
        $service = new GenAiJobDispatcherService;

        $data = $service->extractGenerateContentData(
            'document_extract',
            $this->k1ToolResponse([
                'formType' => 'K-1-1065',
                'formId' => 'TEST-FUND-TWO-001-2025',
                'pages' => 21,
                'field_A' => '99-9999999',
                'field_B' => 'TEST FUND TWO L.P.',
                'field_F' => 'TEST PARTNER',
                'codes_13' => [
                    ['code' => 'AE', 'value' => 800, 'notes' => 'Management fees.'],
                    ['code' => 'AE', 'value' => 249, 'notes' => 'Other deductions.'],
                ],
                'codes_20' => [
                    ['code' => 'B', 'value' => 1049, 'notes' => 'Investment expenses for Form 4952 line 5.'],
                ],
            ]),
        );

        $fixture = json_decode(
            (string) file_get_contents(self::FIXTURE_DIR.'/canonical-1065-21page-sibling.json'),
            true,
        );
        $this->assertIsArray($fixture);

        $this->assertArrayNotHasKey('10', $fixture['fields']);
        $this->assertArrayNotHasKey('10', $data['fields']);

        $this->assertSame(
            array_column($fixture['codes']['13'], 'value'),
            array_column($data['codes']['13'], 'value'),
        );
        $this->assertSame(
            array_column($fixture['codes']['20'], 'code'),
            array_column($data['codes']['20'], 'code'),
        );
        $this->assertSame(
            array_column($fixture['codes']['20'], 'value'),
            array_column($data['codes']['20'], 'value'),
        );
    }

    public function test_schedule_d_line11_does_not_include_misclassified_box_10(): void
    {
        $user = $this->createUser();

        // Simulate the AI making the historical mistake: putting Box 20 Code B's
        // 1020 into field_10. The coercer guard drops it, so when the document is
        // stored and Schedule D facts are built, line 11 must NOT include 1020.
        $service = new GenAiJobDispatcherService;
        $args = $this->canonicalToolArgs();
        $args['field_10'] = 1020;
        $coerced = $service->extractGenerateContentData(
            'document_extract',
            $this->k1ToolResponse($args),
        );

        $this->assertIsArray($coerced);
        $this->assertArrayNotHasKey('10', $coerced['fields']);

        app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'form_type' => 'k1',
            'is_reviewed' => true,
            'original_filename' => 'k1.pdf',
            'stored_filename' => 'k1.pdf',
            's3_path' => '',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 0,
            'file_hash' => hash('sha256', 'k1-misclassified-box10'),
            'uploaded_by_user_id' => $user->id,
            'parsed_data' => $coerced,
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025);

        $this->assertSame(
            0.0,
            $facts['scheduleD']['line11GainLoss'],
            'Schedule D line 11 must be zero — the misclassified Box 10 value (1020) must not flow through Form 4797.',
        );
        $this->assertSame(0.0, $facts['form4797']['partINet1231']);
    }

    public function test_schedule_d_line11_does_pick_up_legitimate_box_10_section_1231_gain(): void
    {
        // Sanity check: when Box 10 carries a real §1231 gain that does NOT
        // collide with a Box 20 Code B amount, the guard must NOT fire and the
        // value must flow to Schedule D line 11 normally.
        $user = $this->createUser();

        $service = new GenAiJobDispatcherService;
        $args = $this->canonicalToolArgs();
        $args['field_10'] = 750;          // legitimate §1231 gain
        $coerced = $service->extractGenerateContentData(
            'document_extract',
            $this->k1ToolResponse($args),
        );

        $this->assertIsArray($coerced);
        $this->assertSame('750', $coerced['fields']['10']['value']);

        app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'form_type' => 'k1',
            'is_reviewed' => true,
            'original_filename' => 'k1.pdf',
            'stored_filename' => 'k1.pdf',
            's3_path' => '',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 0,
            'file_hash' => hash('sha256', 'k1-legitimate-box10'),
            'uploaded_by_user_id' => $user->id,
            'parsed_data' => $coerced,
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025);

        $this->assertSame(750.0, $facts['scheduleD']['line11GainLoss']);
        $this->assertSame(750.0, $facts['form4797']['partINet1231']);
    }
}
