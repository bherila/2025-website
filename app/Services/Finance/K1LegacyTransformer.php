<?php

namespace App\Services\Finance;

/**
 * Transforms legacy flat-format K-1 parsed_data records to the canonical
 * schemaVersion "2026.1" FK1StructuredData shape.
 *
 * Legacy records lack a `schemaVersion` key and use named flat keys like
 * `box1_ordinary_income`, `partner_name`, `other_coded_items`, etc.
 * New records (produced by GenAiJobDispatcherService::coerceK1Args) carry
 * `schemaVersion: "2026.1"` with `fields` and `codes` dicts.
 *
 * Usage:
 *   if (K1LegacyTransformer::isLegacy($parsedData)) {
 *       $parsedData = K1LegacyTransformer::transform($parsedData);
 *   }
 */
class K1LegacyTransformer
{
    /**
     * Return true if the parsed_data array is a legacy flat-format K-1 record.
     *
     * Detection: absence of schemaVersion key.
     *
     * @param  array<string, mixed>  $parsedData
     */
    public static function isLegacy(array $parsedData): bool
    {
        return ! isset($parsedData['schemaVersion']);
    }

    /**
     * Transform a legacy flat K-1 record into the canonical FK1StructuredData shape.
     *
     * The original data is preserved under `legacyFields` so nothing is lost.
     * The resulting schemaVersion is "1.0" (distinct from "2026.1" AI-generated records)
     * so consumers can detect migrated records if needed.
     *
     * @param  array<string, mixed>  $legacy
     * @return array<string, mixed>
     */
    public static function transform(array $legacy): array
    {
        $fields = [];

        // --- IRS header fields (lettered boxes) ---
        $letterMap = [
            'entity_ein' => 'A',
            'entity_name' => 'B',
            'partner_ssn_last4' => 'E',
            'partner_name' => 'F',
            'partner_type' => 'I1',
        ];
        foreach ($letterMap as $legacyKey => $irsBox) {
            $val = $legacy[$legacyKey] ?? null;
            if ($val !== null && $val !== '') {
                $fields[$irsBox] = ['value' => (string) $val];
            }
        }

        if (isset($legacy['partner_ownership_pct'])) {
            $fields['J'] = ['value' => 'Ending: '.(string) $legacy['partner_ownership_pct']];
        }

        // --- Numbered K-1 boxes ---
        $boxMap = [
            'box1_ordinary_income' => '1',
            'box2_net_rental_real_estate' => '2',
            'box3_other_net_rental' => '3',
            'box4_guaranteed_payments_services' => '4',
            'box5_guaranteed_payments_capital' => '5',
            'box6_guaranteed_payments_total' => '6',
            'box7_net_section_1231_gain' => '7',
            'box8_other_income' => '8',
            'box9_section_179_deduction' => '9a',
            'box10_other_deductions' => '10',
        ];
        foreach ($boxMap as $legacyKey => $irsBox) {
            $val = $legacy[$legacyKey] ?? null;
            if (is_numeric($val)) {
                $fields[$irsBox] = ['value' => (string) (float) $val];
            }
        }

        // --- Coded items ---
        $codes = [];

        // other_coded_items: [{code: "13AE", amount: 1020, description: "..."}]
        // or simple box refs like [{code: "9a", amount: -500}]
        foreach ((array) ($legacy['other_coded_items'] ?? []) as $item) {
            if (! is_array($item)) {
                continue;
            }
            $rawCode = (string) ($item['code'] ?? '');
            $amount = (string) ($item['amount'] ?? 0);
            $desc = (string) ($item['description'] ?? '');

            // e.g. "13AE" → box=13, letter=AE  (no i-flag: [a-z]? must stay lowercase)
            if (preg_match('/^(\d+[a-z]?)([A-Z]+)$/', $rawCode, $m)) {
                $codes[$m[1]][] = ['code' => $m[2], 'value' => $amount, 'notes' => $desc];
            } elseif ($rawCode !== '' && (is_numeric($rawCode) || preg_match('/^\d+[a-z]$/', $rawCode))) {
                // Plain box number — treat as field value
                $fields[$rawCode] = ['value' => $amount];
            }
        }

        // amt_items: [{code: "8", amount: -209, description: "Net ST capital gain"}]
        foreach ((array) ($legacy['amt_items'] ?? []) as $item) {
            if (! is_array($item)) {
                continue;
            }
            $box = (string) ($item['code'] ?? '');
            $amount = (string) ($item['amount'] ?? 0);
            $desc = '[AMT] '.(string) ($item['description'] ?? '');
            if ($box !== '') {
                $codes[$box][] = ['code' => $box, 'value' => $amount, 'notes' => $desc];
            }
        }

        // other_info_items: [{code: "K1", amount: 1412, description: "..."}]
        foreach ((array) ($legacy['other_info_items'] ?? []) as $item) {
            if (! is_array($item)) {
                continue;
            }
            $code = (string) ($item['code'] ?? '');
            $amount = (string) ($item['amount'] ?? 0);
            $desc = (string) ($item['description'] ?? '');
            if ($code !== '') {
                $codes[$code][] = ['code' => $code, 'value' => $amount, 'notes' => $desc];
            }
        }

        // Preserve state info as a non-standard field
        if (isset($legacy['state'])) {
            $fields['_state'] = ['value' => (string) $legacy['state']];
        }

        $formSource = (int) ($legacy['form_source'] ?? 1065);
        $formType = $formSource === 1120 ? 'K-1-1120S' : 'K-1-1065';

        return [
            'schemaVersion' => '1.0',
            'formType' => $formType,
            'fields' => $fields,
            'codes' => $codes,
            'k3' => ['sections' => []],
            'raw_text' => $legacy['supplemental_statements'] ?? null,
            'warnings' => [],
            'extraction' => [
                'model' => 'migrated',
                'version' => '1.0',
                'timestamp' => now()->toIso8601String(),
                'source' => 'legacy_migration',
            ],
            'legacyFields' => $legacy,
        ];
    }
}
