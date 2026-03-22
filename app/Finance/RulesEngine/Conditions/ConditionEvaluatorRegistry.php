<?php

namespace App\Finance\RulesEngine\Conditions;

use InvalidArgumentException;

class ConditionEvaluatorRegistry
{
    /** @var array<string, RuleConditionEvaluatorInterface> */
    private array $evaluators = [];

    public function __construct()
    {
        $this->register('amount', new AmountConditionEvaluator);
        $this->register('stock_symbol_presence', new StockSymbolConditionEvaluator);
        $this->register('option_type', new OptionTypeConditionEvaluator);
        $this->register('account_id', new AccountConditionEvaluator);
        $this->register('direction', new DirectionConditionEvaluator);
        $this->register('description_contains', new DescriptionContainsConditionEvaluator);
    }

    public function register(string $type, RuleConditionEvaluatorInterface $evaluator): void
    {
        $this->evaluators[$type] = $evaluator;
    }

    public function get(string $type): RuleConditionEvaluatorInterface
    {
        if (! isset($this->evaluators[$type])) {
            throw new InvalidArgumentException("Unknown condition type: {$type}");
        }

        return $this->evaluators[$type];
    }

    public function has(string $type): bool
    {
        return isset($this->evaluators[$type]);
    }
}
