<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('fin_account_line_items', function (Blueprint $table) {
            if (! Schema::hasColumn('fin_account_line_items', 'created_at')) {
                $table->timestamp('created_at', 6)->nullable()->after('when_added');
            }
            if (! Schema::hasColumn('fin_account_line_items', 'updated_at')) {
                $table->timestamp('updated_at', 6)->nullable()->after('created_at');
            }
        });

        $now = now();
        DB::table('fin_account_line_items')
            ->whereNull('created_at')
            ->update(['created_at' => $now]);
        DB::table('fin_account_line_items')
            ->whereNull('updated_at')
            ->update(['updated_at' => $now]);

        Schema::table('fin_account_line_items', function (Blueprint $table) {
            $table->index(['t_account', 'updated_at'], 'faili_account_updated_at_idx');
            $table->index('updated_at', 'faili_updated_at_idx');
        });

        Schema::create('fin_account_line_item_deletions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('t_id');
            $table->unsignedBigInteger('t_account');
            $table->unsignedBigInteger('user_id');
            $table->timestamp('deleted_at', 6);
            $table->timestamps(6);

            $table->unique('t_id', 'failid_t_id_unique');
            $table->index(['t_account', 'deleted_at'], 'failid_account_deleted_at_idx');
            $table->index(['user_id', 'deleted_at'], 'failid_user_deleted_at_idx');
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fin_account_line_item_deletions');

        Schema::table('fin_account_line_items', function (Blueprint $table) {
            $table->dropIndex('faili_account_updated_at_idx');
            $table->dropIndex('faili_updated_at_idx');
            $table->dropColumn(['created_at', 'updated_at']);
        });
    }
};
