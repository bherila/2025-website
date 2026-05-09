<?php

namespace App\Services\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use InvalidArgumentException;

class Broker1099ParsedDataShapeService
{
    /**
     * @var array<string, string[]>
     */
    private const SIGNIFICANT_KEYS_BY_FORM = [
        '1099_div' => [
            'box1a_ordinary',
            'box1b_qualified',
            'box2a_cap_gain',
            'box2b_unrecap_1250',
            'box2c_section_1202',
            'box2d_collectibles',
            'box2e_section_897_ordinary',
            'box2f_section_897_cap_gain',
            'box3_nondividend',
            'box4_fed_tax',
            'box5_section_199a',
            'box6_investment_expense',
            'box7_foreign_tax',
            'box9_cash_liquidation',
            'box10_noncash_liquidation',
            'box11_exempt_interest',
            'box12_private_activity',
            'box14_state_tax',
        ],
        '1099_int' => [
            'box1_interest',
            'box2_early_withdrawal',
            'box3_savings_bond',
            'box4_fed_tax',
            'box5_investment_expense',
            'box6_foreign_tax',
            'box8_tax_exempt',
            'box9_private_activity',
            'box10_market_discount',
            'box11_bond_premium',
            'box12_treasury_premium',
            'box13_tax_exempt_premium',
        ],
        '1099_misc' => [
            'box1_rents',
            'box2_royalties',
            'box3_other_income',
            'box4_fed_tax',
            'box8_substitute_payments',
        ],
        '1099_b' => [
            'total_proceeds',
            'total_cost_basis',
            'total_wash_sale_disallowed',
            'total_realized_gain_loss',
            'summary',
            'transactions',
            'supplemental_statement',
        ],
    ];

    public function __construct(
        private TaxDocumentParsedDataNormalizer $normalizer,
    ) {}

    public function isLegacyFlatBrokerDocument(FileForTaxDocument $doc): bool
    {
        return (string) $doc->getAttribute('form_type') === 'broker_1099'
            && is_array($doc->parsed_data)
            && ! array_is_list($doc->parsed_data);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function convertLegacyFlatDocument(FileForTaxDocument $doc): array
    {
        if (! $this->isLegacyFlatBrokerDocument($doc)) {
            throw new InvalidArgumentException('This broker 1099 is already stored in the current multi-entry format.');
        }

        $doc->loadMissing('accountLinks.account');

        /** @var array<string, mixed> $rawData */
        $rawData = $doc->parsed_data;
        $entries = [];

        foreach (self::SIGNIFICANT_KEYS_BY_FORM as $formType => $significantKeys) {
            $canonical = $this->normalizer->canonicalParsedDataForForm($formType, $rawData);
            if (! is_array($canonical) || ! $this->hasSignificantValue($canonical, $significantKeys)) {
                continue;
            }

            if ($formType === '1099_b' && ! isset($canonical['transactions'])) {
                $canonical['transactions'] = [];
            }

            $link = $this->firstLinkForForm($doc->accountLinks, $formType);
            $entries[] = [
                'account_identifier' => $this->accountIdentifier($rawData, $link),
                'account_name' => $this->accountName($rawData, $link),
                'form_type' => $formType,
                'tax_year' => (int) $doc->tax_year,
                'parsed_data' => $canonical,
            ];
        }

        if ($entries === []) {
            throw new InvalidArgumentException('No convertible 1099-INT, 1099-DIV, 1099-MISC, or 1099-B fields were found.');
        }

        return $entries;
    }

    /**
     * @param  iterable<int, mixed>  $links
     */
    private function firstLinkForForm(iterable $links, string $formType): ?TaxDocumentAccount
    {
        foreach ($links as $link) {
            if ($link instanceof TaxDocumentAccount && $link->form_type === $formType) {
                return $link;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  string[]  $keys
     */
    private function hasSignificantValue(array $data, array $keys): bool
    {
        foreach ($keys as $key) {
            if (! array_key_exists($key, $data)) {
                continue;
            }

            if (! $this->isEmptyExtractedValue($data[$key])) {
                return true;
            }
        }

        return false;
    }

    private function isEmptyExtractedValue(mixed $value): bool
    {
        if ($value === null || $value === '') {
            return true;
        }

        if (is_numeric($value)) {
            return (float) $value === 0.0;
        }

        if (is_array($value)) {
            return $value === [];
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function accountIdentifier(array $data, ?TaxDocumentAccount $link): ?string
    {
        if ($link instanceof TaxDocumentAccount && $link->ai_identifier !== null) {
            return $link->ai_identifier;
        }

        return $this->nonEmptyString($data['account_number'] ?? null)
            ?? $this->nonEmptyString($data['account_identifier'] ?? null);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function accountName(array $data, ?TaxDocumentAccount $link): ?string
    {
        if ($link instanceof TaxDocumentAccount) {
            if ($link->ai_account_name !== null) {
                return $link->ai_account_name;
            }

            $account = $link->relationLoaded('account') ? $link->getRelation('account') : null;
            if ($account instanceof FinAccounts) {
                return $account->acct_name;
            }
        }

        return $this->nonEmptyString($data['account_name'] ?? null)
            ?? $this->nonEmptyString($data['payer_name'] ?? null);
    }

    private function nonEmptyString(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }
}
