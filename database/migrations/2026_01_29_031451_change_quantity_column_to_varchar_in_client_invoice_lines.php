<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * 
     * Changes quantity column from decimal to varchar to support h:mm format strings.
     */
    public function up(): void
    {
        // For MySQL, we need to alter the column type
        if (Schema::getConnection()->getDriverName() === 'mysql') {
            // First convert existing decimal values to string format
            DB::statement('ALTER TABLE client_invoice_lines MODIFY COLUMN quantity VARCHAR(20) NOT NULL DEFAULT "1"');
        }
        // SQLite doesn't support column modification, but the schema already uses TEXT
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() === 'mysql') {
            // Convert back to decimal (will lose h:mm format)
            DB::statement('ALTER TABLE client_invoice_lines MODIFY COLUMN quantity DECIMAL(10,4) NOT NULL DEFAULT 1.0000');
        }
    }
};