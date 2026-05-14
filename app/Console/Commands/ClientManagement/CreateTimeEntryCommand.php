<?php

namespace App\Console\Commands\ClientManagement;

use App\Exceptions\ClientManagement\ClientManagementActionException;
use App\Services\ClientManagement\ClientTimeEntryService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Support\Facades\Validator;

#[Signature('client-management:create-time-entry
    {client : Client company id or slug.}
    {description : Time entry description. Quote descriptions with spaces.}
    {time : Time spent as decimal hours or h:mm, e.g. 1.5 or 1:30.}
    {date : Work date, e.g. 2026-05-14.}
    {--project= : Project id, slug, or exact name. Omit only when the client has one project.}
    {--billable=1 : Whether the entry is billable: 1/0, true/false, yes/no.}
    {--defer=0 : Whether to set the deferred billing flag: 1/0, true/false, yes/no.}
    {--category=Software Development : Time entry category/job type.}
    {--user=1 : Admin user id to act as and assign work to; defaults to uid 1.}
    {--format=table : Output format: table or json.}')]
#[Description('Create a client-management time entry, inferring the project only when unambiguous.')]
class CreateTimeEntryCommand extends BaseClientManagementCommand
{
    public function __construct(private readonly ClientTimeEntryService $timeEntryService)
    {
        parent::__construct();
    }

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $format = (string) $this->option('format');
        if (! in_array($format, ['table', 'json'], true)) {
            $this->error("Invalid --format value '{$format}'. Use 'table' or 'json'.");

            return self::FAILURE;
        }

        $user = $this->resolveAdminUser();
        if (! $user) {
            return self::FAILURE;
        }

        $company = $this->resolveCompany((string) $this->argument('client'));
        if (! $company) {
            return self::FAILURE;
        }

        $project = $this->resolveProject($company, $this->option('project') ? (string) $this->option('project') : null);
        if (! $project) {
            return self::FAILURE;
        }

        $payload = [
            'project_id' => $project->id,
            'name' => $this->argument('description'),
            'time' => $this->argument('time'),
            'date_worked' => $this->argument('date'),
            'user_id' => $user->id,
            'is_billable' => $this->parseBooleanOption('billable', true),
            'is_deferred_billing' => $this->parseBooleanOption('defer', false),
            'job_type' => $this->option('category') ?: 'Software Development',
        ];

        $validator = Validator::make($payload, [
            'project_id' => 'required|exists:client_projects,id',
            'name' => 'nullable|string|max:255',
            'time' => 'required|string',
            'date_worked' => 'required|date',
            'user_id' => 'required|exists:users,id',
            'is_billable' => 'boolean',
            'is_deferred_billing' => 'boolean',
            'job_type' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        try {
            $entry = $this->timeEntryService->create($company, $payload, $user);
        } catch (ClientManagementActionException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $data = [
            'time_entry_id' => $entry->id,
            'client_id' => $company->id,
            'client' => $company->company_name,
            'project_id' => $project->id,
            'project' => $project->name,
            'date_worked' => $entry->date_worked->toDateString(),
            'time' => $entry->formatted_time,
            'minutes_worked' => $entry->minutes_worked,
            'billable' => (bool) $entry->is_billable,
            'deferred' => (bool) $entry->is_deferred_billing,
            'category' => $entry->job_type,
            'description' => $entry->name,
        ];

        if ($format === 'json') {
            $this->outputJson($data);

            return self::SUCCESS;
        }

        $this->info('Time entry created.');
        $this->table(
            ['Entry ID', 'Client', 'Project', 'Date', 'Time', 'Billable', 'Deferred', 'Category', 'Description'],
            [[
                $data['time_entry_id'],
                $data['client'],
                $data['project'],
                $data['date_worked'],
                $data['time'],
                $data['billable'] ? 'yes' : 'no',
                $data['deferred'] ? 'yes' : 'no',
                $data['category'],
                $data['description'],
            ]]
        );

        return self::SUCCESS;
    }
}
