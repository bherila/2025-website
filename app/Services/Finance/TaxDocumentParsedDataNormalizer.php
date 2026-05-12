<?php

namespace App\Services\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\TaxDocumentAccount;

class TaxDocumentParsedDataNormalizer
{
    /**
     * @var array<string, string>
     */
    private const COMMON_ALIASES = [
        'recipient_tin_last4' => 'recipient_tin',
    ];

    /**
     * @var array<string, array<string, string>>
     */
    private const ALIASES_BY_FORM = [
        '1099_int' => [
            'int_1_interest_income' => 'box1_interest',
            '1_interest_income' => 'box1_interest',
            'int_2_early_withdrawal' => 'box2_early_withdrawal',
            'int_2_early_withdrawal_penalty' => 'box2_early_withdrawal',
            '2_early_withdrawal_penalty' => 'box2_early_withdrawal',
            'int_3_us_savings_bonds' => 'box3_savings_bond',
            'int_3_us_savings_bonds_treasury' => 'box3_savings_bond',
            '3_interest_on_us_savings_bonds_and_treasury_obligations' => 'box3_savings_bond',
            'int_4_fed_tax_withheld' => 'box4_fed_tax',
            'int_4_federal_tax_withheld' => 'box4_fed_tax',
            '4_federal_income_tax_withheld' => 'box4_fed_tax',
            'int_5_investment_expenses' => 'box5_investment_expense',
            '5_investment_expenses' => 'box5_investment_expense',
            'int_6_foreign_tax_paid' => 'box6_foreign_tax',
            '6_foreign_tax_paid' => 'box6_foreign_tax',
            'int_7_foreign_country' => 'box7_foreign_country',
            '7_foreign_country_or_us_possession' => 'box7_foreign_country',
            '7_foreign_country_or_us_territory' => 'box7_foreign_country',
            'int_8_tax_exempt_interest' => 'box8_tax_exempt',
            '8_tax_exempt_interest' => 'box8_tax_exempt',
            'int_9_specified_private_activity_bond_interest' => 'box9_private_activity',
            '9_specified_private_activity_bond_interest' => 'box9_private_activity',
            '9_specified_private_activity_bond_interest_amt' => 'box9_private_activity',
            'int_10_market_discount' => 'box10_market_discount',
            '10_market_discount' => 'box10_market_discount',
            '10_market_discount_covered_lots' => 'box10_market_discount',
            'int_11_bond_premium' => 'box11_bond_premium',
            '11_bond_premium' => 'box11_bond_premium',
            '11_bond_premium_covered_lots' => 'box11_bond_premium',
            'int_12_treasury_premium' => 'box12_treasury_premium',
            '12_bond_premium_on_treasury_obligations' => 'box12_treasury_premium',
            '12_bond_premium_on_treasury_obligations_covered_lots' => 'box12_treasury_premium',
            'int_13_tax_exempt_bond_premium' => 'box13_tax_exempt_premium',
            '13_bond_premium_on_tax_exempt_bond' => 'box13_tax_exempt_premium',
            '13_bond_premium_on_tax_exempt_bonds' => 'box13_tax_exempt_premium',
        ],
        '1099_div' => [
            'box1_ordinary' => 'box1a_ordinary',
            'div_1a_total_ordinary' => 'box1a_ordinary',
            '1a_total_ordinary_dividends' => 'box1a_ordinary',
            'box1b' => 'box1b_qualified',
            'div_1b_qualified' => 'box1b_qualified',
            '1b_qualified_dividends' => 'box1b_qualified',
            'div_2a_cap_gain' => 'box2a_cap_gain',
            'div_2a_total_cap_gain' => 'box2a_cap_gain',
            '2a_total_capital_gain_distributions' => 'box2a_cap_gain',
            'div_2b_unrecap_1250' => 'box2b_unrecap_1250',
            '2b_unrecaptured_section_1250_gain' => 'box2b_unrecap_1250',
            'div_2c_1202' => 'box2c_section_1202',
            '2c_section_1202_gain' => 'box2c_section_1202',
            'div_2d_collectibles' => 'box2d_collectibles',
            '2d_collectibles_28_percent_gain' => 'box2d_collectibles',
            'div_2e_897_ordinary' => 'box2e_section_897_ordinary',
            '2e_section_897_ordinary_dividends' => 'box2e_section_897_ordinary',
            'div_2f_897_cap_gain' => 'box2f_section_897_cap_gain',
            '2f_section_897_capital_gain' => 'box2f_section_897_cap_gain',
            'div_3_nondividend' => 'box3_nondividend',
            '3_nondividend_distributions' => 'box3_nondividend',
            'div_4_fed_tax_withheld' => 'box4_fed_tax',
            'div_4_federal_tax_withheld' => 'box4_fed_tax',
            '4_federal_income_tax_withheld' => 'box4_fed_tax',
            'div_5_section199a' => 'box5_section_199a',
            '5_section_199a_dividends' => 'box5_section_199a',
            'div_6_investment_expenses' => 'box6_investment_expense',
            '6_investment_expenses' => 'box6_investment_expense',
            'div_7_foreign_tax_paid' => 'box7_foreign_tax',
            '7_foreign_tax_paid' => 'box7_foreign_tax',
            '8_foreign_country_or_us_possession' => 'box8_foreign_country',
            '9_cash_liquidation_distributions' => 'box9_cash_liquidation',
            '10_noncash_liquidation_distributions' => 'box10_noncash_liquidation',
            'box12_exempt_interest_dividends' => 'box11_exempt_interest',
            '12_exempt_interest_dividends' => 'box11_exempt_interest',
            'box13_specified_private_activity_bond_interest_dividends_amt' => 'box12_private_activity',
            '13_specified_private_activity_bond_interest_dividends_amt' => 'box12_private_activity',
            'state_tax_withheld' => 'box14_state_tax',
        ],
        '1099_misc' => [
            'misc_1_rents' => 'box1_rents',
            '1_rents' => 'box1_rents',
            'misc_2_royalties' => 'box2_royalties',
            '2_royalties' => 'box2_royalties',
            'box3_other' => 'box3_other_income',
            'misc_3_other_income' => 'box3_other_income',
            '3_other_income' => 'box3_other_income',
            'misc_4_fed_tax_withheld' => 'box4_fed_tax',
            'misc_4_federal_tax_withheld' => 'box4_fed_tax',
            '4_federal_income_tax_withheld' => 'box4_fed_tax',
            'misc_8_substitute_payments' => 'box8_substitute_payments',
            '8_substitute_payments_in_lieu_of_dividends_or_interest' => 'box8_substitute_payments',
        ],
        '1099_r' => [
            'gross_distribution' => 'box1_gross_distribution',
            '1_gross_distribution' => 'box1_gross_distribution',
            'taxable_amount' => 'box2a_taxable_amount',
            '2a_taxable_amount' => 'box2a_taxable_amount',
            '2b_taxable_amount_not_determined' => 'box2b_taxable_not_determined',
            'taxable_amount_not_determined' => 'box2b_taxable_not_determined',
            '2b_total_distribution' => 'box2b_total_distribution',
            'total_distribution' => 'box2b_total_distribution',
            '3_capital_gain' => 'box3_capital_gain',
            'capital_gain' => 'box3_capital_gain',
            '4_federal_income_tax_withheld' => 'box4_fed_tax',
            'federal_income_tax_withheld' => 'box4_fed_tax',
            '5_employee_contributions' => 'box5_employee_contributions',
            'employee_contributions' => 'box5_employee_contributions',
            'employee_contributions_or_designated_roth_contributions_or_insurance_premiums' => 'box5_employee_contributions',
            'total_employee_contributions_or_designated_roth_contributions_or_insurance_premiums' => 'box5_employee_contributions',
            '6_net_unrealized_appreciation' => 'box6_net_unrealized_appreciation',
            'net_unrealized_appreciation' => 'box6_net_unrealized_appreciation',
            'distribution_code' => 'box7_distribution_code',
            'distribution_codes' => 'box7_distribution_code',
            '7_distribution_code' => 'box7_distribution_code',
            '7_distribution_codes' => 'box7_distribution_code',
            'ira_sep_simple' => 'box7_ira_sep_simple',
            '7_ira_sep_simple' => 'box7_ira_sep_simple',
            '8_other' => 'box8_other',
            '9a_percentage' => 'box9a_percentage',
            'percentage_of_total_distribution' => 'box9a_percentage',
            'your_percentage_of_total_distribution' => 'box9a_percentage',
            '9b_total_employee_contributions' => 'box9b_employee_contributions',
            '10_amount_allocable_to_irr' => 'box10_amount_allocable_irr',
            '11_first_year_of_designated_roth_contribution' => 'box11_first_year_roth',
            '12_fatca_filing_requirement' => 'box12_fatca',
            '13_date_of_payment' => 'box13_date_payment',
            '14_state_tax_withheld' => 'box14_state_tax',
            'state_tax_withheld' => 'box14_state_tax',
            '15_state' => 'box15_state',
            'state_payer_state_no' => 'box15_state',
            'state_payer_state_number' => 'box15_state',
            '16_state_distribution' => 'box16_state_distribution',
        ],
        '1099_b' => [
            'b_total_proceeds' => 'total_proceeds',
            'b_total_cost' => 'total_cost_basis',
            'b_total_cost_basis' => 'total_cost_basis',
            'b_total_wash_sale_disallowed' => 'total_wash_sale_disallowed',
            'b_total_wash_sales' => 'total_wash_sale_disallowed',
            'b_total_gain_loss' => 'total_realized_gain_loss',
            'total_gain_loss' => 'total_realized_gain_loss',
            'wash_sale_basis_treatment' => 'wash_sale_treatment',
            'wash_sale_reporting_treatment' => 'wash_sale_treatment',
            'supplemental' => 'supplemental_statement',
            'supplemental_broker_statement' => 'supplemental_statement',
            'broker_supplemental_statement' => 'supplemental_statement',
        ],
    ];

