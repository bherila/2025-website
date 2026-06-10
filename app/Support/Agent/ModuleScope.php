<?php

namespace App\Support\Agent;

use InvalidArgumentException;

/**
 * Static module → feature-permission map used to scope quick-setup agent
 * tokens. Deliberately NOT derived from the capability registry: the registry
 * fills up across later PRs and the `tax` module's permissions are
 * `finance.*`-prefixed keys.
 *
 * `finance.rules.manage` and `finance.config.manage` are deliberately
 * excluded from agent token scope.
 */
final class ModuleScope
{
    public const MODULES = [
        'finance' => [
            'finance.access', 'finance.accounts.basic', 'finance.accounts.detail', 'finance.accounts.manage',
            'finance.transactions.view', 'finance.transactions.import', 'finance.transactions.manage',
            'finance.lots.view', 'finance.lots.manage',
            'finance.tax-preview.view', 'finance.tax-preview.manage', 'finance.tax-preview.export',
            'finance.tax-documents.view', 'finance.tax-documents.manage',
            'finance.rsu.view', 'finance.rsu.manage',
            'finance.payslips.view', 'finance.payslips.manage',
        ],
        'tax' => [
            'finance.access',
            'finance.tax-preview.view', 'finance.tax-preview.manage', 'finance.tax-preview.export',
            'finance.tax-documents.view', 'finance.tax-documents.manage',
        ],
        'career-comparison' => [
            'financial-planning.career-comparison.private',
            'finance.rsu.view',
        ],
    ];

    /** @return list<string> */
    public static function permissions(string $module): array
    {
        if (! array_key_exists($module, self::MODULES)) {
            throw new InvalidArgumentException("Unknown agent module [{$module}].");
        }

        return self::MODULES[$module];
    }

    /** @return list<string> */
    public static function modules(): array
    {
        return array_keys(self::MODULES);
    }
}
