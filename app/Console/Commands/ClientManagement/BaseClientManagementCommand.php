<?php

namespace App\Console\Commands\ClientManagement;

use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientProject;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;

abstract class BaseClientManagementCommand extends Command
{
    protected function resolveAdminUser(): ?User
    {
        $userId = (int) ($this->input->getOption('user') ?: 1);
        $user = User::find($userId);

        if (! $user) {
            $this->error("User ID {$userId} was not found.");

            return null;
        }

        if (! $user->hasRole('admin')) {
            $this->error("User ID {$userId} is not an admin user.");

            return null;
        }

        return $user;
    }

    protected function resolveCompany(string $client): ?ClientCompany
    {
        $company = ClientCompany::query()
            ->where('slug', $client)
            ->when(is_numeric($client), fn (Builder $query): Builder => $query->orWhere('id', (int) $client))
            ->first();

        if (! $company) {
            $this->error("Client '{$client}' was not found by id or slug.");

            return null;
        }

        return $company;
    }

    protected function resolveInvoice(string $invoiceRef): ?ClientInvoice
    {
        $invoice = ClientInvoice::query()
            ->with(['clientCompany', 'payments'])
            ->where('invoice_number', $invoiceRef)
            ->when(is_numeric($invoiceRef), fn (Builder $query): Builder => $query->orWhere('client_invoice_id', (int) $invoiceRef))
            ->first();

        if (! $invoice) {
            $this->error("Invoice '{$invoiceRef}' was not found by id or invoice number.");

            return null;
        }

        return $invoice;
    }

    protected function resolveProject(ClientCompany $company, ?string $projectRef): ?ClientProject
    {
        if ($projectRef === null || $projectRef === '') {
            $projects = $company->projects()->orderBy('name')->get();

            if ($projects->count() === 1) {
                return $projects->first();
            }

            $this->error("Client '{$company->slug}' has {$projects->count()} projects. Pass --project=<id|slug|name>.");

            return null;
        }

        $project = $company->projects()
            ->where(function (Builder $query) use ($projectRef): void {
                $query->where('slug', $projectRef)
                    ->orWhere('name', $projectRef);

                if (is_numeric($projectRef)) {
                    $query->orWhere('id', (int) $projectRef);
                }
            })
            ->first();

        if (! $project) {
            $this->error("Project '{$projectRef}' was not found for client '{$company->slug}'.");

            return null;
        }

        return $project;
    }

    protected function parseBooleanOption(string $option, bool $default): bool
    {
        $value = $this->option($option);

        if ($value === null) {
            return $default;
        }

        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    /**
     * @param  array<mixed>  $data
     */
    protected function outputJson(array $data): void
    {
        $this->line(json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }
}