    /**
     * @var array<string, string[]>
     */
    private const CANONICAL_KEYS_BY_FORM = [
        '1099_int' => [
            'payer_name', 'payer_tin', 'recipient_name', 'recipient_tin', 'account_number',
            'box1_interest', 'box2_early_withdrawal', 'box3_savings_bond', 'box4_fed_tax',
            'box5_investment_expense', 'box6_foreign_tax', 'box7_foreign_country',
            'box8_tax_exempt', 'box9_private_activity', 'box10_market_discount',
            'box11_bond_premium', 'box12_treasury_premium', 'box13_tax_exempt_premium',
        ],
        '1099_div' => [
            'payer_name', 'payer_tin', 'recipient_name', 'recipient_tin', 'account_number',
            'box1a_ordinary', 'box1b_qualified', 'box2a_cap_gain', 'box2b_unrecap_1250',
            'box2c_section_1202', 'box2d_collectibles', 'box2e_section_897_ordinary',
            'box2f_section_897_cap_gain', 'box3_nondividend', 'box4_fed_tax',
            'box5_section_199a', 'box6_investment_expense', 'box7_foreign_tax',
            'box8_foreign_country', 'box9_cash_liquidation', 'box10_noncash_liquidation',
            'box11_exempt_interest', 'box12_private_activity', 'box14_state_tax',
        ],
        '1099_misc' => [
            'payer_name', 'payer_tin', 'recipient_name', 'recipient_tin', 'account_number',
            'box1_rents', 'box2_royalties', 'box3_other_income', 'box4_fed_tax',
            'box5_fishing_boat', 'box6_medical', 'box7_direct_sales_indicator',
            'box8_substitute_payments', 'box9_crop_insurance', 'box10_gross_proceeds_attorney',
            'box11_fish_purchased', 'box12_section_409a_deferrals', 'box13_fatca_filing',
            'box14_excess_golden_parachute', 'box15_nonqualified_deferred', 'box15_state',
            'box16_state_tax',
        ],
        '1099_r' => [
            'payer_name', 'payer_tin', 'recipient_name', 'recipient_tin', 'recipient_tin_last4',
            'distribution_type', 'account_number', 'box1_gross_distribution',
            'box2a_taxable_amount', 'box2b_taxable_not_determined', 'box2b_total_distribution',
            'box3_capital_gain', 'box4_fed_tax', 'box5_employee_contributions',
            'box6_net_unrealized_appreciation', 'box7_distribution_code',
            'box7_ira_sep_simple', 'box8_other', 'box9a_percentage',
            'box9b_employee_contributions', 'box10_amount_allocable_irr',
            'box11_first_year_roth', 'box12_fatca', 'box13_date_payment',
            'box14_state_tax', 'box15_state', 'box16_state_distribution',
        ],
        '1099_b' => [
            'payer_name', 'payer_tin', 'recipient_name', 'recipient_tin', 'account_number',
            'total_proceeds', 'total_cost_basis', 'total_wash_sale_disallowed',
            'total_realized_gain_loss', 'wash_sale_treatment', 'summary', 'transactions', 'supplemental_statement',
            'extraction_notes',
        ],
    ];

