<?php

namespace App\Mcp\Tools;

use App\Services\Finance\ScheduleCSummaryService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Tool;

#[Description('Get Schedule C self-employment income/expense summary. Returns totals grouped by year and tax characteristic. Optionally filter by year.')]
class GetScheduleC extends Tool
{
    public function __construct(
        private ScheduleCSummaryService $service,
    ) {}

    public function handle(Request $request): Response
    {
        $year = $request->input('year');
        $yearFilter = null;
        if (is_numeric($year)) {
            $parsed = (int) $year;
            $yearFilter = $parsed > 0 ? $parsed : null;
        }

        $data = $this->service->getSummary((int) Auth::id(), $yearFilter);

        return Response::json($data);
    }

    /**
     * @return array<string, JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'year' => $schema->integer()->description('Filter to a specific year')->nullable(),
        ];
    }
}
