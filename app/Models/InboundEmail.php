<?php

namespace App\Models;

use App\Traits\SerializesDatesAsLocal;
use Database\Factories\InboundEmailFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class InboundEmail extends Model
{
    /** @use HasFactory<InboundEmailFactory> */
    use HasFactory;
    use SerializesDatesAsLocal;

    protected $fillable = [
        'idempotency_key',
        'message_id',
        'from_email',
        'from_name',
        'to_email',
        'subject',
        'text_body',
        'html_body',
        'headers',
        'attachments',
        'raw_payload',
        'status',
        'received_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'headers' => 'array',
            'attachments' => 'array',
            'raw_payload' => 'array',
            'received_at' => 'datetime',
        ];
    }
}