    /**
     * @var string[]
     */
    private const SUPPLEMENTAL_KEYS = [
        'detail_totals',
        'foreign_income_and_taxes_summary',
        'extraction_notes',
        'fatca_filing_requirement',
    ];

    /**
     * @return array<string, mixed>
     */
    public function documentForResponse(FileForTaxDocument $doc, bool $includeOriginal = false): array
    {
        $normalized = $this->normalizeDocument($doc);

        $payload = $doc->toArray();
        $payload['parsed_data'] = $normalized['parsed_data'];
        $payload['parsed_data_warnings'] = $normalized['parent_warnings'];
        $payload['parsed_data_needs_review'] = $normalized['parent_warnings'] !== [];
        $payload['has_original_parsed_data'] = $normalized['raw_parsed_data'] !== null && $normalized['raw_parsed_data'] !== $normalized['parsed_data'];

        if (isset($payload['account_links']) && is_array($payload['account_links'])) {
            foreach ($payload['account_links'] as &$linkPayload) {
                if (! is_array($linkPayload) || ! isset($linkPayload['id'])) {
                    continue;
                }

                $linkPayload['document_id'] ??= (int) $doc->document_id;
                $linkPayload['tax_document_id'] ??= (int) $doc->id;
                $linkWarnings = $normalized['warnings_by_link'][(int) $linkPayload['id']] ?? ($linkPayload['parsed_data_warnings'] ?? []);
                $linkPayload['parsed_data_warnings'] = $linkWarnings;
                $linkPayload['parsed_data_needs_review'] = $linkWarnings !== [];
                $linkPayload['has_original_parsed_data'] = $linkWarnings !== [];
            }
            unset($linkPayload);
        }

        if ($includeOriginal && $payload['has_original_parsed_data']) {
            $payload['original_parsed_data'] = $normalized['raw_parsed_data'];
        }

        return $payload;
    }

