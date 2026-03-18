<?php

namespace App\Http\Controllers\FinanceTool;

use App\Finance\RulesEngine\Actions\ActionHandlerRegistry;
use App\Finance\RulesEngine\Conditions\ConditionEvaluatorRegistry;
use App\Finance\RulesEngine\TransactionRuleLoader;
use App\Finance\RulesEngine\TransactionRuleProcessor;
use App\Http\Controllers\Controller;
use App\Models\FinanceTool\FinRule;
use App\Models\FinanceTool\FinRuleAction;
use App\Models\FinanceTool\FinRuleCondition;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class FinanceRulesApiController extends Controller
{
    /**
     * List all rules for the current user.
     */
    public function index(): JsonResponse
    {
        $rules = FinRule::where('user_id', Auth::id())
            ->orderBy('order')
            ->with(['conditions', 'actions' => fn ($q) => $q->orderBy('order')])
            ->get();

        return response()->json(['data' => $rules]);
    }

    /**
     * Create a new rule.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'title' => 'required|string|max:255',
            'is_disabled' => 'boolean',
            'stop_processing_if_match' => 'boolean',
            'conditions' => 'array',
            'conditions.*.type' => 'required|string|in:amount,stock_symbol_presence,option_type,account_id,direction,description_contains',
            'conditions.*.operator' => 'required|string',
            'conditions.*.value' => 'nullable|string',
            'conditions.*.value_extra' => 'nullable|string',
            'actions' => 'array',
            'actions.*.type' => 'required|string|in:add_tag,remove_tag,remove_all_tags,find_replace,set_description,set_memo,negate_amount',
            'actions.*.target' => 'nullable|string',
            'actions.*.payload' => 'nullable|string',
            'actions.*.order' => 'required|integer',
        ]);

        $userId = Auth::id();

        // Determine next order value
        $maxOrder = FinRule::where('user_id', $userId)->max('order') ?? 0;

        $rule = FinRule::create([
            'user_id' => $userId,
            'order' => $maxOrder + 1,
            'title' => $request->input('title'),
            'is_disabled' => $request->boolean('is_disabled', false),
            'stop_processing_if_match' => $request->boolean('stop_processing_if_match', false),
        ]);

        // Create conditions
        if ($request->has('conditions')) {
            foreach ($request->input('conditions') as $condData) {
                FinRuleCondition::create([
                    'rule_id' => $rule->id,
                    'type' => $condData['type'],
                    'operator' => $condData['operator'],
                    'value' => $condData['value'] ?? null,
                    'value_extra' => $condData['value_extra'] ?? null,
                ]);
            }
        }

        // Create actions
        if ($request->has('actions')) {
            foreach ($request->input('actions') as $actData) {
                FinRuleAction::create([
                    'rule_id' => $rule->id,
                    'type' => $actData['type'],
                    'target' => $actData['target'] ?? null,
                    'payload' => $actData['payload'] ?? null,
                    'order' => $actData['order'],
                ]);
            }
        }

        $rule->load(['conditions', 'actions' => fn ($q) => $q->orderBy('order')]);

        return response()->json(['data' => $rule], 201);
    }

    /**
     * Update an existing rule.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $rule = FinRule::where('user_id', Auth::id())->findOrFail($id);

        $request->validate([
            'title' => 'required|string|max:255',
            'is_disabled' => 'boolean',
            'stop_processing_if_match' => 'boolean',
            'conditions' => 'array',
            'conditions.*.type' => 'required|string|in:amount,stock_symbol_presence,option_type,account_id,direction,description_contains',
            'conditions.*.operator' => 'required|string',
            'conditions.*.value' => 'nullable|string',
            'conditions.*.value_extra' => 'nullable|string',
            'actions' => 'array',
            'actions.*.type' => 'required|string|in:add_tag,remove_tag,remove_all_tags,find_replace,set_description,set_memo,negate_amount',
            'actions.*.target' => 'nullable|string',
            'actions.*.payload' => 'nullable|string',
            'actions.*.order' => 'required|integer',
        ]);

        $rule->update([
            'title' => $request->input('title'),
            'is_disabled' => $request->boolean('is_disabled', false),
            'stop_processing_if_match' => $request->boolean('stop_processing_if_match', false),
        ]);

        // Replace conditions
        $rule->conditions()->delete();
        if ($request->has('conditions')) {
            foreach ($request->input('conditions') as $condData) {
                FinRuleCondition::create([
                    'rule_id' => $rule->id,
                    'type' => $condData['type'],
                    'operator' => $condData['operator'],
                    'value' => $condData['value'] ?? null,
                    'value_extra' => $condData['value_extra'] ?? null,
                ]);
            }
        }

        // Replace actions
        $rule->actions()->delete();
        if ($request->has('actions')) {
            foreach ($request->input('actions') as $actData) {
                FinRuleAction::create([
                    'rule_id' => $rule->id,
                    'type' => $actData['type'],
                    'target' => $actData['target'] ?? null,
                    'payload' => $actData['payload'] ?? null,
                    'order' => $actData['order'],
                ]);
            }
        }

        $rule->load(['conditions', 'actions' => fn ($q) => $q->orderBy('order')]);

        return response()->json(['data' => $rule]);
    }

    /**
     * Delete (soft delete) a rule.
     */
    public function destroy(int $id): JsonResponse
    {
        $rule = FinRule::where('user_id', Auth::id())->findOrFail($id);
        $rule->delete();

        return response()->json(['success' => true]);
    }

    /**
     * Swap the order of two adjacent rules.
     */
    public function reorder(Request $request): JsonResponse
    {
        $request->validate([
            'rule_id' => 'required|integer',
            'direction' => 'required|string|in:up,down',
        ]);

        $userId = Auth::id();
        $rule = FinRule::where('user_id', $userId)->findOrFail($request->integer('rule_id'));

        $direction = $request->input('direction');

        if ($direction === 'up') {
            $adjacentRule = FinRule::where('user_id', $userId)
                ->where('order', '<', $rule->order)
                ->orderByDesc('order')
                ->first();
        } else {
            $adjacentRule = FinRule::where('user_id', $userId)
                ->where('order', '>', $rule->order)
                ->orderBy('order')
                ->first();
        }

        if (! $adjacentRule) {
            return response()->json(['error' => 'Cannot move rule further in that direction'], 400);
        }

        // Swap orders
        $tempOrder = $rule->order;
        $rule->update(['order' => $adjacentRule->order]);
        $adjacentRule->update(['order' => $tempOrder]);

        return response()->json(['success' => true]);
    }

    /**
     * Run a rule now against the latest 1000 transactions.
     */
    public function runNow(int $id): JsonResponse
    {
        $user = Auth::user();
        $rule = FinRule::where('user_id', $user->id)->findOrFail($id);

        $processor = new TransactionRuleProcessor(
            new TransactionRuleLoader,
            new ConditionEvaluatorRegistry,
            new ActionHandlerRegistry,
        );

        $summary = $processor->runRuleNow($rule, $user);

        return response()->json([
            'success' => true,
            'summary' => [
                'transactions_processed' => $summary->transactionsProcessed,
                'rules_matched' => $summary->rulesMatched,
                'actions_applied' => $summary->actionsApplied,
                'errors' => $summary->errors,
            ],
        ]);
    }

    /**
     * Preview transactions that match a rule's conditions without applying actions.
     * Accepts either a rule ID or rule data (conditions) in the request body.
     */
    public function previewMatches(Request $request): JsonResponse
    {
        $user = Auth::user();

        // If rule_id provided, load existing rule
        if ($request->has('rule_id')) {
            $rule = FinRule::where('user_id', $user->id)->findOrFail($request->integer('rule_id'));
        } else {
            // Create temporary rule from request data
            $request->validate([
                'conditions' => 'array',
                'conditions.*.type' => 'required|string|in:amount,stock_symbol_presence,option_type,account_id,direction,description_contains',
                'conditions.*.operator' => 'required|string',
                'conditions.*.value' => 'nullable|string',
                'conditions.*.value_extra' => 'nullable|string',
            ]);

            $rule = new FinRule([
                'user_id' => $user->id,
                'title' => 'Preview',
            ]);
            $rule->setRelation('conditions', collect());
            $rule->setRelation('actions', collect());

            if ($request->has('conditions')) {
                $conditions = collect($request->input('conditions'))->map(function ($condData) {
                    return new FinRuleCondition([
                        'type' => $condData['type'],
                        'operator' => $condData['operator'],
                        'value' => $condData['value'] ?? null,
                        'value_extra' => $condData['value_extra'] ?? null,
                    ]);
                });
                $rule->setRelation('conditions', $conditions);
            }
        }

        $processor = new TransactionRuleProcessor(
            new TransactionRuleLoader,
            new ConditionEvaluatorRegistry,
            new ActionHandlerRegistry,
        );

        $matchingTransactions = $processor->getMatchingTransactions($rule, $user);

        return response()->json([
            'success' => true,
            'count' => $matchingTransactions->count(),
            'transactions' => $matchingTransactions->map(fn ($tx) => [
                't_id' => $tx->t_id,
                't_date' => $tx->t_date,
                't_amt' => $tx->t_amt,
                't_description' => $tx->t_description,
                't_comment' => $tx->t_comment,
                't_symbol' => $tx->t_symbol,
                'opt_type' => $tx->opt_type,
            ])->values(),
        ]);
    }
}
