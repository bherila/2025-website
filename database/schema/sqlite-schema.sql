CREATE TABLE `AccountLineItemTag`(
  `tag_id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `tag_userid` TEXT NOT NULL,
  `tag_color` TEXT NOT NULL,
  `tag_label` TEXT NOT NULL,
  UNIQUE(`tag_userid`, `tag_label`)
);
CREATE TABLE `user`(
  `id` TEXT PRIMARY KEY NOT NULL,
  `name` TEXT NOT NULL,
  `email` TEXT NOT NULL UNIQUE,
  `emailVerified` INTEGER NOT NULL DEFAULT 0,
  `image` TEXT,
  `createdAt` TEXT NOT NULL,
  `updatedAt` TEXT NOT NULL
);
CREATE TABLE `account`(
  `id` TEXT PRIMARY KEY NOT NULL,
  `accountId` TEXT NOT NULL,
  `providerId` TEXT NOT NULL,
  `userId` TEXT NOT NULL,
  `accessToken` TEXT,
  `refreshToken` TEXT,
  `idToken` TEXT,
  `accessTokenExpiresAt` TEXT,
  `refreshTokenExpiresAt` TEXT,
  `scope` TEXT,
  `password` TEXT,
  `createdAt` TEXT NOT NULL,
  `updatedAt` TEXT NOT NULL,
  FOREIGN KEY(`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE `cache`(
  `key` TEXT PRIMARY KEY NOT NULL,
  `value` TEXT NOT NULL,
  `expiration` INTEGER NOT NULL
);
CREATE TABLE `cache_locks`(
  `key` TEXT PRIMARY KEY NOT NULL,
  `owner` TEXT NOT NULL,
  `expiration` INTEGER NOT NULL
);
CREATE TABLE `users`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `name` TEXT NOT NULL,
  `email` TEXT NOT NULL UNIQUE,
  `email_verified_at` TEXT,
  `password` TEXT NOT NULL,
  `user_role` TEXT NOT NULL DEFAULT 'User',
  `remember_token` TEXT,
  `last_login_date` TEXT,
  `created_at` TEXT,
  `updated_at` TEXT,
  `gemini_api_key` TEXT
  ,
  "marriage_status_by_year" text,
  `genai_daily_quota_limit` INTEGER DEFAULT NULL,
  "mcp_api_key" varchar
);
CREATE INDEX `users_user_role_index` ON `users`(`user_role`);
CREATE TABLE `client_companies`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `company_name` TEXT NOT NULL,
  `slug` TEXT NOT NULL DEFAULT '' UNIQUE,
  `address` TEXT,
  `website` TEXT,
  `phone_number` TEXT,
  `default_hourly_rate` REAL,
  `additional_notes` TEXT,
  `is_active` INTEGER NOT NULL DEFAULT 1,
  `last_activity` TEXT,
  `created_at` TEXT,
  `updated_at` TEXT,
  `deleted_at` TEXT
);
CREATE INDEX `client_companies_is_active_index` ON `client_companies`(
  `is_active`
);
CREATE INDEX `client_companies_company_name_index` ON `client_companies`(
  `company_name`
);
CREATE TABLE `client_agreements`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `client_company_id` INTEGER NOT NULL,
  `active_date` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `termination_date` TEXT,
  `agreement_text` TEXT,
  `agreement_link` TEXT,
  `client_company_signed_date` TEXT,
  `client_company_signed_user_id` INTEGER,
  `client_company_signed_name` TEXT,
  `client_company_signed_title` TEXT,
  `monthly_retainer_hours` REAL NOT NULL DEFAULT 0.00,
  `catch_up_threshold_hours` REAL NOT NULL DEFAULT 1.00,
  `rollover_months` INTEGER NOT NULL DEFAULT 1,
  `hourly_rate` REAL NOT NULL DEFAULT 0.00,
  `monthly_retainer_fee` REAL NOT NULL DEFAULT 0.00,
  `is_visible_to_client` INTEGER NOT NULL DEFAULT 0,
  `created_at` TEXT,
  `updated_at` TEXT,
  `deleted_at` TEXT,
  FOREIGN KEY(`client_company_id`) REFERENCES `client_companies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY(`client_company_signed_user_id`) REFERENCES `users`(`id`)
);
CREATE INDEX `client_agreements_client_company_id_index` ON `client_agreements`(
  `client_company_id`
);
CREATE INDEX `client_agreements_active_date_index` ON `client_agreements`(
  `active_date`
);
CREATE INDEX `client_agreements_termination_date_index` ON `client_agreements`(
  `termination_date`
);
CREATE TABLE `client_company_user`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `client_company_id` INTEGER NOT NULL,
  `user_id` INTEGER NOT NULL,
  `created_at` TEXT,
  `updated_at` TEXT,
  UNIQUE(`client_company_id`, `user_id`),
  FOREIGN KEY(`client_company_id`) REFERENCES `client_companies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY(`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
CREATE TABLE `client_invoices`(
  `client_invoice_id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `client_company_id` INTEGER NOT NULL,
  `client_agreement_id` INTEGER,
  `period_start` TEXT,
  `period_end` TEXT,
  `invoice_number` TEXT,
  `invoice_total` REAL NOT NULL DEFAULT 0.00,
  `issue_date` TEXT,
  `due_date` TEXT,
  `paid_date` TEXT,
  `retainer_hours_included` REAL NOT NULL DEFAULT 0.0000,
  `hours_worked` REAL NOT NULL DEFAULT 0.0000,
  `rollover_hours_used` REAL NOT NULL DEFAULT 0.0000,
  `unused_hours_balance` REAL NOT NULL DEFAULT 0.0000,
  `negative_hours_balance` REAL NOT NULL DEFAULT 0.0000,
  `hours_billed_at_rate` REAL NOT NULL DEFAULT 0.0000,
  `status` TEXT NOT NULL DEFAULT 'draft',
  `notes` TEXT,
  `created_at` TEXT,
  `updated_at` TEXT,
  `deleted_at` TEXT,
  "starting_unused_hours" numeric,
  "starting_negative_hours" numeric,
  FOREIGN KEY(`client_company_id`) REFERENCES `client_companies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY(`client_agreement_id`) REFERENCES `client_agreements`(`id`) ON DELETE SET NULL
);
CREATE INDEX `client_invoices_client_company_id_index` ON `client_invoices`(
  `client_company_id`
);
CREATE INDEX `client_invoices_client_agreement_id_index` ON `client_invoices`(
  `client_agreement_id`
);
CREATE INDEX `client_invoices_issue_date_index` ON `client_invoices`(
  `issue_date`
);
CREATE INDEX `client_invoices_status_index` ON `client_invoices`(`status`);
CREATE TABLE `client_invoice_lines`(
  `client_invoice_line_id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `client_invoice_id` INTEGER NOT NULL,
  `client_agreement_id` INTEGER,
  `description` TEXT NOT NULL,
  `quantity` REAL NOT NULL DEFAULT 1.0000,
  `unit_price` REAL NOT NULL DEFAULT 0.00,
  `line_total` REAL NOT NULL DEFAULT 0.00,
  `line_type` TEXT NOT NULL DEFAULT 'retainer',
  `hours` REAL,
  `line_date` TEXT,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` TEXT,
  `updated_at` TEXT,
  `deleted_at` TEXT,
  FOREIGN KEY(`client_invoice_id`) REFERENCES `client_invoices`(`client_invoice_id`) ON DELETE CASCADE,
  FOREIGN KEY(`client_agreement_id`) REFERENCES `client_agreements`(`id`)
);
CREATE INDEX `client_invoice_lines_client_invoice_id_index` ON `client_invoice_lines`(
  `client_invoice_id`
);
CREATE TABLE `client_invoice_payments`(
  `client_invoice_payment_id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `client_invoice_id` INTEGER NOT NULL,
  `amount` REAL NOT NULL,
  `payment_date` TEXT NOT NULL,
  `payment_method` TEXT NOT NULL,
  `notes` TEXT,
  `created_at` TEXT,
  `updated_at` TEXT,
  `deleted_at` TEXT,
  FOREIGN KEY(`client_invoice_id`) REFERENCES `client_invoices`(`client_invoice_id`) ON DELETE CASCADE
);
CREATE TABLE `client_projects`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `client_company_id` INTEGER NOT NULL,
  `name` TEXT NOT NULL,
  `slug` TEXT NOT NULL UNIQUE,
  `description` TEXT,
  `creator_user_id` INTEGER,
  `created_at` TEXT,
  `updated_at` TEXT,
  `deleted_at` TEXT,
  FOREIGN KEY(`client_company_id`) REFERENCES `client_companies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY(`creator_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `client_projects_client_company_id_index` ON `client_projects`(
  `client_company_id`
);
CREATE TABLE `client_time_entries`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `project_id` INTEGER NOT NULL,
  `client_company_id` INTEGER NOT NULL,
  `task_id` INTEGER,
  `name` TEXT,
  `minutes_worked` INTEGER NOT NULL,
  `date_worked` TEXT NOT NULL,
  `user_id` INTEGER,
  `creator_user_id` INTEGER,
  `is_billable` INTEGER NOT NULL DEFAULT 1,
  `job_type` TEXT NOT NULL DEFAULT 'Software Development',
  `client_invoice_line_id` INTEGER,
  `created_at` TEXT,
  `updated_at` TEXT,
  `deleted_at` TEXT,
  "is_deferred_billing" tinyint(1) not null default '0',
  FOREIGN KEY(`project_id`) REFERENCES `client_projects`(`id`) ON DELETE CASCADE,
  FOREIGN KEY(`client_company_id`) REFERENCES `client_companies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY(`task_id`) REFERENCES `client_tasks`(`id`) ON DELETE SET NULL,
  FOREIGN KEY(`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY(`creator_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY(`client_invoice_line_id`) REFERENCES `client_invoice_lines`(`client_invoice_line_id`)
);
CREATE INDEX `client_time_entries_project_id_index` ON `client_time_entries`(
  `project_id`
);
CREATE INDEX `client_time_entries_client_company_id_index` ON `client_time_entries`(
  `client_company_id`
);
CREATE INDEX `client_time_entries_task_id_index` ON `client_time_entries`(
  `task_id`
);
CREATE INDEX `client_time_entries_user_id_index` ON `client_time_entries`(
  `user_id`
);
CREATE INDEX `client_time_entries_date_worked_index` ON `client_time_entries`(
  `date_worked`
);
CREATE INDEX `client_time_entries_client_invoice_line_id_index` ON `client_time_entries`(
  `client_invoice_line_id`
);
CREATE TABLE `client_expenses`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `client_company_id` INTEGER NOT NULL,
  `project_id` INTEGER,
  `fin_line_item_id` INTEGER,
  `description` TEXT NOT NULL,
  `amount` REAL NOT NULL,
  `expense_date` TEXT NOT NULL,
  `is_reimbursable` INTEGER NOT NULL DEFAULT 0,
  `is_reimbursed` INTEGER NOT NULL DEFAULT 0,
  `reimbursed_date` TEXT,
  `category` TEXT,
  `notes` TEXT,
  `creator_user_id` INTEGER,
  `client_invoice_line_id` INTEGER,
  `created_at` TEXT,
  `updated_at` TEXT,
  `deleted_at` TEXT,
  FOREIGN KEY(`client_company_id`) REFERENCES `client_companies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY(`project_id`) REFERENCES `client_projects`(`id`) ON DELETE SET NULL,
  FOREIGN KEY(`creator_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY(`client_invoice_line_id`) REFERENCES `client_invoice_lines`(`client_invoice_line_id`) ON DELETE SET NULL
);
CREATE INDEX `client_expenses_client_company_id_index` ON `client_expenses`(
  `client_company_id`
);
CREATE INDEX `client_expenses_project_id_index` ON `client_expenses`(
  `project_id`
);
CREATE INDEX `client_expenses_expense_date_index` ON `client_expenses`(
  `expense_date`
);
CREATE INDEX `client_expenses_is_reimbursable_index` ON `client_expenses`(
  `is_reimbursable`
);
CREATE TABLE `earnings_annual`(
  `symbol` TEXT NOT NULL,
  `fiscalDateEnding` TEXT NOT NULL,
  `reportedEPS` REAL,
  PRIMARY KEY(`symbol`, `fiscalDateEnding`)
);
CREATE TABLE `earnings_quarterly`(
  `symbol` TEXT NOT NULL,
  `fiscalDateEnding` TEXT NOT NULL,
  `reportedDate` TEXT,
  `reportedEPS` REAL,
  `estimatedEPS` REAL,
  `surprise` REAL,
  `surprisePercentage` REAL,
  PRIMARY KEY(`symbol`, `fiscalDateEnding`)
);
CREATE TABLE `failed_jobs`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `uuid` TEXT NOT NULL UNIQUE,
  `connection` TEXT NOT NULL,
  `queue` TEXT NOT NULL,
  `payload` TEXT NOT NULL,
  `exception` TEXT NOT NULL,
  `failed_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE `files_for_agreements`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `agreement_id` INTEGER NOT NULL,
  `original_filename` TEXT NOT NULL,
  `stored_filename` TEXT NOT NULL,
  `s3_path` TEXT NOT NULL,
  `mime_type` TEXT,
  `file_size_bytes` INTEGER NOT NULL,
  `uploaded_by_user_id` INTEGER,
  `download_history` TEXT,
  `created_at` TEXT,
  `updated_at` TEXT,
  `deleted_at` TEXT,
  FOREIGN KEY(`agreement_id`) REFERENCES `client_agreements`(`id`) ON DELETE CASCADE,
  FOREIGN KEY(`uploaded_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `files_for_agreements_agreement_id_index` ON `files_for_agreements`(
  `agreement_id`
);
CREATE TABLE `files_for_client_companies`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `client_company_id` INTEGER NOT NULL,
  `original_filename` TEXT NOT NULL,
  `stored_filename` TEXT NOT NULL,
  `s3_path` TEXT NOT NULL,
  `mime_type` TEXT,
  `file_size_bytes` INTEGER NOT NULL,
  `uploaded_by_user_id` INTEGER,
  `download_history` TEXT,
  `created_at` TEXT,
  `updated_at` TEXT,
  `deleted_at` TEXT,
  FOREIGN KEY(`client_company_id`) REFERENCES `client_companies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY(`uploaded_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `files_for_client_companies_client_company_id_index` ON `files_for_client_companies`(
  `client_company_id`
);
CREATE TABLE `files_for_fin_accounts`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `acct_id` INTEGER NOT NULL,
  `statement_id` INTEGER,
  `original_filename` TEXT NOT NULL,
  `stored_filename` TEXT NOT NULL,
  `s3_path` TEXT NOT NULL,
  `mime_type` TEXT,
  `file_size_bytes` INTEGER NOT NULL,
  `uploaded_by_user_id` INTEGER,
  `download_history` TEXT,
  `created_at` TEXT,
  `updated_at` TEXT,
  "file_hash" varchar,
  FOREIGN KEY(`uploaded_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `files_for_fin_accounts_acct_id_index` ON `files_for_fin_accounts`(
  `acct_id`
);
CREATE INDEX `files_for_fin_accounts_statement_id_index` ON `files_for_fin_accounts`(
  `statement_id`
);
CREATE TABLE `files_for_projects`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `project_id` INTEGER NOT NULL,
  `original_filename` TEXT NOT NULL,
  `stored_filename` TEXT NOT NULL,
  `s3_path` TEXT NOT NULL,
  `mime_type` TEXT,
  `file_size_bytes` INTEGER NOT NULL,
  `uploaded_by_user_id` INTEGER,
  `download_history` TEXT,
  `created_at` TEXT,
  `updated_at` TEXT,
  `deleted_at` TEXT,
  FOREIGN KEY(`project_id`) REFERENCES `client_projects`(`id`) ON DELETE CASCADE,
  FOREIGN KEY(`uploaded_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `files_for_projects_project_id_index` ON `files_for_projects`(
  `project_id`
);
CREATE TABLE `files_for_tasks`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `task_id` INTEGER NOT NULL,
  `original_filename` TEXT NOT NULL,
  `stored_filename` TEXT NOT NULL,
  `s3_path` TEXT NOT NULL,
  `mime_type` TEXT,
  `file_size_bytes` INTEGER NOT NULL,
  `uploaded_by_user_id` INTEGER,
  `download_history` TEXT,
  `created_at` TEXT,
  `updated_at` TEXT,
  `deleted_at` TEXT,
  FOREIGN KEY(`task_id`) REFERENCES `client_tasks`(`id`) ON DELETE CASCADE,
  FOREIGN KEY(`uploaded_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `files_for_tasks_task_id_index` ON `files_for_tasks`(`task_id`);
CREATE TABLE `fin_accounts`(
  `acct_id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `acct_owner` TEXT NOT NULL,
  `acct_name` TEXT NOT NULL,
  `acct_last_balance` TEXT NOT NULL DEFAULT '0',
  `acct_last_balance_date` TEXT,
  `acct_sort_order` INTEGER NOT NULL DEFAULT 0,
  `acct_is_debt` INTEGER NOT NULL DEFAULT 0,
  `acct_is_retirement` INTEGER NOT NULL DEFAULT 0,
  `when_closed` TEXT,
  `created_at` TEXT,
  `updated_at` TEXT,
  "acct_number" varchar,
  UNIQUE(`acct_owner`, `acct_name`)
);
CREATE TABLE `fin_account_line_items`(
  `t_id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `t_account` INTEGER,
  `t_date` TEXT NOT NULL,
  `t_type` TEXT,
  `t_schc_category` TEXT,
  `t_amt` REAL,
  `t_symbol` TEXT,
  `t_qty` REAL DEFAULT 0,
  `t_price` REAL,
  `t_commission` REAL,
  `t_fee` REAL,
  `t_basis` REAL,
  `t_realized_pl` REAL,
  `t_mtm_pl` REAL,
  `t_method` TEXT,
  `t_source` TEXT,
  `t_origin` TEXT,
  `opt_expiration` TEXT,
  `opt_type` TEXT,
  `opt_strike` REAL,
  `t_description` TEXT,
  `t_comment` TEXT,
  `t_from` TEXT,
  `t_to` TEXT,
  `t_interest_rate` TEXT,
  `t_cusip` TEXT,
  `conid` TEXT,
  `underlying` TEXT,
  `listing_exch` TEXT,
  `multiplier` INTEGER,
  `when_added` TEXT,
  `t_harvested_amount` REAL,
  `t_is_not_duplicate` INTEGER NOT NULL DEFAULT 0,
  `t_date_posted` TEXT,
  `t_account_balance` REAL,
  `statement_id` INTEGER,
  FOREIGN KEY(`statement_id`) REFERENCES `fin_statements`(`statement_id`) ON DELETE SET NULL
);
CREATE INDEX `fin_account_line_items_t_account_index` ON `fin_account_line_items`(
  `t_account`
);
CREATE TABLE `fin_account_line_item_links`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `parent_t_id` INTEGER NOT NULL,
  `child_t_id` INTEGER NOT NULL,
  `when_added` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(`parent_t_id`, `child_t_id`),
  FOREIGN KEY(`parent_t_id`) REFERENCES `fin_account_line_items`(`t_id`) ON DELETE CASCADE,
  FOREIGN KEY(`child_t_id`) REFERENCES `fin_account_line_items`(`t_id`) ON DELETE CASCADE
);
CREATE INDEX `fin_account_line_item_links_parent_t_id_index` ON `fin_account_line_item_links`(
  `parent_t_id`
);
CREATE INDEX `fin_account_line_item_links_child_t_id_index` ON `fin_account_line_item_links`(
  `child_t_id`
);
CREATE TABLE `fin_account_line_item_tag_map`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `t_id` INTEGER NOT NULL,
  `tag_id` INTEGER NOT NULL,
  `when_added` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(`t_id`, `tag_id`),
  FOREIGN KEY(`t_id`) REFERENCES `fin_account_line_items`(`t_id`) ON DELETE CASCADE,
  FOREIGN KEY(`tag_id`) REFERENCES `fin_account_tag`(`tag_id`) ON DELETE CASCADE
);
CREATE INDEX `fin_account_line_item_tag_map_tag_id_index` ON `fin_account_line_item_tag_map`(
  `tag_id`
);
CREATE TABLE `fin_equity_awards`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `award_id` TEXT NOT NULL,
  `grant_date` TEXT NOT NULL,
  `vest_date` TEXT NOT NULL,
  `share_count` INTEGER NOT NULL,
  `symbol` TEXT NOT NULL,
  `uid` TEXT NOT NULL,
  `vest_price` REAL,
  UNIQUE(`grant_date`, `award_id`, `vest_date`, `symbol`)
);
CREATE TABLE `fin_payslip_uploads`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `file_name` TEXT,
  `file_hash` TEXT,
  `parsed_json` TEXT
);
CREATE TABLE `fin_statements`(
  `statement_id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `acct_id` INTEGER NOT NULL,
  `balance` TEXT NOT NULL,
  `statement_opening_date` TEXT,
  `statement_closing_date` TEXT,
  cost_basis DECIMAL(15,4) NOT NULL DEFAULT 0,
  is_cost_basis_override BOOLEAN NOT NULL DEFAULT 0,
  genai_job_id INTEGER NULL,
  FOREIGN KEY(`acct_id`) REFERENCES `fin_accounts`(`acct_id`)
);
CREATE INDEX `fin_statements_acct_id_index` ON `fin_statements`(`acct_id`);
CREATE TABLE `fin_statement_cash_report`(
  `cash_id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `statement_id` INTEGER NOT NULL,
  `currency` TEXT NOT NULL,
  `line_item` TEXT NOT NULL,
  `total` REAL,
  `securities` REAL,
  `futures` REAL,
  FOREIGN KEY(`statement_id`) REFERENCES `fin_statements`(`statement_id`) ON DELETE CASCADE
);
CREATE INDEX `fin_statement_cash_report_statement_id_index` ON `fin_statement_cash_report`(
  `statement_id`
);
CREATE TABLE `fin_statement_details`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `statement_id` INTEGER NOT NULL,
  `section` TEXT NOT NULL,
  `line_item` TEXT NOT NULL,
  `statement_period_value` REAL NOT NULL,
  `ytd_value` REAL NOT NULL,
  `is_percentage` INTEGER NOT NULL DEFAULT 0,
  `created_at` TEXT,
  `updated_at` TEXT,
  FOREIGN KEY(`statement_id`) REFERENCES `fin_statements`(`statement_id`) ON DELETE CASCADE
);
CREATE TABLE `fin_statement_nav`(
  `nav_id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `statement_id` INTEGER NOT NULL,
  `asset_class` TEXT NOT NULL,
  `prior_total` REAL,
  `current_long` REAL,
  `current_short` REAL,
  `current_total` REAL,
  `change_amount` REAL,
  FOREIGN KEY(`statement_id`) REFERENCES `fin_statements`(`statement_id`) ON DELETE CASCADE
);
CREATE INDEX `fin_statement_nav_statement_id_index` ON `fin_statement_nav`(
  `statement_id`
);
CREATE TABLE `fin_statement_performance`(
  `perf_id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `statement_id` INTEGER NOT NULL,
  `perf_type` TEXT NOT NULL,
  `asset_category` TEXT,
  `symbol` TEXT NOT NULL,
  `prior_quantity` REAL,
  `current_quantity` REAL,
  `prior_price` REAL,
  `current_price` REAL,
  `mtm_pl_position` REAL,
  `mtm_pl_transaction` REAL,
  `mtm_pl_commissions` REAL,
  `mtm_pl_other` REAL,
  `mtm_pl_total` REAL,
  `cost_adj` REAL,
  `realized_st_profit` REAL,
  `realized_st_loss` REAL,
  `realized_lt_profit` REAL,
  `realized_lt_loss` REAL,
  `realized_total` REAL,
  `unrealized_st_profit` REAL,
  `unrealized_st_loss` REAL,
  `unrealized_lt_profit` REAL,
  `unrealized_lt_loss` REAL,
  `unrealized_total` REAL,
  `total_pl` REAL,
  FOREIGN KEY(`statement_id`) REFERENCES `fin_statements`(`statement_id`) ON DELETE CASCADE
);
CREATE INDEX `fin_statement_performance_statement_id_index` ON `fin_statement_performance`(
  `statement_id`
);
CREATE INDEX `fin_statement_performance_symbol_index` ON `fin_statement_performance`(
  `symbol`
);
CREATE TABLE `fin_statement_positions`(
  `position_id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `statement_id` INTEGER NOT NULL,
  `asset_category` TEXT,
  `currency` TEXT,
  `symbol` TEXT NOT NULL,
  `quantity` REAL,
  `multiplier` INTEGER NOT NULL DEFAULT 1,
  `cost_price` REAL,
  `cost_basis` REAL,
  `close_price` REAL,
  `market_value` REAL,
  `unrealized_pl` REAL,
  `opt_type` TEXT,
  `opt_strike` TEXT,
  `opt_expiration` TEXT,
  FOREIGN KEY(`statement_id`) REFERENCES `fin_statements`(`statement_id`) ON DELETE CASCADE
);
CREATE INDEX `fin_statement_positions_statement_id_index` ON `fin_statement_positions`(
  `statement_id`
);
CREATE INDEX `fin_statement_positions_symbol_index` ON `fin_statement_positions`(
  `symbol`
);
CREATE TABLE `fin_statement_securities_lent`(
  `lent_id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `statement_id` INTEGER NOT NULL,
  `symbol` TEXT NOT NULL,
  `start_date` TEXT,
  `fee_rate` REAL,
  `quantity` REAL,
  `collateral_amount` REAL,
  `interest_earned` REAL,
  FOREIGN KEY(`statement_id`) REFERENCES `fin_statements`(`statement_id`) ON DELETE CASCADE
);
CREATE INDEX `fin_statement_securities_lent_statement_id_index` ON `fin_statement_securities_lent`(
  `statement_id`
);
CREATE TABLE `graduated_tax`(
  `year` INTEGER NOT NULL,
  `region` TEXT NOT NULL,
  `income_over` INTEGER NOT NULL,
  `type` TEXT NOT NULL DEFAULT 's',
  `rate` REAL NOT NULL,
  `verified` INTEGER NOT NULL DEFAULT 0,
  UNIQUE(`year`, `region`, `income_over`, `type`)
);
CREATE TABLE `job_batches`(
  `id` TEXT PRIMARY KEY NOT NULL,
  `name` TEXT NOT NULL,
  `total_jobs` INTEGER NOT NULL,
  `pending_jobs` INTEGER NOT NULL,
  `failed_jobs` INTEGER NOT NULL,
  `failed_job_ids` TEXT NOT NULL,
  `options` TEXT,
  `cancelled_at` INTEGER,
  `created_at` INTEGER NOT NULL,
  `finished_at` INTEGER
);
CREATE TABLE `jobs`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `queue` TEXT NOT NULL,
  `payload` TEXT NOT NULL,
  `attempts` INTEGER NOT NULL,
  `reserved_at` INTEGER,
  `available_at` INTEGER NOT NULL,
  `created_at` INTEGER NOT NULL
);
CREATE INDEX `jobs_queue_index` ON `jobs`(`queue`);
CREATE TABLE `migrations`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `migration` TEXT NOT NULL,
  `batch` INTEGER NOT NULL
);
CREATE TABLE `password_reset_tokens`(
  `email` TEXT PRIMARY KEY NOT NULL,
  `token` TEXT NOT NULL,
  `created_at` TEXT
);
CREATE TABLE `phr_lab_results`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `user_id` TEXT,
  `test_name` TEXT,
  `collection_datetime` TEXT,
  `result_datetime` TEXT,
  `result_status` TEXT,
  `ordering_provider` TEXT,
  `resulting_lab` TEXT,
  `analyte` TEXT,
  `value` TEXT,
  `unit` TEXT,
  `range_min` REAL,
  `range_max` REAL,
  `range_unit` TEXT,
  `normal_value` TEXT,
  `message_from_provider` TEXT,
  `result_comment` TEXT,
  `lab_director` TEXT
);
CREATE TABLE `phr_patient_vitals`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `user_id` TEXT,
  `vital_name` TEXT,
  `vital_date` TEXT,
  `vital_value` TEXT
);
CREATE TABLE `product_keys`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `uid` TEXT,
  `product_id` TEXT,
  `product_key` TEXT UNIQUE,
  `product_name` TEXT,
  `computer_name` TEXT,
  `comment` TEXT,
  `used_on` TEXT,
  `claimed_date` TEXT,
  `key_type` TEXT,
  `key_retrieval_note` TEXT
);
CREATE TABLE `session`(
  `id` TEXT PRIMARY KEY NOT NULL,
  `expiresAt` TEXT NOT NULL,
  `token` TEXT NOT NULL UNIQUE,
  `createdAt` TEXT NOT NULL,
  `updatedAt` TEXT NOT NULL,
  `ipAddress` TEXT,
  `userAgent` TEXT,
  `userId` TEXT NOT NULL,
  FOREIGN KEY(`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE `sessions`(
  `id` TEXT PRIMARY KEY NOT NULL,
  `user_id` INTEGER,
  `ip_address` TEXT,
  `user_agent` TEXT,
  `payload` TEXT NOT NULL,
  `last_activity` INTEGER NOT NULL
);
CREATE INDEX `sessions_user_id_index` ON `sessions`(`user_id`);
CREATE INDEX `sessions_last_activity_index` ON `sessions`(`last_activity`);
CREATE TABLE `stock_quotes_daily`(
  `c_date` TEXT NOT NULL,
  `c_symb` TEXT NOT NULL,
  `c_open` REAL NOT NULL,
  `c_high` REAL NOT NULL,
  `c_low` REAL NOT NULL,
  `c_close` REAL NOT NULL,
  `c_vol` INTEGER NOT NULL,
  UNIQUE(`c_symb`, `c_date`)
);
CREATE INDEX `stock_quotes_daily_c_symb_index` ON `stock_quotes_daily`(
  `c_symb`
);
CREATE TABLE `timeseries_documents`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `uid` INTEGER NOT NULL,
  `name` TEXT NOT NULL
);
CREATE TABLE `timeseries_series`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `document_id` INTEGER NOT NULL,
  `series_name` TEXT NOT NULL,
  FOREIGN KEY(`document_id`) REFERENCES `timeseries_documents`(`id`)
);
CREATE INDEX `timeseries_series_document_id_index` ON `timeseries_series`(
  `document_id`
);
CREATE TABLE `timeseries_datapoint`(
  `dp_id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `dp_series_id` INTEGER NOT NULL,
  `dp_date` TEXT,
  `dp_value` TEXT,
  `dp_comment` TEXT,
  FOREIGN KEY(`dp_series_id`) REFERENCES `timeseries_series`(`id`)
);
CREATE INDEX `timeseries_datapoint_dp_series_id_index` ON `timeseries_datapoint`(
  `dp_series_id`
);
CREATE TABLE `twoFactor`(
  `id` TEXT PRIMARY KEY NOT NULL,
  `secret` TEXT NOT NULL,
  `backupCodes` TEXT NOT NULL,
  `userId` TEXT NOT NULL,
  FOREIGN KEY(`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE `utility_account`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `user_id` INTEGER NOT NULL,
  `account_name` TEXT NOT NULL,
  `account_type` TEXT NOT NULL,
  `notes` TEXT,
  `created_at` TEXT,
  `updated_at` TEXT,
  FOREIGN KEY(`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
CREATE INDEX `utility_account_user_id_index` ON `utility_account`(`user_id`);
CREATE TABLE `utility_bill`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `utility_account_id` INTEGER NOT NULL,
  `bill_start_date` TEXT NOT NULL,
  `bill_end_date` TEXT NOT NULL,
  `due_date` TEXT NOT NULL,
  `total_cost` REAL NOT NULL,
  `status` TEXT NOT NULL DEFAULT 'Unpaid',
  `notes` TEXT,
  `power_consumed_kwh` REAL,
  `total_generation_fees` REAL,
  `total_delivery_fees` REAL,
  `taxes` REAL,
  `fees` REAL,
  `discounts` REAL,
  `credits` REAL,
  `payments_received` REAL,
  `previous_unpaid_balance` REAL,
  `t_id` INTEGER,
  `pdf_original_filename` TEXT,
  `pdf_stored_filename` TEXT,
  `pdf_s3_path` TEXT,
  `pdf_file_size_bytes` INTEGER,
  `created_at` TEXT,
  `updated_at` TEXT,
  FOREIGN KEY(`utility_account_id`) REFERENCES `utility_account`(`id`) ON DELETE CASCADE
);
CREATE INDEX `utility_bill_utility_account_id_index` ON `utility_bill`(
  `utility_account_id`
);
CREATE INDEX `utility_bill_t_id_index` ON `utility_bill`(`t_id`);
CREATE TABLE `verification`(
  `id` TEXT PRIMARY KEY NOT NULL,
  `identifier` TEXT NOT NULL,
  `value` TEXT NOT NULL,
  `expiresAt` TEXT NOT NULL,
  `createdAt` TEXT,
  `updatedAt` TEXT
);
CREATE TABLE `vxcv_files`(
  `hash` BLOB PRIMARY KEY NOT NULL,
  `filename` TEXT NOT NULL,
  `mime` TEXT NOT NULL,
  `downloads` INTEGER NOT NULL DEFAULT 0,
  `max_downloads` INTEGER NOT NULL DEFAULT 7,
  `size` INTEGER NOT NULL,
  `uploaded` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `blocked` INTEGER NOT NULL DEFAULT 0,
  `ip` INTEGER NOT NULL
);
CREATE TABLE `vxcv_links`(
  `uniqueid` TEXT PRIMARY KEY NOT NULL,
  `url` TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "vantage_jobs"(
  "id" integer primary key autoincrement not null,
  "uuid" varchar not null,
  "job_class" varchar not null,
  "queue" varchar,
  "connection" varchar,
  "attempt" integer not null default '0',
  "retries" integer not null default '0',
  "retried_from_id" integer,
  "status" varchar check("status" in('processing', 'processed', 'failed')) not null,
  "duration_ms" integer,
  "exception_class" varchar,
  "exception_message" text,
  "stack" text,
  "payload" text,
  "job_tags" text,
  "started_at" datetime,
  "finished_at" datetime,
  "created_at" datetime,
  "updated_at" datetime,
  "memory_start_bytes" integer,
  "memory_end_bytes" integer,
  "memory_peak_start_bytes" integer,
  "memory_peak_end_bytes" integer,
  "memory_peak_delta_bytes" integer,
  "cpu_user_ms" integer,
  "cpu_sys_ms" integer
);
CREATE INDEX "queue_job_runs_uuid_index" on "vantage_jobs"("uuid");
CREATE INDEX "queue_job_runs_job_class_index" on "vantage_jobs"("job_class");
CREATE INDEX "queue_job_runs_queue_index" on "vantage_jobs"("queue");
CREATE INDEX "queue_job_runs_connection_index" on "vantage_jobs"("connection");
CREATE INDEX "queue_job_runs_status_index" on "vantage_jobs"("status");
CREATE INDEX "queue_job_runs_duration_ms_index" on "vantage_jobs"(
  "duration_ms"
);
CREATE INDEX "queue_job_runs_exception_class_index" on "vantage_jobs"(
  "exception_class"
);
CREATE INDEX "queue_job_runs_started_at_index" on "vantage_jobs"("started_at");
CREATE INDEX "queue_job_runs_finished_at_index" on "vantage_jobs"(
  "finished_at"
);
CREATE INDEX "idx_vantage_jobs_created_at" on "vantage_jobs"("created_at");
CREATE INDEX "idx_vantage_jobs_status" on "vantage_jobs"("status");
CREATE INDEX "idx_vantage_jobs_created_status" on "vantage_jobs"(
  "created_at",
  "status"
);
CREATE INDEX "idx_vantage_jobs_job_class" on "vantage_jobs"("job_class");
CREATE INDEX "idx_vantage_jobs_exception_class" on "vantage_jobs"(
  "exception_class"
);
CREATE INDEX "idx_vantage_jobs_queue" on "vantage_jobs"("queue");
CREATE INDEX "idx_vantage_jobs_retried_from" on "vantage_jobs"(
  "retried_from_id"
);
CREATE TABLE IF NOT EXISTS "vantage_job_tags"(
  "id" integer primary key autoincrement not null,
  "job_id" integer not null,
  "tag" varchar not null,
  "created_at" datetime,
  foreign key("job_id") references "vantage_jobs"("id") on delete cascade
);
CREATE INDEX "idx_vantage_job_tags_tag_created" on "vantage_job_tags"(
  "tag",
  "created_at"
);
CREATE INDEX "idx_vantage_job_tags_job_id" on "vantage_job_tags"("job_id");
CREATE INDEX "vantage_job_tags_tag_index" on "vantage_job_tags"("tag");
CREATE TABLE IF NOT EXISTS "client_tasks"(
  "id" integer primary key autoincrement,
  "project_id" integer not null,
  "name" text not null,
  "description" text,
  "due_date" text,
  "completed_at" text,
  "assignee_user_id" integer,
  "creator_user_id" integer,
  "is_high_priority" integer not null default(0),
  "is_hidden_from_clients" integer not null default(0),
  "created_at" text,
  "updated_at" text,
  "deleted_at" text,
  "milestone_price" numeric not null default '0',
  "client_invoice_line_id" integer,
  foreign key("creator_user_id") references users("id") on delete set null on update no action,
  foreign key("assignee_user_id") references users("id") on delete set null on update no action,
  foreign key("project_id") references client_projects("id") on delete cascade on update no action,
  foreign key("client_invoice_line_id") references "client_invoice_lines"("client_invoice_line_id") on delete set null
);
CREATE INDEX "client_tasks_assignee_user_id_index" on "client_tasks"(
  "assignee_user_id"
);
CREATE INDEX "client_tasks_completed_at_index" on "client_tasks"(
  "completed_at"
);
CREATE INDEX "client_tasks_project_id_index" on "client_tasks"("project_id");
CREATE TABLE IF NOT EXISTS "fin_rules"(
  "id" integer primary key autoincrement not null,
  "user_id" integer not null,
  "order" integer not null,
  "title" varchar not null,
  "is_disabled" tinyint(1) not null default '0',
  "stop_processing_if_match" tinyint(1) not null default '0',
  "created_at" datetime,
  "updated_at" datetime,
  foreign key("user_id") references "users"("id")
);
CREATE INDEX "fin_rules_user_id_index" on "fin_rules"("user_id");
CREATE TABLE IF NOT EXISTS "fin_rule_conditions"(
  "id" integer primary key autoincrement not null,
  "rule_id" integer not null,
  "type" varchar not null,
  "operator" varchar not null,
  "value" varchar,
  "value_extra" varchar,
  "created_at" datetime,
  "updated_at" datetime,
  foreign key("rule_id") references "fin_rules"("id") on delete cascade
);
CREATE INDEX "fin_rule_conditions_rule_id_index" on "fin_rule_conditions"(
  "rule_id"
);
CREATE TABLE IF NOT EXISTS "fin_rule_actions"(
  "id" integer primary key autoincrement not null,
  "rule_id" integer not null,
  "type" varchar not null,
  "target" varchar,
  "payload" varchar,
  "order" integer not null,
  "created_at" datetime,
  "updated_at" datetime,
  foreign key("rule_id") references "fin_rules"("id") on delete cascade
);
CREATE INDEX "fin_rule_actions_rule_id_index" on "fin_rule_actions"("rule_id");
CREATE TABLE IF NOT EXISTS "fin_rule_logs"(
  "id" integer primary key autoincrement not null,
  "user_id" integer not null,
  "rule_id" integer not null,
  "transaction_id" integer not null,
  "is_manual_run" tinyint(1) not null default '0',
  "action_summary" varchar,
  "error" text,
  "error_details" text,
  "processing_time_mtime" integer,
  "created_at" datetime,
  "updated_at" datetime
);
CREATE INDEX "fin_rule_logs_user_id_index" on "fin_rule_logs"("user_id");
CREATE INDEX "fin_rule_logs_rule_id_index" on "fin_rule_logs"("rule_id");
CREATE INDEX "fin_rule_logs_transaction_id_index" on "fin_rule_logs"(
  "transaction_id"
);
CREATE TABLE IF NOT EXISTS "fin_employment_entity"(
  "id" integer primary key autoincrement not null,
  "user_id" integer not null,
  "display_name" varchar not null,
  "start_date" date not null,
  "end_date" date,
  "is_current" tinyint(1) not null default '1',
  "ein" varchar,
  "address" text,
  "type" varchar check("type" in('sch_c', 'w2', 'hobby')) not null,
  "sic_code" integer,
  "is_spouse" tinyint(1) not null default '0',
  "created_at" datetime,
  "updated_at" datetime,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  foreign key("user_id") references "users"("id") on delete cascade
);
CREATE INDEX "fin_employment_entity_user_id_index" on "fin_employment_entity"(
  "user_id"
);
CREATE TABLE IF NOT EXISTS "fin_transaction_non_duplicate_pairs"(
  "id" integer primary key autoincrement not null,
  "t_id_1" integer not null,
  "t_id_2" integer not null,
  "created_at" datetime not null default CURRENT_TIMESTAMP,
  foreign key("t_id_1") references "fin_account_line_items"("t_id") on delete cascade,
  foreign key("t_id_2") references "fin_account_line_items"("t_id") on delete cascade
);
CREATE UNIQUE INDEX "fin_transaction_non_duplicate_pairs_t_id_1_t_id_2_unique" on "fin_transaction_non_duplicate_pairs"(
  "t_id_1",
  "t_id_2"
);
CREATE TABLE IF NOT EXISTS "webauthn_credentials"(
  "id" integer primary key autoincrement not null,
  "user_id" integer not null,
  "credential_id" varchar not null,
  "public_key" text not null,
  "counter" integer not null default '0',
  "aaguid" varchar,
  "name" varchar not null default 'Passkey',
  "transports" text,
  "created_at" datetime,
  "updated_at" datetime,
  foreign key("user_id") references "users"("id") on delete cascade
);
CREATE INDEX "webauthn_credentials_user_id_index" on "webauthn_credentials"(
  "user_id"
);
CREATE TABLE IF NOT EXISTS "login_audit_log"(
  "id" integer primary key autoincrement not null,
  "user_id" integer,
  "email" varchar,
  "user_agent" text,
  "success" tinyint(1) not null default '0',
  "method" varchar not null default 'password',
  "is_suspicious" tinyint(1) not null default '0',
  "created_at" datetime,
  "updated_at" datetime,
  "ip_address" blob,
  foreign key("user_id") references "users"("id") on delete set null
);
CREATE INDEX "login_audit_log_user_id_index" on "login_audit_log"("user_id");
CREATE INDEX "login_audit_log_created_at_index" on "login_audit_log"(
  "created_at"
);
CREATE TABLE IF NOT EXISTS "genai_import_jobs"(
  "id" integer primary key autoincrement not null,
  "user_id" integer not null,
  "acct_id" integer,
  "job_type" varchar not null,
  "file_hash" varchar not null,
  "original_filename" varchar not null,
  "s3_path" varchar not null,
  "mime_type" varchar,
  "file_size_bytes" integer not null,
  "context_json" text,
  "status" varchar not null default 'pending',
  "error_message" text,
  "retry_count" integer not null default '0',
  "scheduled_for" date,
  "parsed_at" datetime,
  "created_at" datetime,
  "updated_at" datetime,
  "raw_response" text,
  foreign key("user_id") references "users"("id") on delete cascade,
  foreign key("acct_id") references "fin_accounts"("acct_id") on delete set null
);
CREATE INDEX "genai_import_jobs_user_id_status_index" on "genai_import_jobs"(
  "user_id",
  "status"
);
CREATE INDEX "genai_import_jobs_file_hash_index" on "genai_import_jobs"(
  "file_hash"
);
CREATE INDEX "genai_import_jobs_scheduled_for_status_index" on "genai_import_jobs"(
  "scheduled_for",
  "status"
);
CREATE TABLE IF NOT EXISTS "genai_import_results"(
  "id" integer primary key autoincrement not null,
  "job_id" integer not null,
  "result_index" integer not null,
  "result_json" text not null,
  "status" varchar not null default 'pending_review',
  "imported_at" datetime,
  "created_at" datetime,
  "updated_at" datetime,
  foreign key("job_id") references "genai_import_jobs"("id") on delete cascade
);
CREATE INDEX "genai_import_results_job_id_result_index_index" on "genai_import_results"(
  "job_id",
  "result_index"
);
CREATE TABLE IF NOT EXISTS "genai_daily_quota"(
  "usage_date" date not null,
  "request_count" integer not null default '0',
  "updated_at" datetime,
  primary key("usage_date")
);
CREATE INDEX fin_statements_genai_job_id_index ON fin_statements(genai_job_id);
CREATE TABLE IF NOT EXISTS "fin_account_tag"(
  `tag_id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `tag_userid` TEXT NOT NULL,
  `tag_color` TEXT NOT NULL,
  `tag_label` TEXT NOT NULL,
  `when_added` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `tax_characteristic` varchar check(`tax_characteristic` IN('business_income','business_returns','sce_advertising','sce_car_truck','sce_commissions_fees','sce_contract_labor','sce_depletion','sce_depreciation','sce_employee_benefits','sce_insurance','sce_interest_mortgage','sce_interest_other','sce_legal_professional','sce_office_expenses','sce_pension','sce_rent_vehicles','sce_rent_property','sce_repairs_maintenance','sce_supplies','sce_taxes_licenses','sce_travel','sce_meals','sce_utilities','sce_wages','sce_other','scho_rent','scho_mortgage_interest','scho_real_estate_taxes','scho_insurance','scho_utilities','scho_repairs_maintenance','scho_security','scho_depreciation','scho_cleaning','scho_hoa','scho_casualty_losses','interest','ordinary_dividend','qualified_dividend','other_ordinary_income','w2_wages','w2_other_comp','us_government_interest')),
  `employment_entity_id` INTEGER NULL REFERENCES fin_employment_entity(id) ON DELETE SET NULL,
  UNIQUE(`tag_userid`, `tag_label`)
);
CREATE UNIQUE INDEX "users_mcp_api_key_unique" on "users"("mcp_api_key");
CREATE TABLE IF NOT EXISTS "fin_payslip_state_data"(
  "id" integer primary key autoincrement not null,
  "payslip_id" integer not null,
  "state_code" varchar not null,
  "taxable_wages" numeric,
  "state_tax" numeric,
  "state_tax_addl" numeric,
  "state_disability" numeric,
  "created_at" datetime,
  "updated_at" datetime,
  foreign key("payslip_id") references "fin_payslip"("payslip_id") on delete cascade
);
CREATE INDEX "fin_payslip_state_data_payslip_id_index" on "fin_payslip_state_data"(
  "payslip_id"
);
CREATE TABLE IF NOT EXISTS "fin_payslip"(
  `payslip_id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `uid` INTEGER NOT NULL,
  `period_start` TEXT,
  `period_end` TEXT,
  `pay_date` TEXT,
  `earnings_gross` REAL,
  `earnings_bonus` REAL,
  `earnings_net_pay` REAL NOT NULL DEFAULT 0.0000,
  `earnings_rsu` REAL,
  `earnings_dividend_equivalent` REAL,
  `imp_other` REAL,
  `imp_life_choice` REAL,
  `imp_legal` REAL NOT NULL DEFAULT 0.0000,
  `imp_fitness` REAL NOT NULL DEFAULT 0.0000,
  `imp_ltd` REAL NOT NULL DEFAULT 0.0000,
  `ps_oasdi` REAL,
  `ps_medicare` REAL,
  `taxable_wages_oasdi` REAL,
  `taxable_wages_medicare` REAL,
  `taxable_wages_federal` REAL,
  `ps_fed_tax` REAL,
  `ps_fed_tax_addl` REAL,
  `ps_401k_pretax` REAL,
  `ps_401k_aftertax` REAL,
  `ps_401k_employer` REAL,
  `ps_fed_tax_refunded` REAL,
  `ps_rsu_tax_offset` REAL,
  `ps_rsu_excess_refund` REAL,
  `ps_payslip_file_hash` TEXT,
  `ps_is_estimated` INTEGER NOT NULL DEFAULT 1,
  `ps_comment` TEXT,
  `ps_pretax_medical` REAL NOT NULL DEFAULT 0.0000,
  `ps_pretax_fsa` REAL NOT NULL DEFAULT 0.0000,
  `ps_salary` REAL NOT NULL DEFAULT 0.0000,
  `ps_vacation_payout` REAL NOT NULL DEFAULT 0.0000,
  `ps_pretax_dental` REAL NOT NULL DEFAULT 0.0000,
  `ps_pretax_vision` REAL NOT NULL DEFAULT 0.0000,
  `pto_accrued` REAL,
  `pto_used` REAL,
  `pto_available` REAL,
  `pto_statutory_available` REAL,
  `hours_worked` REAL,
  `other` TEXT,
  `created_at` TEXT,
  `updated_at` TEXT,
  `employment_entity_id` INTEGER NULL REFERENCES fin_employment_entity(id) ON DELETE SET NULL,
  UNIQUE(`uid`, `period_start`, `period_end`, `pay_date`)
);
CREATE TABLE IF NOT EXISTS "fin_payslip_deposits"(
  "id" integer primary key autoincrement not null,
  "payslip_id" integer not null,
  "bank_name" varchar not null,
  "account_last4" varchar,
  "amount" numeric not null,
  "created_at" datetime,
  "updated_at" datetime,
  foreign key("payslip_id") references "fin_payslip"("payslip_id") on delete cascade
);
CREATE INDEX "fin_payslip_deposits_payslip_id_index" on "fin_payslip_deposits"(
  "payslip_id"
);
CREATE TABLE IF NOT EXISTS "fin_tax_documents"(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `user_id` INTEGER NOT NULL,
  `tax_year` INTEGER NOT NULL,
  `form_type` TEXT NOT NULL,
  `employment_entity_id` INTEGER NULL REFERENCES fin_employment_entity(id) ON DELETE SET NULL,
  `account_id` INTEGER NULL REFERENCES fin_accounts(acct_id) ON DELETE SET NULL,
  `original_filename` TEXT ,
  `stored_filename` TEXT ,
  `s3_path` TEXT ,
  `mime_type` TEXT NOT NULL DEFAULT 'application/pdf',
  `file_size_bytes` INTEGER NOT NULL,
  `file_hash` TEXT NOT NULL,
  `uploaded_by_user_id` INTEGER NULL,
  `notes` TEXT NULL,
  `is_reviewed` INTEGER NOT NULL DEFAULT 0,
  `genai_job_id` INTEGER NULL,
  `genai_status` TEXT NULL,
  `parsed_data` TEXT NULL,
  `download_history` TEXT NULL,
  `created_at` TEXT,
  `updated_at` TEXT,
  FOREIGN KEY(`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
CREATE INDEX `fin_tax_documents_user_id_index` ON `fin_tax_documents`(
  `user_id`
);
CREATE INDEX `fin_tax_documents_tax_year_index` ON `fin_tax_documents`(
  `tax_year`
);
CREATE INDEX `fin_tax_documents_employment_entity_id_index` ON `fin_tax_documents`(
  `employment_entity_id`
);
CREATE INDEX `fin_tax_documents_account_id_index` ON `fin_tax_documents`(
  `account_id`
);
CREATE INDEX `fin_tax_documents_form_type_index` ON `fin_tax_documents`(
  `form_type`
);
CREATE INDEX `fin_tax_documents_genai_job_id_index` ON `fin_tax_documents`(
  `genai_job_id`
);
CREATE TABLE IF NOT EXISTS "fin_tax_document_accounts"(
  "id" integer primary key autoincrement not null,
  "tax_document_id" integer not null,
  "account_id" integer,
  "form_type" varchar not null,
  "tax_year" integer not null,
  "is_reviewed" tinyint(1) not null default '0',
  "notes" text,
  "created_at" datetime,
  "updated_at" datetime,
  "ai_identifier" varchar,
  "ai_account_name" varchar,
  foreign key("tax_document_id") references "fin_tax_documents"("id") on delete cascade,
  foreign key("account_id") references "fin_accounts"("acct_id") on delete set null
);
CREATE INDEX "fin_tax_document_accounts_tax_document_id_index" on "fin_tax_document_accounts"(
  "tax_document_id"
);
CREATE INDEX "fin_tax_document_accounts_account_id_index" on "fin_tax_document_accounts"(
  "account_id"
);
CREATE INDEX "fin_tax_document_accounts_account_id_tax_year_index" on "fin_tax_document_accounts"(
  "account_id",
  "tax_year"
);
CREATE TABLE IF NOT EXISTS "fin_account_lots"(
  "lot_id" integer primary key autoincrement not null,
  "acct_id" integer not null,
  "symbol" text not null,
  "description" text,
  "quantity" real not null,
  "purchase_date" text not null,
  "cost_basis" real not null,
  "cost_per_unit" real,
  "sale_date" text,
  "proceeds" real,
  "realized_gain_loss" real,
  "is_short_term" integer,
  "lot_source" text,
  "statement_id" integer,
  "open_t_id" integer,
  "close_t_id" integer,
  "created_at" text,
  "updated_at" text,
  "tax_document_id" integer,
  foreign key("close_t_id") references fin_account_line_items("t_id") on delete set null on update no action,
  foreign key("open_t_id") references fin_account_line_items("t_id") on delete set null on update no action,
  foreign key("statement_id") references fin_statements("statement_id") on delete set null on update no action,
  foreign key("acct_id") references fin_accounts("acct_id") on delete cascade on update no action,
  foreign key("tax_document_id") references "fin_tax_documents"("id") on delete set null
);
CREATE INDEX "fin_account_lots_acct_id_index" on "fin_account_lots"("acct_id");
CREATE INDEX "fin_account_lots_close_t_id_index" on "fin_account_lots"(
  "close_t_id"
);
CREATE INDEX "fin_account_lots_open_t_id_index" on "fin_account_lots"(
  "open_t_id"
);
CREATE INDEX "fin_account_lots_sale_date_index" on "fin_account_lots"(
  "sale_date"
);
CREATE INDEX "fin_account_lots_symbol_index" on "fin_account_lots"("symbol");
CREATE INDEX "fin_account_lots_tax_document_id_index" on "fin_account_lots"(
  "tax_document_id"
);
CREATE INDEX "files_for_fin_accounts_file_hash_index" on "files_for_fin_accounts"(
  "file_hash"
);
CREATE INDEX "client_time_entries_is_deferred_billing_index" on "client_time_entries"(
  "is_deferred_billing"
);
CREATE TABLE IF NOT EXISTS "fin_user_tax_states"(
  "id" integer primary key autoincrement not null,
  "user_id" integer not null,
  "tax_year" integer not null,
  "state_code" varchar not null,
  "created_at" datetime,
  "updated_at" datetime,
  foreign key("user_id") references "users"("id") on delete cascade
);
CREATE UNIQUE INDEX "fin_user_tax_states_user_id_tax_year_state_code_unique" on "fin_user_tax_states"(
  "user_id",
  "tax_year",
  "state_code"
);
CREATE TABLE IF NOT EXISTS "fin_user_deductions"(
  "id" integer primary key autoincrement not null,
  "user_id" integer not null,
  "tax_year" integer not null,
  "category" varchar not null,
  "description" varchar,
  "amount" numeric not null,
  "created_at" datetime,
  "updated_at" datetime,
  foreign key("user_id") references "users"("id") on delete cascade
);
CREATE INDEX "fin_user_deductions_user_id_tax_year_index" on "fin_user_deductions"(
  "user_id",
  "tax_year"
);
CREATE TABLE IF NOT EXISTS "fin_pal_carryforwards"(
  "id" integer primary key autoincrement not null,
  "user_id" integer not null,
  "tax_year" integer not null,
  "activity_name" varchar not null,
  "activity_ein" varchar,
  "ordinary_carryover" numeric not null default '0',
  "short_term_carryover" numeric not null default '0',
  "long_term_carryover" numeric not null default '0',
  "created_at" datetime,
  "updated_at" datetime,
  foreign key("user_id") references "users"("id") on delete cascade
);
CREATE INDEX "fin_pal_carryforwards_user_id_tax_year_index" on "fin_pal_carryforwards"(
  "user_id",
  "tax_year"
);
CREATE UNIQUE INDEX "fin_pal_carryforwards_user_id_tax_year_activity_name_unique" on "fin_pal_carryforwards"(
  "user_id",
  "tax_year",
  "activity_name"
);

INSERT INTO migrations VALUES(1,'0001_01_01_000000_create_schema_baseline',1);
INSERT INTO migrations VALUES(2,'2026_03_05_000000_create_fin_account_lots_table',2);
INSERT INTO migrations VALUES(4,'2026_03_05_100000_add_transaction_ids_to_fin_account_lots',2);
INSERT INTO migrations VALUES(5,'2026_01_28_220930_update_client_invoice_lines_table',3);
INSERT INTO migrations VALUES(6,'2026_01_29_031451_change_quantity_column_to_varchar_in_client_invoice_lines',3);
INSERT INTO migrations VALUES(7,'2026_02_05_062520_add_catch_up_threshold_hours_to_client_agreements_table',3);
INSERT INTO migrations VALUES(8,'2026_02_07_000000_add_starting_balances_to_client_invoices',3);
INSERT INTO migrations VALUES(9,'2026_03_13_083906_add_tax_characteristic_to_fin_account_tag_table',3);
INSERT INTO migrations VALUES(10,'2025_09_23_000000_create_queue_job_runs_table',4);
INSERT INTO migrations VALUES(11,'2025_10_29_000001_add_performance_telemetry_to_queue_job_runs_table',4);
INSERT INTO migrations VALUES(12,'2025_11_30_000002_rename_queue_job_runs_to_vantage_jobs',4);
INSERT INTO migrations VALUES(13,'2025_11_30_000003_add_performance_indexes_to_vantage_jobs',4);
INSERT INTO migrations VALUES(14,'2025_12_12_000004_create_vantage_job_tags_table',4);
INSERT INTO migrations VALUES(15,'2026_03_14_000001_add_income_tax_characteristics_to_fin_account_tag',4);
INSERT INTO migrations VALUES(16,'2026_03_15_000001_add_account_number_to_fin_accounts',4);
INSERT INTO migrations VALUES(17,'2026_03_17_000001_add_milestone_price_and_invoice_line_to_client_tasks',4);
INSERT INTO migrations VALUES(18,'2026_03_18_000001_create_fin_rules_tables',4);
INSERT INTO migrations VALUES(19,'2026_03_19_004809_create_fin_employment_entity_table',4);
INSERT INTO migrations VALUES(20,'2026_03_19_004817_add_employment_entity_id_to_fin_payslip_table',4);
INSERT INTO migrations VALUES(21,'2026_03_19_004822_add_employment_entity_id_to_fin_account_tag_table',4);
INSERT INTO migrations VALUES(22,'2026_03_19_004826_add_new_tax_characteristics_to_fin_account_tag',4);
INSERT INTO migrations VALUES(23,'2026_03_19_004831_add_marriage_status_by_year_to_users_table',4);
INSERT INTO migrations VALUES(24,'2026_03_19_100000_add_w2_tax_characteristics_to_fin_account_tag',4);
INSERT INTO migrations VALUES(25,'2026_03_20_074224_add_cost_basis_to_fin_statements_table',4);
INSERT INTO migrations VALUES(26,'2026_03_21_000001_add_is_hidden_to_fin_employment_entity_table',4);
INSERT INTO migrations VALUES(27,'2026_03_22_063625_create_fin_transaction_non_duplicate_pairs_table',4);
INSERT INTO migrations VALUES(28,'2026_03_22_100000_create_webauthn_and_audit_tables',4);
INSERT INTO migrations VALUES(29,'2026_03_23_000001_create_genai_import_jobs_table',4);
INSERT INTO migrations VALUES(30,'2026_03_23_000002_create_genai_import_results_table',4);
INSERT INTO migrations VALUES(31,'2026_03_23_000003_create_genai_daily_quota_table',4);
INSERT INTO migrations VALUES(32,'2026_03_23_000004_add_genai_daily_quota_limit_to_users_table',4);
INSERT INTO migrations VALUES(33,'2026_03_25_000001_add_genai_job_id_to_fin_statements',4);
INSERT INTO migrations VALUES(34,'2026_03_30_000001_convert_ip_address_to_binary_in_login_audit_log',4);
INSERT INTO migrations VALUES(35,'2026_04_03_020007_drop_queue_monitor_tables',4);
INSERT INTO migrations VALUES(36,'2026_04_03_100000_create_fin_tax_documents_table',4);
INSERT INTO migrations VALUES(37,'2026_04_04_092526_add_raw_response_to_genai_import_jobs_table',4);
INSERT INTO migrations VALUES(38,'2026_04_04_100000_add_genai_fields_to_fin_tax_documents',4);
INSERT INTO migrations VALUES(39,'2026_04_04_110000_add_1099_misc_to_fin_tax_documents_form_type',4);
INSERT INTO migrations VALUES(40,'2026_04_04_110001_add_us_government_interest_tax_characteristic',4);
INSERT INTO migrations VALUES(41,'2026_04_05_021043_combine_tax_document_flags',4);
INSERT INTO migrations VALUES(42,'2026_04_05_100000_add_k1_to_fin_tax_documents_form_type',4);
INSERT INTO migrations VALUES(43,'2026_04_06_000001_add_1116_to_fin_tax_documents_form_type',4);
INSERT INTO migrations VALUES(44,'2026_04_08_013016_add_mcp_api_key_to_users_table',4);
INSERT INTO migrations VALUES(45,'2026_04_08_100001_add_new_fields_to_fin_payslip',4);
INSERT INTO migrations VALUES(46,'2026_04_08_100002_create_fin_payslip_state_data_and_drop_flat_cols',4);
INSERT INTO migrations VALUES(47,'2026_04_08_100003_create_fin_payslip_deposits_table',4);
INSERT INTO migrations VALUES(48,'2026_04_10_100046_add_1099_nec_and_1099_r_to_fin_tax_documents_form_type',4);
INSERT INTO migrations VALUES(49,'2026_04_10_200000_add_broker_form_types_to_fin_tax_documents',4);
INSERT INTO migrations VALUES(50,'2026_04_10_200001_make_tax_document_file_fields_nullable',4);
INSERT INTO migrations VALUES(51,'2026_04_11_000001_convert_finance_domain_to_hard_delete',4);
INSERT INTO migrations VALUES(52,'2026_04_11_062652_create_fin_tax_document_accounts_table',4);
INSERT INTO migrations VALUES(53,'2026_04_11_192648_add_tax_document_id_to_fin_account_lots',4);
INSERT INTO migrations VALUES(54,'2026_03_05_001906_add_hash_and_statement_id_to_finance_tables',2);
INSERT INTO migrations VALUES(55,'2026_04_11_210000_add_ai_fields_to_fin_tax_document_accounts',5);
INSERT INTO migrations VALUES(56,'2026_04_11_231927_normalize_legacy_k1_schema_version',5);
INSERT INTO migrations VALUES(57,'2026_04_19_063834_add_is_deferred_billing_to_client_time_entries',6);
INSERT INTO migrations VALUES(58,'2026_04_19_223420_create_fin_user_tax_states_table',6);
INSERT INTO migrations VALUES(59,'2026_04_19_223421_create_fin_user_deductions_table',6);
INSERT INTO migrations VALUES(60,'2026_04_20_033435_create_fin_pal_carryforwards_table',6);