    /**
     * @param  iterable<int, FileForTaxDocument>  $docs
     * @return array<int, array<string, mixed>>
     */
    public function documentsForResponse(iterable $docs, bool $includeOriginal = false): array
    {
        $rows = [];

        foreach ($docs as $doc) {
            $rows[] = $this->documentForResponse($doc, $includeOriginal);
        }

        return $rows;
    }

    public function persistReviewFlagsForDocument(FileForTaxDocument $doc): void
    {
        $normalized = $this->normalizeDocument($doc);

        $this->persistReviewFlags($doc, $normalized['parent_warnings'], $normalized['warnings_by_link']);
    }

    /**
     * @return array{
     *     parsed_data: mixed,
     *     raw_parsed_data: array<mixed>|null,
     *     parent_warnings: array<int, array<string, string>>,
     *     warnings_by_link: array<int, array<int, array<string, string>>>
     * }
     */
    private function normalizeDocument(FileForTaxDocument $doc): array
    {
        $doc->loadMissing('accountLinks.account');

        $rawParsedData = $this->rawParsedData($doc);
        $parsedData = $this->shouldPreferRawParsedData($doc->form_type)
            ? ($rawParsedData ?? $doc->parsed_data)
            : $doc->parsed_data;
        /** @var array<int, array<int, array<string, string>>> $warningsByLink */
        $warningsByLink = [];

        [$canonical, $parentWarnings, $warningsByEntry] = $this->normalizeContainer($doc->form_type, $parsedData);

        if ($warningsByEntry !== [] && is_array($parsedData) && array_is_list($parsedData)) {
            foreach ($parsedData as $index => $entry) {
                if (! is_array($entry)) {
                    continue;
                }

                $entryWarnings = $warningsByEntry[$index] ?? [];
                $link = $this->findMatchingLink($entry, $doc->accountLinks);
                if ($link instanceof TaxDocumentAccount) {
                    $linkId = (int) $link->id;
                    $warningsByLink[$linkId] = $this->dedupeWarnings(array_merge($warningsByLink[$linkId] ?? [], $entryWarnings));
                } else {
                    $parentWarnings = array_merge($parentWarnings, $entryWarnings);
                }
            }
        }

        return [
            'parsed_data' => $canonical,
            'raw_parsed_data' => $rawParsedData,
            'parent_warnings' => $this->dedupeWarnings($parentWarnings),
            'warnings_by_link' => $warningsByLink,
        ];
    }

