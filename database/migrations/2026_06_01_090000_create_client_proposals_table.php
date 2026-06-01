<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const COMPANY_STATUS_INDEX = 'client_proposals_company_status_idx';

    private const ROOT_VERSION_INDEX = 'client_proposals_root_version_idx';

    private const ITEMS_SORT_INDEX = 'client_proposal_items_proposal_sort_idx';

    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (! Schema::hasTable('client_proposals')) {
            Schema::create('client_proposals', function (Blueprint $table): void {
                $table->id();

                // Ownership + version chain
                $table->foreignId('client_company_id')->constrained('client_companies')->cascadeOnDelete();
                $table->unsignedBigInteger('root_id')->nullable()
                    ->comment('First version of this chain. Set to own id for v1 after insert.');
                $table->unsignedInteger('version')->default(1);
                $table->unsignedBigInteger('previous_version_id')->nullable();

                // Materialization links
                $table->foreignId('agreement_id')->nullable()->constrained('client_agreements')->nullOnDelete();
                $table->foreignId('project_id')->nullable()->constrained('client_projects')->nullOnDelete();

                // Lifecycle
                $table->string('status', 30)->default('draft')
                    ->comment('ProposalStatus: draft, sent, changes_requested, accepted, rejected, expired');
                $table->boolean('is_visible_to_client')->default(false);
                $table->timestamp('sent_at')->nullable();
                $table->timestamp('expires_at')->nullable();

                // Content
                $table->string('title');
                $table->longText('body_markdown')->nullable();

                // Base fee
                $table->decimal('base_amount', 10, 2)->default(0);
                $table->string('base_description')->nullable();

                // Credit (e.g. "Less retainer already paid")
                $table->decimal('credit_amount', 10, 2)->nullable();
                $table->string('credit_label')->nullable();

                // Upfront invoice terms / display-only fields
                $table->unsignedInteger('payment_net_days')->default(30)
                    ->comment('Upfront invoice due_date = accepted_at + this many days.');
                $table->unsignedInteger('estimated_completion_days')->nullable()->comment('Display only.');

                // Retainer (admin-decided; client cannot opt out). retainer_amount is per-interval.
                $table->decimal('retainer_amount', 10, 2)->nullable();
                $table->unsignedTinyInteger('retainer_interval_months')->nullable()->comment('One of 1, 3, 6, 12.');
                $table->decimal('retainer_included_hours', 10, 4)->nullable();
                $table->decimal('retainer_hourly_rate', 10, 2)->nullable()->comment('Overage hourly rate.');
                $table->string('retainer_description')->nullable();

                // Client response (free-form for reject reason or request-changes message)
                $table->text('client_response_message')->nullable();
                $table->string('response_name')->nullable();
                $table->string('response_title')->nullable();
                $table->timestamp('responded_at')->nullable();
                $table->foreignId('responded_by_user_id')->nullable()->constrained('users')->nullOnDelete();

                // Accept signature (acceptance is the binding signature)
                $table->timestamp('accepted_at')->nullable();
                $table->foreignId('accepted_by_user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('accept_signature_name')->nullable();
                $table->string('accept_signature_title')->nullable();

                $table->timestamps();
                $table->softDeletes();

                $table->index(['client_company_id', 'status'], self::COMPANY_STATUS_INDEX);
                $table->index(['root_id', 'version'], self::ROOT_VERSION_INDEX);

                // Self-referential FKs are declared inline (within CREATE TABLE) so they
                // work on both MySQL and SQLite, which cannot add FKs via ALTER TABLE.
                $table->foreign('previous_version_id')->references('id')->on('client_proposals')->nullOnDelete();
                $table->foreign('root_id')->references('id')->on('client_proposals')->nullOnDelete();
            });
        }

        if (! Schema::hasTable('client_proposal_items')) {
            Schema::create('client_proposal_items', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('client_proposal_id')->constrained('client_proposals')->cascadeOnDelete();
                $table->string('kind', 20)->comment('ProposalItemKind: scope or add_on');
                $table->string('description');
                $table->decimal('amount', 10, 2)->nullable()->comment('NULL for scope; required for add_on.');
                $table->string('charge_cadence', 20)->default('one_time')
                    ->comment('ChargeCadence for add_on: one_time (upfront line) or recurring (-> recurring item).');
                $table->boolean('is_optional')->default(false);
                $table->boolean('is_selected')->default(false)->comment('Client selection at accept.');
                $table->unsignedInteger('sort_order')->default(0);
                $table->timestamps();
                $table->softDeletes();

                $table->index(['client_proposal_id', 'sort_order'], self::ITEMS_SORT_INDEX);
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // client_proposal_items references client_proposals, so drop it first.
        // The add_source_proposal_id migration's down() (later timestamp) has
        // already removed client_agreements -> client_proposals before this runs.
        Schema::dropIfExists('client_proposal_items');
        Schema::dropIfExists('client_proposals');
    }
};
