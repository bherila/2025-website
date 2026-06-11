<?php

namespace App\Http\Requests\Agent\CareerComparison;

use App\Http\Requests\FinancialPlanning\ComputeCareerCompRequest;

class AgentComputeCareerCompRequest extends ComputeCareerCompRequest
{
    use ReturnsAgentValidationErrors;
}