    private function shouldPreferRawParsedData(string $formType): bool
    {
        return $this->baseFormType($formType) !== $formType
            || $formType === 'broker_1099'
            || isset(self::CANONICAL_KEYS_BY_FORM[$formType]);
    }

    /**
     * @return array{0: mixed, 1: array<int, array<string, string>>, 2: array<int, array<int, array<string, string>>>}
     */
    public function normalizeContainer(string $formType, mixed $parsedData): array
    {
        if (! is_array($parsedData)) {
            return [$parsedData, [], []];
        }

        if ($formType === 'broker_1099' && array_is_list($parsedData)) {
            $canonical = [];
            $warningsByEntry = [];
            foreach ($parsedData as $index => $entry) {
                if (! is_array($entry)) {
                    $canonical[] = $entry;
                    $warningsByEntry[$index] = [$this->warning((string) $index, 'unsupported_entry', 'Stored but not used by Tax Preview.')];

                    continue;
                }

                $entryFormType = $this->baseFormType((string) ($entry['form_type'] ?? ''));
                [$entryData, $entryWarnings] = $this->normalizeLeaf($entryFormType, $entry['parsed_data'] ?? null, "accounts.{$index}.parsed_data");
                $entry['parsed_data'] = $entryData;
                $canonical[] = $entry;
                $warningsByEntry[$index] = $entryWarnings;
            }

            return [$canonical, [], $warningsByEntry];
        }

        [$canonical, $warnings] = $this->normalizeLeaf($this->baseFormType($formType), $parsedData, 'parsed_data');

        return [$canonical, $warnings, []];
    }

    /**
     * @return array<string, mixed>|mixed
     */
    public function canonicalParsedDataForForm(string $formType, mixed $parsedData): mixed
    {
        [$canonical] = $this->normalizeLeaf($this->baseFormType($formType), $parsedData, 'parsed_data');

        return $canonical;
    }

