<?php

namespace App\Models\FinanceTool;

use App\Models\Files\FileForTaxDocument;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinAccountLot extends Model
{
    protected $table = 'fin_account_lots';

    protected $primaryKey = 'lot_id';

    protected $fillable = [
        'acct_id',
        'symbol',
        'description',
        'quantity',
        'purchase_date',
        'cost_basis',
        'cost_per_unit',
        'sale_date',
        'proceeds',
        'realized_gain_loss',
        'is_short_term',
        'lot_source',
        'statement_id',
        'open_t_id',
        'close_t_id',
        'tax_document_id',
    ];

    protected $casts = [
        'quantity' => 'decimal:8',
        'cost_basis' => 'decimal:4',
        'cost_per_unit' => 'decimal:8',
        'proceeds' => 'decimal:4',
        'realized_gain_loss' => 'decimal:4',
        'is_short_term' => 'boolean',
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
