<?php

namespace App\Finance\RulesEngine\Actions;

use InvalidArgumentException;

class ActionHandlerRegistry
{
    /** @var array<string, RuleActionHandlerInterface> */
    private array $handlers = [];

    public function __construct()
    {
        $this->register('add_tag', new AddTagActionHandler);
        $this->register('remove_tag', new RemoveTagActionHandler);
        $this->register('remove_all_tags', new RemoveAllTagsActionHandler);
        $this->register('find_replace', new FindReplaceActionHandler);
        $this->register('set_description', new SetDescriptionActionHandler);
        $this->register('set_memo', new SetMemoActionHandler);
        $this->register('negate_amount', new NegateAmountActionHandler);
        $this->register('stop_processing_if_match', new StopProcessingActionHandler);
    }

    public function register(string $type, RuleActionHandlerInterface $handler): void
    {
        $this->handlers[$type] = $handler;
    }

    public function get(string $type): RuleActionHandlerInterface
    {
        if (! isset($this->handlers[$type])) {
            throw new InvalidArgumentException("Unknown action type: {$type}");
        }

        return $this->handlers[$type];
    }

    public function has(string $type): bool
    {
        return isset($this->handlers[$type]);
    }
}