    /**
     * @return array{0: mixed, 1: array<int, array<string, string>>}
     */
    private function normalizeLeaf(string $formType, mixed $parsedData, string $pathPrefix): array
    {
        $canonicalKeyList = $this->canonicalKeysForForm($formType);
        if (! is_array($parsedData) || $canonicalKeyList === null) {
            return [$parsedData, []];
        }

        $canonical = [];
        $warnings = [];
        $canonicalKeys = array_flip($canonicalKeyList);
        $aliases = array_merge(self::COMMON_ALIASES, $this->aliasesForForm($formType));
        $consumed = [];

        foreach (array_keys($canonicalKeys) as $key) {
            if (array_key_exists($key, $parsedData)) {
                $canonical[$key] = $parsedData[$key];
                $consumed[$key] = true;
            }
        }

        foreach ($aliases as $sourceKey => $targetKey) {
            if (! array_key_exists($sourceKey, $parsedData)) {
                continue;
            }

            if (! array_key_exists($targetKey, $canonical)) {
                $canonical[$targetKey] = $parsedData[$sourceKey];
                $message = "Canonicalized to {$targetKey}.";
            } else {
                $message = "Alias maps to {$targetKey}; existing canonical value was preserved.";
            }

            $warnings[] = $this->warning("{$pathPrefix}.{$sourceKey}", 'canonicalized_alias', $message);
            $consumed[$sourceKey] = true;
        }

        if (isset($parsedData['boxes']) && is_array($parsedData['boxes'])) {
            foreach ($parsedData['boxes'] as $sourceKey => $value) {
                if (! is_string($sourceKey)) {
                    continue;
                }

                $targetKey = $aliases[$sourceKey] ?? null;
                if ($targetKey !== null) {
                    if (! array_key_exists($targetKey, $canonical)) {
                        $canonical[$targetKey] = $value;
                        $message = "Canonicalized to {$targetKey}.";
                    } else {
                        $message = "Alias maps to {$targetKey}; existing canonical value was preserved.";
                    }

                    $warnings[] = $this->warning("{$pathPrefix}.boxes.{$sourceKey}", 'canonicalized_alias', $message);

                    continue;
                }

                $warnings[] = $this->warning("{$pathPrefix}.boxes.{$sourceKey}", 'unsupported_field', 'Stored but not used by Tax Preview.');
            }
            $consumed['boxes'] = true;
        }

        foreach (self::SUPPLEMENTAL_KEYS as $key) {
            if (array_key_exists($key, $parsedData)) {
                $canonical[$key] = $parsedData[$key];
                $consumed[$key] = true;
            }
        }

        foreach ($parsedData as $key => $value) {
            if (! is_string($key) || isset($consumed[$key]) || isset($canonicalKeys[$key]) || isset($aliases[$key])) {
                continue;
            }

            $warnings[] = $this->warning("{$pathPrefix}.{$key}", 'unsupported_field', 'Stored but not used by Tax Preview.');
        }

        return [$canonical, $this->dedupeWarnings($warnings)];
    }

    private function baseFormType(string $formType): string
    {
        return match ($formType) {
            '1099_int_c' => '1099_int',
            '1099_div_c' => '1099_div',
            '1099_b_c' => '1099_b',
            default => $formType,
        };
    }

    /**
     * @return string[]|null
     */
    private function canonicalKeysForForm(string $formType): ?array
    {
        if ($formType !== 'broker_1099') {
            return self::CANONICAL_KEYS_BY_FORM[$formType] ?? null;
        }

        return array_values(array_unique(array_merge(
            self::CANONICAL_KEYS_BY_FORM['1099_int'],
            self::CANONICAL_KEYS_BY_FORM['1099_div'],
            self::CANONICAL_KEYS_BY_FORM['1099_misc'],
            self::CANONICAL_KEYS_BY_FORM['1099_r'],
            self::CANONICAL_KEYS_BY_FORM['1099_b'],
        )));
    }

    /**
     * @return array<string, string>
     */
    private function aliasesForForm(string $formType): array
    {
        if ($formType !== 'broker_1099') {
            return self::ALIASES_BY_FORM[$formType] ?? [];
        }

        return array_merge(
            self::ALIASES_BY_FORM['1099_int'],
            self::ALIASES_BY_FORM['1099_div'],
            self::ALIASES_BY_FORM['1099_misc'],
            self::ALIASES_BY_FORM['1099_r'],
            self::ALIASES_BY_FORM['1099_b'],
        );
    }

