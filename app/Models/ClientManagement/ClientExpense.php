<?php

namespace App\Models\ClientManagement;

use App\Models\FinAccountLineItems;
use App\Models\User;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ClientExpense extends Model
{
    use SerializesDatesAsLocal, SoftDeletes;

    protected $table = 'client_expenses';

    protected $fillable = [
        'client_company_id',
        'project_id',
        'fin_line_item_id',
        'description',
        'amount',
        'expense_date',
        'is_reimbursable',
        'is_reimbursed',
        'reimbursed_date',
        'category',
        'notes',
        'creator_user_id',
        'client_invoice_line_id',
    ];

    protected $casts = [
        'expense_date' => 'date',
        'reimbursed_date' => 'date',
        'is_reimbursable' => 'boolean',
        'is_reimbursed' => 'boolean',
        'amount' => 'decimal:2',
    ];

    /**
     * Get the client company this expense belongs to.
     */
    public function clientCompany()
    {
        return $this->belongsTo(ClientCompany::class, 'client_company_id');
    }

    /**
     * Get the project this expense is associated with.
     */
    public function project()
    {
        return $this->belongsTo(ClientProject::class, 'project_id');
    }

    /**
     * Get the linked FinAccount line item (admin-only visibility).
     */
    public function finLineItem()
    {
        return $this->belongsTo(FinAccountLineItems::class, 'fin_line_item_id', 't_id');
    }

    /**
     * Get the user who created this expense.
     */
    public function creator()
    {
        return $this->belongsTo(User::class, 'creator_user_id');
    }

    /**
     * Get the invoice line this expense is linked to.
     */
    public function invoiceLine()
    {
        return $this->belongsTo(ClientInvoiceLine::class, 'client_invoice_line_id', 'client_invoice_line_id');
    }

    /**
     * Check if this expense has been invoiced.
     */
    public function isInvoiced(): bool
    {
        return $this->client_invoice_line_id !== null;
    }

    /**
     * Scope to get only reimbursable expenses.
     */
    public function scopeReimbursable($query)
    {
        return $query->where('is_reimbursable', true);
    }

    /**
     * Scope to get only non-reimbursable expenses.
     */
    public function scopeNonReimbursable($query)
    {
        return $query->where('is_reimbursable', false);
    }

    /**
     * Scope to get pending reimbursement expenses.
     */
    public function scopePendingReimbursement($query)
    {
        return $query->where('is_reimbursable', true)
            ->where('is_reimbursed', false);
    }
}
