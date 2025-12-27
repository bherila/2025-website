<?php

namespace App\Models\ClientManagement;

use App\Models\User;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ClientProject extends Model
{
    use SerializesDatesAsLocal, SoftDeletes;

    protected $table = 'client_projects';

    protected $fillable = [
        'client_company_id',
        'name',
        'slug',
        'description',
        'creator_user_id',
    ];

    /**
     * Generate a slug from a project name.
     * Converts to lowercase, replaces non a-z characters with dashes, collapses consecutive dashes.
     */
    public static function generateSlug(string $name): string
    {
        $slug = strtolower($name);
        $slug = preg_replace('/[^a-z0-9]+/', '-', $slug);
        $slug = preg_replace('/-+/', '-', $slug);
        $slug = trim($slug, '-');

        return $slug;
    }

    /**
     * Get the client company that owns this project.
     */
    public function clientCompany()
    {
        return $this->belongsTo(ClientCompany::class, 'client_company_id');
    }

    /**
     * Get the user who created this project.
     */
    public function creator()
    {
        return $this->belongsTo(User::class, 'creator_user_id');
    }

    /**
     * Get the tasks for this project.
     */
    public function tasks()
    {
        return $this->hasMany(ClientTask::class, 'project_id');
    }

    /**
     * Get the time entries for this project.
     */
    public function timeEntries()
    {
        return $this->hasMany(ClientTimeEntry::class, 'project_id');
    }
}
