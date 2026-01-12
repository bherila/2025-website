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
        Schema::table('utility_bill', function (Blueprint $table) {
            // Taxes and fees columns (applies to all bill types)
            $table->decimal('taxes', 14, 5)->nullable()->after('total_delivery_fees');
            $table->decimal('fees', 14, 5)->nullable()->after('taxes');
            
            // Link to finance transaction where bill was paid
            $table->unsignedBigInteger('t_id')->nullable()->after('fees');
            $table->index('t_id');
            
            // PDF file storage columns
            $table->string('pdf_original_filename')->nullable()->after('t_id');
            $table->string('pdf_stored_filename')->nullable()->after('pdf_original_filename');
            $table->string('pdf_s3_path')->nullable()->after('pdf_stored_filename');
            $table->unsignedBigInteger('pdf_file_size_bytes')->nullable()->after('pdf_s3_path');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('utility_bill', function (Blueprint $table) {
            $table->dropColumn([
                'taxes',
                'fees',
                't_id',
                'pdf_original_filename',
                'pdf_stored_filename',
                'pdf_s3_path',
                'pdf_file_size_bytes',
            ]);
        });
    }
};
