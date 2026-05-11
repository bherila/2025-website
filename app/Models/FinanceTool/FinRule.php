<?php

namespace App\Models\FinanceTool;

use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property-read Collection<int, FinRuleAction> $actions
 * @property-read Collection<int, FinRuleCondition> $conditions
 * @property-read Collection<int, FinRuleLog> $logs
 */
class FinRule extends Model
{
    protected $table = 'fin_rules';

    protected $fillable = [
        'user_id',
        'order',
        'title',
        'is_disabled',
        'stop_processing_if_match',
    ];

    protected $casts = [
        'is_disabled' => 'boolean',
        'stop_processing_if_match' => 'boolean',
        'order' => 'integer',
    ];

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return HasMany<FinRuleCondition, $this> */
    public function conditions(): HasMany
    {
        return $this->hasMany(FinRuleCondition::class, 'rule_id');
    }

    /** @return HasMany<FinRuleAction, $this> */
    public function actions(): HasMany
    {
        return $this->hasMany(FinRuleAction::class, 'rule_id')->orderBy('order');
    }

    /** @return HasMany<FinRuleLog, $this> */
    public function logs(): HasMany
    {
        return $this->hasMany(FinRuleLog::class, 'rule_id');
    }
}
