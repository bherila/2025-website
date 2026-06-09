<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fin_partnership_basis_years', function (Blueprint $table): void {
            $table->unsignedBigInteger('locked_by_user_id')->nullable()->after('locked_at');
            $table->unsignedBigInteger('unlocked_by_user_id')->nullable()->after('locked_by_user_id');
            $table->timestamp('unlocked_at')->nullable()->after('unlocked_by_user_id');
            $table->text('unlock_reason')->nullable()->after('unlocked_at');
            $table->text('amendment_reason')->nullable()->after('unlock_reason');
            $table->unsignedBigInteger('amended_source_document_id')->nullable()->after('amendment_reason');
        });
    }

    public function down(): void
    {
        Schema::table('fin_partnership_basis_years', function (Blueprint $table): void {
            $table->dropColumn([
                'locked_by_user_id',
                'unlocked_by_user_id',
                'unlocked_at',
                'unlock_reason',
                'amendment_reason',
                'amended_source_document_id',
            ]);
        });
    }
};
