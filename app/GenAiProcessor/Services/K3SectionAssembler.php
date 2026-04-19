<?php

namespace App\GenAiProcessor\Services;

/**
 * Assembles Schedule K-3 sections from the flat args array returned by the GenAI tool call.
 *
 * Extracted from GenAiJobDispatcherService::coerceK1Args() so this pure data-transformation
 * logic can be unit-tested without instantiating the full service.
 *
 * @phpstan-type K3Section array{sectionId: string, title: string, data: mixed, notes: string}
 */
class K3SectionAssembler
{
    /**
     * Build the k3Sections array from a flat GenAI tool-call args array.
     *
     * @param  array<string, mixed>  $args
     * @return list<K3Section>
     */
    public function assemble(array $args): array
    {
        $sections = [];

        // Part I checkboxes and FX translation rows
        $checkboxes = is_array($args['k3_part1_checkboxes'] ?? null) ? $args['k3_part1_checkboxes'] : [];
        $fxRows = is_array($args['k3_part1_fx_translation'] ?? null) ? $args['k3_part1_fx_translation'] : [];
        if (! empty($checkboxes) || ! empty($fxRows)) {
            $part1Data = [];
            if (! empty($checkboxes)) {
                $part1Data['checkboxes'] = $checkboxes;
            }
            if (! empty($fxRows)) {
                $part1Data['fxTranslation'] = $fxRows;
            }
            $sections[] = [
                'sectionId' => 'part1',
                'title' => 'Part I – Other Current Year International Information',
                'data' => $part1Data,
                'notes' => '',
            ];
        }

        // Part II: split income rows (6–24) and deduction rows (25–55) into separate sections
        $part2Rows = is_array($args['k3_part2_rows'] ?? null) ? $args['k3_part2_rows'] : [];
        if (! empty($part2Rows)) {
            $incomeLines = ['6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24'];
            $deductionLines = ['25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49', '50', '51', '52', '53', '54', '55'];
            $section1Rows = array_values(array_filter($part2Rows, fn ($r) => is_array($r) && in_array($r['line'] ?? '', $incomeLines)));
            $section2Rows = array_values(array_filter($part2Rows, fn ($r) => is_array($r) && in_array($r['line'] ?? '', $deductionLines)));
            if (! empty($section1Rows)) {
                $sections[] = [
                    'sectionId' => 'part2_section1',
                    'title' => 'Part II – Foreign Tax Credit Limitation, Section 1: Gross Income',
                    'data' => ['rows' => $section1Rows],
                    'notes' => '',
                ];
            }
            if (! empty($section2Rows)) {
                $sections[] = [
                    'sectionId' => 'part2_section2',
                    'title' => 'Part II – Foreign Tax Credit Limitation, Section 2: Deductions',
                    'data' => ['rows' => $section2Rows],
                    'notes' => '',
                ];
            }
        }

        // Part III Section 2: interest expense apportionment asset rows
        $assetRows = is_array($args['k3_part3_asset_rows'] ?? null) ? $args['k3_part3_asset_rows'] : [];
        if (! empty($assetRows)) {
            $sections[] = [
                'sectionId' => 'part3_section2',
                'title' => 'Part III – Section 2: Interest Expense Apportionment Factors',
                'data' => ['rows' => $assetRows],
                'notes' => '',
            ];
        }

        // Part III Section 4: foreign taxes by country
        $foreignTaxes = is_array($args['k3_part3_foreign_taxes'] ?? null) ? $args['k3_part3_foreign_taxes'] : [];
        if (! empty($foreignTaxes)) {
            $foreignTaxesWithAmounts = array_values(array_filter(
                $foreignTaxes,
                static fn ($row): bool => is_array($row) && is_numeric($row['amount_usd'] ?? null)
            ));
            $sections[] = [
                'sectionId' => 'part3_section4',
                'title' => 'Part III – Section 4: Foreign Taxes',
                'data' => [
                    'countries' => $foreignTaxes,
                    'grandTotalUSD' => array_sum(array_map(
                        static fn (array $row): float => (float) $row['amount_usd'],
                        $foreignTaxesWithAmounts
                    )),
                ],
                'notes' => '',
            ];
        }

        // Part III Section 5: Sec. 743(b) basis adjustments
        $sec743bPos = $args['k3_part3_section5_sec743b_positive'] ?? null;
        $sec743bNeg = $args['k3_part3_section5_sec743b_negative'] ?? null;
        if (is_numeric($sec743bPos) || is_numeric($sec743bNeg)) {
            $sec5Data = [];
            if (is_numeric($sec743bPos)) {
                $sec5Data['sec743b_positive'] = (float) $sec743bPos;
            }
            if (is_numeric($sec743bNeg)) {
                $sec5Data['sec743b_negative'] = (float) $sec743bNeg;
            }
            $sections[] = [
                'sectionId' => 'part3_section5',
                'title' => 'Part III – Section 5: Sec. 743(b) Basis Adjustments',
                'data' => $sec5Data,
                'notes' => '',
            ];
        }

        // Part IV: FDII and Sec. 250 deduction
        $part4FieldMap = [
            'net_income_loss' => $args['k3_part4_net_income_loss'] ?? null,
            'dei_gross_receipts' => $args['k3_part4_dei_gross_receipts'] ?? null,
            'dei_allocated_deductions' => $args['k3_part4_dei_allocated_deductions'] ?? null,
            'other_interest_expense_dei' => $args['k3_part4_other_interest_expense_dei'] ?? null,
            'total_average_assets' => $args['k3_part4_total_average_assets'] ?? null,
        ];
        $part4Data = [];
        foreach ($part4FieldMap as $key => $val) {
            if (is_numeric($val)) {
                $part4Data[$key] = (float) $val;
            }
        }
        if (! empty($part4Data)) {
            $sections[] = [
                'sectionId' => 'part4',
                'title' => 'Part IV – Foreign-Derived Intangible Income (FDII) and Sec. 250 Deduction',
                'data' => $part4Data,
                'notes' => '',
            ];
        }

        // Parts V–XIII: note-based sections; Part IX also carries numeric fields
        $part9NumericData = [];
        if (is_numeric($args['k3_part9_line1_gross_receipts'] ?? null)) {
            $part9NumericData['line1_gross_receipts'] = (float) $args['k3_part9_line1_gross_receipts'];
        }
        if (is_numeric($args['k3_part9_line5_denominator_amounts'] ?? null)) {
            $part9NumericData['line5_denominator_amounts'] = (float) $args['k3_part9_line5_denominator_amounts'];
        }

        $partNoteMap = [
            'k3_part5_notes' => ['part5', 'Part V – Distributions From Foreign Corporations to Partnership', []],
            'k3_part6_notes' => ['part6', 'Part VI – Information on Partners\' Sec. 951(a)(1) and Sec. 951A Inclusions', []],
            'k3_part7_notes' => ['part7', 'Part VII – Information on Partners\' Sec. 951A Inclusions', []],
            'k3_part8_notes' => ['part8', 'Part VIII – Alternative Calculation for Transition Year', []],
            // Third element carries $part9NumericData (line1/line5 fields) alongside the free-form notes.
            'k3_part9_notes' => ['part9', 'Part IX – Partners\' Information on Tax-Exempt Income From a Foreign Partnership', $part9NumericData],
            'k3_part10_notes' => ['part10', 'Part X – Foreign Partner\'s Character and Source of Income and Deductions', []],
            'k3_part11_notes' => ['part11', 'Part XI – Foreign Partner\'s Distributive Share of Deemed Sale Items on Transfer', []],
            'k3_part12_notes' => ['part12', 'Part XII – Partner\'s Information for Base Erosion and Anti-Abuse Tax (BEAT)', []],
            'k3_part13_notes' => ['part13', 'Part XIII – Foreign Partner\'s Distributive Share of Effectively Connected Taxable Income', []],
        ];
        foreach ($partNoteMap as $argKey => [$sectionId, $title, $extraData]) {
            $notes = (isset($args[$argKey]) && $args[$argKey] !== '') ? (string) $args[$argKey] : null;
            if ($notes !== null || ! empty($extraData)) {
                $sections[] = [
                    'sectionId' => $sectionId,
                    'title' => $title,
                    'data' => $extraData,
                    'notes' => $notes ?? '',
                ];
            }
        }

        // Backward-compat: merge any legacy k3_sections entries not already covered
        $rawSections = is_array($args['k3_sections'] ?? null) ? $args['k3_sections'] : [];
        $existingIds = array_column($sections, 'sectionId');
        foreach ($rawSections as $sec) {
            if (! is_array($sec) || ! isset($sec['sectionId'])) {
                continue;
            }
            if (in_array($sec['sectionId'], $existingIds)) {
                continue;
            }
            $sections[] = [
                'sectionId' => (string) $sec['sectionId'],
                'title' => isset($sec['title']) ? (string) $sec['title'] : '',
                'data' => (isset($sec['data']) && is_array($sec['data'])) ? $sec['data'] : (object) [],
                'notes' => isset($sec['notes']) ? (string) $sec['notes'] : '',
            ];
        }

        return $sections;
    }
}
