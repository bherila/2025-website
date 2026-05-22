<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('class_action_claims', function (Blueprint $table): void {
            $table->string('claim_id', 128)->nullable()->after('name');
            $table->string('pin', 128)->nullable()->after('claim_id');
            $table->date('claim_submitted_on')->nullable()->after('payment_election_submitted_on');
            $table->date('claim_deadline')->nullable()->after('claim_submitted_on');
            $table->string('administrator')->nullable()->after('claim_deadline');
            $table->string('defendant')->nullable()->after('administrator');
            $table->date('final_approval_hearing_on')->nullable()->after('defendant');
            $table->decimal('expected_payment_amount', 14, 2)->nullable()->after('final_approval_hearing_on');
            $table->date('expected_payment_on')->nullable()->after('expected_payment_amount');
            $table->decimal('actual_payment_amount', 14, 2)->nullable()->after('expected_payment_on');

            $table->index(['user_id', 'claim_id'], 'cac_user_claim_id_idx');
            $table->index(['user_id', 'claim_deadline'], 'cac_user_claim_deadline_idx');
        });
    }

    public function down(): void
    {
        Schema::table('class_action_claims', function (Blueprint $table): void {
            $table->dropIndex('cac_user_claim_id_idx');
            $table->dropIndex('cac_user_claim_deadline_idx');

            $table->dropColumn([
                'claim_id',
                'pin',
                'claim_submitted_on',
                'claim_deadline',
                'administrator',
                'defendant',
                'final_approval_hearing_on',
                'expected_payment_amount',
                'expected_payment_on',
                'actual_payment_amount',
            ]);
        });
    }
};
