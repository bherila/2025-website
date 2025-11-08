<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FinAccountTag extends Model
{
    protected $table = 'fin_account_tag';
    protected $primaryKey = 'tag_id';
    public $timestamps = false;

    protected $fillable = [
        'tag_userid',
        'tag_label',
        'tag_color',
        'when_deleted',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'tag_userid', 'id');
    }
}