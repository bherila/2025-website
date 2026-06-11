<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\AuthorizesFeatureAccess;
use App\Mcp\Support\FiltersByFeature;
use App\Mcp\Support\RequiresFeature;
use App\Services\Finance\TaxReturnLineComparisonService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\JsonSchema\Types\Type;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tool;

#[Name('tax_compare_return_lines')]
#[Description('Compare CPA-prepared return line amounts (extracted locally by the agent — the return PDF is never uploaded or stored) against the tax preview totals for a year. Submit lines as {form, line, amount_cents}; amounts are integer cents. Returns matched/different/missing summary counts plus per-line discrepancies keyed by canonical routing ids like form_1040_line_1z.')]
class CompareReturnLines extends Tool implements RequiresFeature
{
    use AuthorizesFeatureAccess;
    use FiltersByFeature;

    public static function requiredFeature(): ?string
    {
        return 'finance.tax-preview.view';
    }

    public function __construct(
        private TaxReturnLineComparisonService $service,
    ) {}

    public function handle(Request $request): Response
    {
        if (($denied = $this->requireFeaturePermission('finance.tax-preview.view')) !== null) {
            return $denied;
        }

        $year = (int) ($request->get('year') ?? date('Y'));
        $lines = $request->get('lines');

        if (! is_array($lines) || $lines === []) {
            return Response::error('lines must be a non-empty array of {form, line, amount_cents} objects.');
        }

        if (count($lines) > 500) {
            return Response::error('At most 500 return lines may be compared per request.');
        }

        foreach ($lines as $line) {
            if (! is_array($line) || ! isset($line['form'], $line['line']) || ! array_key_exists('amount_cents', $line)) {
                return Response::error('Each line must include form, line, and integer amount_cents.');
            }
        }

        $result = $this->service->compareForUser(
            (int) Auth::id(),
            $year,
            array_values($lines),
            (int) ($request->get('tolerance_cents') ?? 0),
            $request->get('return_type') !== null ? (string) $request->get('return_type') : null,
        );

        return Response::json($result);
    }

    /**
     * @return array<string, Type>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'year' => $schema->integer()->description('Tax year to compare against (defaults to current year)')->nullable(),
            'return_type' => $schema->string()->description('Free-form return descriptor, e.g. cpa_prepared_1040')->nullable(),
            'tolerance_cents' => $schema->integer()->description('Absolute per-line tolerance in cents before a delta counts as different (default 0)')->nullable(),
            'lines' => $schema->array()
                ->items($schema->object([
                    'form' => $schema->string()->description('Form label, e.g. "1040", "Schedule D", "8949"'),
                    'line' => $schema->string()->description('Line identifier, e.g. "1z", "16"'),
                    'label' => $schema->string()->description('Optional human label for the line')->nullable(),
                    'amount_cents' => $schema->integer()->description('Line amount in integer cents'),
                ]))
                ->description('Return lines extracted locally from the CPA-prepared return'),
        ];
    }
}
