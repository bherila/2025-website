<?php

namespace App\Models\ClientManagement;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Models\User;

class ClientTask extends Model
{
    use SoftDeletes;

    protected $table = 'client_tasks';

    protected $fillable = [
        'project_id',
        'name',
        'description',
        'due_date',
        'completed_at',
        'assignee_user_id',
        'creator_user_id',
        'is_high_priority',
        'is_hidden_from_clients',
    ];

    protected $casts = [
        'due_date' => 'datetime',
        'completed_at' => 'datetime',
        'is_high_priority' => 'boolean',
        'is_hidden_from_clients' => 'boolean',
    ];

    /**
     * Get the project this task belongs to.
     */
    public function project()
    {
        return $this->belongsTo(ClientProject::class, 'project_id');
    }

    /**
     * Get the user assigned to this task.
     */
    public function assignee()
    {
        return $this->belongsTo(User::class, 'assignee_user_id');
    }

    /**
     * Get the user who created this task.
     */
    public function creator()
    {
        return $this->belongsTo(User::class, 'creator_user_id');
    }

    /**
     * Get the time entries for this task.
     */
    public function timeEntries()
    {
        return $this->hasMany(ClientTimeEntry::class, 'task_id');
    }

    /**
     * Check if the task is completed.
     */
    public function isCompleted(): bool
    {
        return $this->completed_at !== null;
    }

    /**
     * Mark the task as completed.
     */
    public function markCompleted()
    {
        $this->completed_at = now();
        $this->save();
    }

    /**
     * Mark the task as not completed.
     */
    public function markNotCompleted()
    {
        $this->completed_at = null;
        $this->save();
    }
}
