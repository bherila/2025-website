<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('client_company_activity', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_company_id')
                ->constrained('client_companies')
                ->cascadeOnDelete();
            $table->foreignId('actor_user_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->string('action', 100);
            $table->nullableMorphs('subject');
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->index(['client_company_id', 'created_at']);
        });

        Schema::table('client_agreements', function (Blueprint $table) {
            $table->decimal('initial_rollover_hours', 8, 4)
                ->default(0)
                ->after('first_cycle_proration')
                ->comment('Rollover hours carried into this agreement from a transition');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('client_agreements', function (Blueprint $table) {
            $table->dropColumn('initial_rollover_hours');
        });

        Schema::dropIfExists('client_company_activity');
    }
};
