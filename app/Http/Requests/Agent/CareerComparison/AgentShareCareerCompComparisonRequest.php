<?php

namespace App\Http\Requests\Agent\CareerComparison;

use App\Http\Requests\FinancialPlanning\ShareCareerCompComparisonRequest;

class AgentShareCareerCompComparisonRequest extends ShareCareerCompComparisonRequest
{
    use ReturnsAgentValidationErrors;
}
