<?php

namespace App\Support\Access;

use InvalidArgumentException;

class FeatureRegistry
{
    /**
     * @return array<string, array{label: string, description: string, depends: list<string>, category: string}>
     */
    public function all(): array
    {
        return [
            'finance.access' => ['label' => 'Finance', 'description' => 'Access the private Finance shell.', 'depends' => [], 'category' => 'Finance'],
            'finance.accounts.basic' => ['label' => 'Accounts: basic metadata', 'description' => 'Account IDs, names, types, and closed state for selectors and dependent Finance features.', 'depends' => ['finance.access'], 'category' => 'Finance / Accounts'],
            'finance.accounts.detail' => ['label' => 'Accounts: detailed view', 'description' => 'Account dashboard, balances, statements, summaries, fees, and basis read views.', 'depends' => ['finance.accounts.basic'], 'category' => 'Finance / Accounts'],
            'finance.accounts.manage' => ['label' => 'Accounts: manage', 'description' => 'Create, rename, delete, and maintain accounts, flags, statements, and balance snapshots.', 'depends' => ['finance.accounts.detail'], 'category' => 'Finance / Accounts'],
            'finance.transactions.view' => ['label' => 'Transactions: view', 'description' => 'Transaction list/detail pages and read APIs.', 'depends' => ['finance.accounts.basic'], 'category' => 'Finance / Transactions'],
            'finance.transactions.import' => ['label' => 'Transactions: import', 'description' => 'Transaction import pages and CSV/IB/GenAI transaction imports.', 'depends' => ['finance.transactions.view'], 'category' => 'Finance / Transactions'],
            'finance.transactions.manage' => ['label' => 'Transactions: manage', 'description' => 'Create, edit, delete, batch update/delete, dedupe, link, tag, and run transaction rules.', 'depends' => ['finance.transactions.view'], 'category' => 'Finance / Transactions'],
            'finance.lots.view' => ['label' => 'Lots: view', 'description' => 'Lots pages, lot read APIs, and reconciliation read views.', 'depends' => ['finance.accounts.basic'], 'category' => 'Finance / Lots'],
            'finance.lots.manage' => ['label' => 'Lots: manage', 'description' => 'Lot import, edit, delete, matching, rebuild, and reconciliation writes.', 'depends' => ['finance.lots.view'], 'category' => 'Finance / Lots'],
            'finance.tax-preview.view' => ['label' => 'Tax Preview: view', 'description' => 'Tax Preview page, datasets, readiness, and reconciliation summaries.', 'depends' => ['finance.accounts.basic'], 'category' => 'Finance / Tax Preview'],
            'finance.tax-preview.manage' => ['label' => 'Tax Preview: manage', 'description' => 'Tax states, deductions, adjustments, carryforwards, and tax input edits.', 'depends' => ['finance.tax-preview.view'], 'category' => 'Finance / Tax Preview'],
            'finance.tax-preview.export' => ['label' => 'Tax Preview: export', 'description' => 'Tax Preview PDF/XLSX exports.', 'depends' => ['finance.tax-preview.view'], 'category' => 'Finance / Tax Preview'],
            'finance.tax-documents.view' => ['label' => 'Tax Documents: view', 'description' => 'Tax document list, detail, download, and impact preview.', 'depends' => ['finance.accounts.basic'], 'category' => 'Finance / Tax Documents'],
            'finance.tax-documents.manage' => ['label' => 'Tax Documents: manage', 'description' => 'Upload, manually enter, link, reprocess, review, convert, repair, and delete tax documents.', 'depends' => ['finance.tax-documents.view'], 'category' => 'Finance / Tax Documents'],
            'finance.rsu.view' => ['label' => 'RSU: view', 'description' => 'RSU pages and read APIs; Career Comparison RSU import source.', 'depends' => ['finance.access'], 'category' => 'Finance / RSU'],
            'finance.rsu.manage' => ['label' => 'RSU: manage', 'description' => 'Upsert/delete RSU grants and confirm/skip RSU GenAI imports.', 'depends' => ['finance.rsu.view'], 'category' => 'Finance / RSU'],
            'finance.payslips.view' => ['label' => 'Payslips: view', 'description' => 'Payslip pages and read APIs.', 'depends' => ['finance.access'], 'category' => 'Finance / Payslips'],
            'finance.payslips.manage' => ['label' => 'Payslips: manage', 'description' => 'Payslip entry, bulk save, delete, deposits, state data, and GenAI confirmation.', 'depends' => ['finance.payslips.view'], 'category' => 'Finance / Payslips'],
            'finance.rules.manage' => ['label' => 'Rules and tags: manage', 'description' => 'Tags/rules pages plus tag and rule CRUD. Applying tags to transactions still requires Transactions: manage.', 'depends' => ['finance.transactions.view'], 'category' => 'Finance / Transactions'],
            'finance.config.manage' => ['label' => 'Finance config: manage', 'description' => 'Finance configuration and settings page.', 'depends' => ['finance.access'], 'category' => 'Finance / Config'],
            'utility-bills.view' => ['label' => 'Utility Bills: view', 'description' => 'Utility Bill Tracker read access.', 'depends' => [], 'category' => 'Utility Bills'],
            'utility-bills.manage' => ['label' => 'Utility Bills: manage', 'description' => 'Create, edit, delete, import, and link utility bills.', 'depends' => ['utility-bills.view'], 'category' => 'Utility Bills'],
            'financial-planning.career-comparison.private' => ['label' => 'Career Comparison: private', 'description' => 'Authenticated latest/share-management Career Comparison features.', 'depends' => [], 'category' => 'Financial Planning'],
        ];
    }

    public function exists(string $permission): bool
    {
        return array_key_exists($permission, $this->all());
    }

    /**
     * @return list<string>
     */
    public function keys(): array
    {
        return array_keys($this->all());
    }

    /**
     * @return list<string>
     */
    public function dependenciesFor(string $permission): array
    {
        $features = $this->all();

        if (! isset($features[$permission])) {
            throw new InvalidArgumentException("Unknown feature permission [{$permission}].");
        }

        return $features[$permission]['depends'];
    }

    /**
     * @param  list<string>  $directPermissions
     * @return list<string>
     */
    public function resolveEffective(array $directPermissions): array
    {
        $resolved = [];
        $visiting = [];

        $visit = function (string $permission) use (&$visit, &$resolved, &$visiting): void {
            if (isset($resolved[$permission])) {
                return;
            }

            if (isset($visiting[$permission])) {
                throw new InvalidArgumentException("Circular feature dependency involving [{$permission}].");
            }

            $visiting[$permission] = true;
            foreach ($this->dependenciesFor($permission) as $dependency) {
                $visit($dependency);
            }
            unset($visiting[$permission]);

            $resolved[$permission] = true;
        };

        foreach (array_values(array_unique($directPermissions)) as $permission) {
            $visit($permission);
        }

        return array_keys($resolved);
    }

    /**
     * @return array<string, list<array{permission: string, label: string, description: string, depends: list<string>, category: string}>>
     */
    public function grouped(): array
    {
        $grouped = [];
        foreach ($this->all() as $permission => $definition) {
            $grouped[$definition['category']][] = [
                'permission' => $permission,
                ...$definition,
            ];
        }

        ksort($grouped);

        return $grouped;
    }
}
