<?php

namespace App\Models\FinanceTool;

use App\Models\Files\FileForTaxDocument;
use App\Models\User;
use App\Traits\SerializesDatesAsLocal;
use Database\Factories\FinanceTool\FinLotReconciliationLinkFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property array{reason_code: string, score: float, deltas: array{proceeds: float|null, basis: float|null, wash: float|null, qty: float|null, date_days: int|null}, notes: string|null}|null $match_reason
 */
class FinLotReconciliationLink extends Model
{
    /** @use HasFactory<FinLotReconciliationLinkFactory> */
    use HasFactory, SerializesDatesAsLocal;

    public const string STATE_AUTO_MATCHED = 'auto_matched';

    public const string STATE_NEEDS_REVIEW = 'needs_review';

    public const string STATE_ACCEPTED_BROKER = 'accepted_broker';

    public const string STATE_ACCEPTED_ACCOUNT_OVERRIDE = 'accepted_account_override';

    public const string STATE_IGNORED_DUPLICATE = 'ignored_duplicate';

    public const string STATE_UNLINKED = 'unlinked';

    public const string STATE_BROKER_ONLY = 'broker_only';

    public const string STATE_ACCOUNT_ONLY = 'account_only';

    public const array STATES = [
        self::STATE_AUTO_MATCHED,
        self::STATE_NEEDS_REVIEW,
        self::STATE_ACCEPTED_BROKER,
        self::STATE_ACCEPTED_ACCOUNT_OVERRIDE,
        self::STATE_IGNORED_DUPLICATE,
        self::STATE_UNLINKED,
        self::STATE_BROKER_ONLY,
        self::STATE_ACCOUNT_ONLY,
    ];

    protected $table = 'fin_lot_reconciliation_links';

    protected $fillable = [
        'tax_document_id',
        'broker_lot_id',
        'account_lot_id',
        'state',
        'match_reason',
        'accepted_by_user_id',
        'accepted_at',
    ];

    protected function casts(): array
    {
        return [
            'match_reason' => 'array',
            'accepted_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<FileForTaxDocument, $this> */
    public function taxDocument(): BelongsTo
    {
        return $this->belongsTo(FileForTaxDocument::class, 'tax_document_id');
    }

    /** @return BelongsTo<FinAccountLot, $this> */
    public function brokerLot(): BelongsTo
    {
        return $this->belongsTo(FinAccountLot::class, 'broker_lot_id', 'lot_id');
    }

    /** @return BelongsTo<FinAccountLot, $this> */
    public function accountLot(): BelongsTo
    {
        return $this->belongsTo(FinAccountLot::class, 'account_lot_id', 'lot_id');
    }

    /** @return BelongsTo<User, $this> */
    public function acceptedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'accepted_by_user_id');
    }
}
