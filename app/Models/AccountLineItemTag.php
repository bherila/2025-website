<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AccountLineItemTag extends Model
{
    protected $table = 'AccountLineItemTag';

    protected $primaryKey = 'tag_id';

    protected $fillable = [
        'tag_userid',
        'tag_color',
        'tag_label',
    ];
}
