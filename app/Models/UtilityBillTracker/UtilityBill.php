<?php

namespace App\Models\UtilityBillTracker;

use App\Models\FinAccountLineItems;
use App\Services\FileStorageService;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UtilityBill extends Model
{
    use SerializesDatesAsLocal;

    protected $table = 'utility_bill';

    protected $fillable = [
        'utility_account_id',
        'bill_start_date',
        'bill_end_date',
        'due_date',
        'total_cost',
        'status',
        'notes',
        'power_consumed_kwh',
        'total_generation_fees',
        'total_delivery_fees',
        'taxes',
        'fees',
        'discounts',
        'credits',
        'payments_received',
        'previous_unpaid_balance',
        't_id',
        'pdf_original_filename',
        'pdf_stored_filename',
        'pdf_s3_path',
        'pdf_file_size_bytes',
    ];

    protected function casts(): array
    {
        return [
            'bill_start_date' => 'date',
            'bill_end_date' => 'date',
            'due_date' => 'date',
            'total_cost' => 'decimal:5',
            'power_consumed_kwh' => 'decimal:5',
            'total_generation_fees' => 'decimal:5',
            'total_delivery_fees' => 'decimal:5',
            'taxes' => 'decimal:5',
            'fees' => 'decimal:5',
            'discounts' => 'decimal:5',
            'credits' => 'decimal:5',
            'payments_received' => 'decimal:5',
            'previous_unpaid_balance' => 'decimal:5',
            'pdf_file_size_bytes' => 'integer',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * Get the utility account that owns the bill.
     */
    public function utilityAccount(): BelongsTo
    {
        return $this->belongsTo(UtilityAccount::class, 'utility_account_id');
    }

    /**
     * Get the linked finance transaction.
     */
    public function linkedTransaction(): BelongsTo
    {
        return $this->belongsTo(FinAccountLineItems::class, 't_id', 't_id');
    }

    /**
     * Generate S3 path for PDF file.
     */
    public static function generateS3Path(int $accountId, string $storedFilename): string
    {
        return "utility-bills/{$accountId}/{$storedFilename}";
    }

    /**
     * Generate stored filename from original filename.
     */
    public static function generateStoredFilename(string $originalFilename): string
    {
        $extension = pathinfo($originalFilename, PATHINFO_EXTENSION);
        return uniqid('bill_', true) . '.' . $extension;
    }

    /**
     * Delete the PDF file from S3 when the bill is deleted.
     */
    protected static function boot()
    {
        parent::boot();

        static::deleting(function ($bill) {
            if ($bill->pdf_s3_path) {
                $fileService = app(FileStorageService::class);
                $fileService->deleteFile($bill->pdf_s3_path);
            }
        });
    }
}
