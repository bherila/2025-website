<?php

namespace App\Models\FinanceTool;

use App\Models\Files\FileForTaxDocument;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string|null $reconciliation_status Latest fin_lot_reconciliation_links.state cache for this lot when reconciliation links exist.
 */
class FinAccountLot extends Model
{
    use SerializesDatesAsLocal;

    /** New canonical source discriminator stored in fin_account_lots.source. */
    public const string SOURCE_BROKER_1099B = 'broker_1099b';

    /** New canonical source discriminator stored in fin_account_lots.source. */
    public const string SOURCE_ACCOUNT_DERIVED = 'account_derived';

    /** New canonical source discriminator stored in fin_account_lots.source. */
    public const string SOURCE_MANUAL = 'manual';

    /** New canonical source discriminator stored in fin_account_lots.source. */
    public const string SOURCE_SYNTHETIC_ADJUSTMENT = 'synthetic_adjustment';

    public const array SOURCE_VALUES = [
        self::SOURCE_BROKER_1099B,
        self::SOURCE_ACCOUNT_DERIVED,
        self::SOURCE_MANUAL,
        self::SOURCE_SYNTHETIC_ADJUSTMENT,
    ];

    /** Legacy lot source value stored in fin_account_lots.lot_source. */
    public const SOURCE_1099B = '1099b';

    /** Legacy lot source value stored in fin_account_lots.lot_source. */
    public const SOURCE_1099B_UNDERSCORE = '1099_b';

    protected $table = 'fin_account_lots';

    protected $primaryKey = 'lot_id';

    protected $fillable = [
        'acct_id',
        'symbol',
        'description',
        'cusip',
        'quantity',
        'purchase_date',
        'cost_basis',
        'cost_per_unit',
        'sale_date',
        'proceeds',
        'realized_gain_loss',
        'is_short_term',
        'lot_source',
        'source',
        'statement_id',
        'open_t_id',
        'close_t_id',
        'tax_document_id',
        'form_8949_box',
        'is_covered',
        'accrued_market_discount',
        'wash_sale_disallowed',
        'superseded_by_lot_id',
        'reconciliation_status',
        'reconciliation_notes',
    ];

    protected $casts = [
        'quantity' => 'decimal:8',
        'cost_basis' => 'decimal:4',
        'cost_per_unit' => 'decimal:8',
        'proceeds' => 'decimal:4',
        'realized_gain_loss' => 'decimal:4',
        'is_short_term' => 'boolean',
        'is_covered' => 'boolean',
        'accrued_market_discount' => 'decimal:4',
        'wash_sale_disallowed' => 'decimal:4',
        'purchase_date' => 'date',
        'sale_date' => 'date',
    ];

    public function account(): BelongsTo
    {
        return $this->belongsTo(FinAccounts::class, 'acct_id', 'acct_id');
    }

    public function statement(): BelongsTo
    {
        return $this->belongsTo(FinStatement::class, 'statement_id', 'statement_id');
    }

    public function openTransaction(): BelongsTo
    {
        return $this->belongsTo(FinAccountLineItems::class, 'open_t_id', 't_id');
    }

    public function closeTransaction(): BelongsTo
    {
        return $this->belongsTo(FinAccountLineItems::class, 'close_t_id', 't_id');
    }

    public function taxDocument(): BelongsTo
    {
        return $this->belongsTo(FileForTaxDocument::class, 'tax_document_id', 'id');
    }

    /** @param  Builder<self>  $query */
    public function scopeWhereSource(Builder $query, string $source): void
    {
        $query->where('source', $source);
    }

    /**
     * Compute the is_short_term and realized_gain_loss derived fields for a lot.
     *
     * Returns null for both values when the lot is still open (no sale_date).
     * realized_gain_loss is null when proceeds is not provided.
     *
     * @return array{is_short_term: bool|null, realized_gain_loss: float|null}
     */
    public static function computeMetrics(
        string $purchaseDate,
        ?string $saleDate,
        ?float $proceeds,
        float $costBasis,
    ): array {
        if (! $saleDate) {
            return ['is_short_term' => null, 'realized_gain_loss' => null];
        }

        $diff = (new \DateTime($purchaseDate))->diff(new \DateTime($saleDate));
        $isShortTerm = $diff->days <= 365;
        $realizedGainLoss = $proceeds !== null ? $proceeds - $costBasis : null;

        return ['is_short_term' => $isShortTerm, 'realized_gain_loss' => $realizedGainLoss];
    }
}
