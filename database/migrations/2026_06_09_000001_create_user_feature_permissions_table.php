<?php

use App\Models\User;
use App\Models\UserFeaturePermission;
use App\Support\Access\FeatureRegistry;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_feature_permissions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained(table: 'users', indexName: 'ufp_user_fk')->cascadeOnDelete();
            $table->string('permission', 128);
            $table->foreignId('granted_by_user_id')->nullable()->constrained(table: 'users', indexName: 'ufp_granted_by_fk')->nullOnDelete();
            $table->timestamps();

            $table->unique(['user_id', 'permission'], 'ufp_user_permission_unique');
            $table->index('permission', 'ufp_permission_idx');
        });

        $grantPermissions = array_values(array_filter(app(FeatureRegistry::class)->keys(), fn (string $permission): bool => $permission !== 'financial-planning.career-comparison.private'));

        User::query()
            ->where('user_role', 'like', '%user%')
            ->where('user_role', 'not like', '%admin%')
            ->orderBy('id')
            ->each(function (User $user) use ($grantPermissions): void {
                foreach ($grantPermissions as $permission) {
                    UserFeaturePermission::query()->firstOrCreate([
                        'user_id' => $user->id,
                        'permission' => $permission,
                    ]);
                }
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_feature_permissions');
    }
};
