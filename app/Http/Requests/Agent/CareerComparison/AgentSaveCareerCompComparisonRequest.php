<?php

namespace App\Http\Requests\Agent\CareerComparison;

use App\Http\Requests\FinancialPlanning\SaveCareerCompComparisonRequest;

class AgentSaveCareerCompComparisonRequest extends SaveCareerCompComparisonRequest
{
    use ReturnsAgentValidationErrors;
}