    /**
     * @return array<mixed>|null
     */
    private function rawParsedData(FileForTaxDocument $doc): ?array
    {
        $raw = $doc->getRawOriginal('parsed_data');
        if (! is_string($raw) || $raw === '') {
            return null;
        }

        $decoded = json_decode($raw, true);

        return is_array($decoded) ? $decoded : null;
    }

    /**
     * @param  array<string, mixed>  $entry
     * @param  iterable<int, mixed>  $links
     */
    private function findMatchingLink(array $entry, iterable $links): ?TaxDocumentAccount
    {
        $candidates = [];
        foreach ($links as $link) {
            if ($link instanceof TaxDocumentAccount && $link->form_type === ($entry['form_type'] ?? null)) {
                $candidates[] = $link;
            }
        }

        if (count($candidates) === 1) {
            return $candidates[0];
        }

        $identifier = $this->nonEmptyString($entry['account_identifier'] ?? null);
        $identified = $identifier === null ? [] : $this->matchingLinks(
            $candidates,
            static fn (TaxDocumentAccount $link): bool => $link->ai_identifier === $identifier,
        );
        if (count($identified) === 1) {
            return $identified[0];
        }

        $accountName = $this->nonEmptyString($entry['account_name'] ?? null);
        $named = $accountName === null ? [] : $this->matchingLinks(
            $candidates,
            static fn (TaxDocumentAccount $link): bool => $link->ai_account_name === $accountName,
        );

        return count($named) === 1 ? $named[0] : null;
    }

    /**
     * @param  array<int, TaxDocumentAccount>  $links
     * @param  callable(TaxDocumentAccount): bool  $callback
     * @return array<int, TaxDocumentAccount>
     */
    private function matchingLinks(array $links, callable $callback): array
    {
        return array_values(array_filter($links, $callback));
    }

    private function nonEmptyString(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }

    /**
     * @param  array<int, array<string, string>>  $parentWarnings
     * @param  array<int, array<int, array<string, string>>>  $warningsByLink
     */
    private function persistReviewFlags(FileForTaxDocument $doc, array $parentWarnings, array $warningsByLink): void
    {
        $parentNeedsReview = $parentWarnings !== [];
        if ((bool) $doc->parsed_data_needs_review !== $parentNeedsReview || ($doc->parsed_data_warnings ?? []) !== $parentWarnings) {
            $doc->forceFill([
                'parsed_data_needs_review' => $parentNeedsReview,
                'parsed_data_warnings' => $parentWarnings === [] ? null : $parentWarnings,
            ])->saveQuietly();
        }

        foreach ($doc->accountLinks as $link) {
            if (! $link instanceof TaxDocumentAccount) {
                continue;
            }

            $warnings = $warningsByLink[$link->id] ?? [];
            $needsReview = $warnings !== [];
            if ((bool) $link->parsed_data_needs_review === $needsReview && ($link->parsed_data_warnings ?? []) === $warnings) {
                continue;
            }

            $link->forceFill([
                'parsed_data_needs_review' => $needsReview,
                'parsed_data_warnings' => $warnings === [] ? null : $warnings,
            ])->saveQuietly();
        }
    }

    /**
     * @return array<string, string>
     */
    private function warning(string $path, string $code, string $message): array
    {
        return [
            'path' => $path,
            'code' => $code,
            'message' => $message,
        ];
    }

    /**
     * @param  array<int, array<string, string>>  $warnings
     * @return array<int, array<string, string>>
     */
    private function dedupeWarnings(array $warnings): array
    {
        $seen = [];

        return array_values(array_filter($warnings, static function (array $warning) use (&$seen): bool {
            $key = implode('|', [$warning['path'] ?? '', $warning['code'] ?? '', $warning['message'] ?? '']);
            if (isset($seen[$key])) {
                return false;
            }

            $seen[$key] = true;

            return true;
        }));
    }
}
