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
  `gemini_api_key` TEXT,
  `genai_daily_quota_limit` INTEGER DEFAULT NULL
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
CREATE TABLE `client_tasks`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `project_id` INTEGER NOT NULL,
  `name` TEXT NOT NULL,
  `description` TEXT,
  `due_date` TEXT,
  `completed_at` TEXT,
  `assignee_user_id` INTEGER,
  `creator_user_id` INTEGER,
  `is_high_priority` INTEGER NOT NULL DEFAULT 0,
  `is_hidden_from_clients` INTEGER NOT NULL DEFAULT 0,
  `created_at` TEXT,
  `updated_at` TEXT,
  `deleted_at` TEXT,
  FOREIGN KEY(`project_id`) REFERENCES `client_projects`(`id`) ON DELETE CASCADE,
  FOREIGN KEY(`assignee_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY(`creator_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `client_tasks_project_id_index` ON `client_tasks`(`project_id`);
CREATE INDEX `client_tasks_assignee_user_id_index` ON `client_tasks`(
  `assignee_user_id`
);
CREATE INDEX `client_tasks_completed_at_index` ON `client_tasks`(
  `completed_at`
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
  `file_hash` TEXT,
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
  `deleted_at` TEXT,
  FOREIGN KEY(`uploaded_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `files_for_fin_accounts_acct_id_index` ON `files_for_fin_accounts`(
  `acct_id`
);
CREATE INDEX `files_for_fin_accounts_statement_id_index` ON `files_for_fin_accounts`(
  `statement_id`
);
CREATE INDEX `files_for_fin_accounts_file_hash_index` ON `files_for_fin_accounts`(
  `file_hash`
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
  `when_deleted` TEXT,
  `acct_last_balance` TEXT NOT NULL DEFAULT '0',
  `acct_last_balance_date` TEXT,
  `acct_sort_order` INTEGER NOT NULL DEFAULT 0,
  `acct_is_debt` INTEGER NOT NULL DEFAULT 0,
  `acct_is_retirement` INTEGER NOT NULL DEFAULT 0,
  `when_closed` TEXT,
  `created_at` TEXT,
  `updated_at` TEXT,
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
  `when_deleted` TEXT,
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
  `when_deleted` TEXT,
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
CREATE TABLE `fin_account_tag`(
  `tag_id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `tag_userid` TEXT NOT NULL,
  `tag_color` TEXT NOT NULL,
  `tag_label` TEXT NOT NULL,
  `when_added` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `when_deleted` TEXT,
  "tax_characteristic" varchar check("tax_characteristic" in('sce_advertising', 'sce_car_truck', 'sce_commissions_fees', 'sce_contract_labor', 'sce_depletion', 'sce_depreciation', 'sce_employee_benefits', 'sce_insurance', 'sce_interest_mortgage', 'sce_interest_other', 'sce_legal_professional', 'sce_office_expenses', 'sce_pension', 'sce_rent_vehicles', 'sce_rent_property', 'sce_repairs_maintenance', 'sce_supplies', 'sce_taxes_licenses', 'sce_travel', 'sce_meals', 'sce_utilities', 'sce_wages', 'sce_other', 'scho_rent', 'scho_mortgage_interest', 'scho_real_estate_taxes', 'scho_insurance', 'scho_utilities', 'scho_repairs_maintenance', 'scho_security', 'scho_depreciation', 'scho_cleaning', 'scho_hoa', 'scho_casualty_losses')),
  UNIQUE(`tag_userid`, `tag_label`)
);
CREATE TABLE `fin_account_line_item_tag_map`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `t_id` INTEGER NOT NULL,
  `tag_id` INTEGER NOT NULL,
  `when_added` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `when_deleted` TEXT,
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
CREATE TABLE `fin_payslip`(
  `payslip_id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `uid` INTEGER NOT NULL,
  `period_start` TEXT,
  `period_end` TEXT,
  `pay_date` TEXT,
  `earnings_gross` REAL,
  `earnings_bonus` REAL,
  `earnings_net_pay` REAL NOT NULL DEFAULT 0.0000,
  `earnings_rsu` REAL,
  `imp_other` REAL,
  `imp_legal` REAL NOT NULL DEFAULT 0.0000,
  `imp_fitness` REAL NOT NULL DEFAULT 0.0000,
  `imp_ltd` REAL NOT NULL DEFAULT 0.0000,
  `ps_oasdi` REAL,
  `ps_medicare` REAL,
  `ps_fed_tax` REAL,
  `ps_fed_tax_addl` REAL,
  `ps_state_tax` REAL,
  `ps_state_tax_addl` REAL,
  `ps_state_disability` REAL,
  `ps_401k_pretax` REAL,
  `ps_401k_aftertax` REAL,
  `ps_401k_employer` REAL,
  `ps_fed_tax_refunded` REAL,
  `ps_payslip_file_hash` TEXT,
  `ps_is_estimated` INTEGER NOT NULL DEFAULT 1,
  `ps_comment` TEXT,
  `ps_pretax_medical` REAL NOT NULL DEFAULT 0.0000,
  `ps_pretax_fsa` REAL NOT NULL DEFAULT 0.0000,
  `ps_salary` REAL NOT NULL DEFAULT 0.0000,
  `ps_vacation_payout` REAL NOT NULL DEFAULT 0.0000,
  `ps_pretax_dental` REAL NOT NULL DEFAULT 0.0000,
  `ps_pretax_vision` REAL NOT NULL DEFAULT 0.0000,
  `other` TEXT,
  `created_at` TEXT,
  `updated_at` TEXT,
  `deleted_at` TEXT,
  UNIQUE(`uid`, `period_start`, `period_end`, `pay_date`)
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
  `cost_basis` DECIMAL(15,4) NOT NULL DEFAULT 0,
  `is_cost_basis_override` BOOLEAN NOT NULL DEFAULT 0,
  `statement_opening_date` TEXT,
  `statement_closing_date` TEXT,
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
CREATE TABLE `fin_account_lots`(
  `lot_id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  `acct_id` INTEGER NOT NULL,
  `symbol` TEXT NOT NULL,
  `description` TEXT,
  `quantity` REAL NOT NULL,
  `purchase_date` TEXT NOT NULL,
  `cost_basis` REAL NOT NULL,
  `cost_per_unit` REAL,
  `sale_date` TEXT,
  `proceeds` REAL,
  `realized_gain_loss` REAL,
  `is_short_term` INTEGER,
  `lot_source` TEXT,
  `statement_id` INTEGER,
  `open_t_id` INTEGER,
  `close_t_id` INTEGER,
  `created_at` TEXT,
  `updated_at` TEXT,
  FOREIGN KEY(`acct_id`) REFERENCES `fin_accounts`(`acct_id`) ON DELETE CASCADE,
  FOREIGN KEY(`statement_id`) REFERENCES `fin_statements`(`statement_id`) ON DELETE SET NULL,
  FOREIGN KEY(`open_t_id`) REFERENCES `fin_account_line_items`(`t_id`) ON DELETE SET NULL,
  FOREIGN KEY(`close_t_id`) REFERENCES `fin_account_line_items`(`t_id`) ON DELETE SET NULL
);
CREATE INDEX `fin_account_lots_acct_id_index` ON `fin_account_lots`(`acct_id`);
CREATE INDEX `fin_account_lots_symbol_index` ON `fin_account_lots`(`symbol`);
CREATE INDEX `fin_account_lots_sale_date_index` ON `fin_account_lots`(
  `sale_date`
);
CREATE INDEX `fin_account_lots_open_t_id_index` ON `fin_account_lots`(
  `open_t_id`
);
CREATE INDEX `fin_account_lots_close_t_id_index` ON `fin_account_lots`(
  `close_t_id`
);
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

CREATE TABLE `fin_transaction_non_duplicate_pairs`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `t_id_1` INTEGER NOT NULL,
  `t_id_2` INTEGER NOT NULL,
  `created_at` TEXT,
  UNIQUE(`t_id_1`, `t_id_2`),
  FOREIGN KEY(`t_id_1`) REFERENCES `fin_account_line_items`(`t_id`) ON DELETE CASCADE,
  FOREIGN KEY(`t_id_2`) REFERENCES `fin_account_line_items`(`t_id`) ON DELETE CASCADE
);
CREATE TABLE `webauthn_credentials`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `user_id` INTEGER NOT NULL,
  `credential_id` TEXT NOT NULL,
  `public_key` TEXT NOT NULL,
  `counter` INTEGER NOT NULL DEFAULT 0,
  `aaguid` TEXT,
  `name` TEXT NOT NULL DEFAULT 'Passkey',
  `transports` TEXT,
  `created_at` TEXT,
  `updated_at` TEXT,
  FOREIGN KEY(`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
CREATE INDEX `webauthn_credentials_user_id_index` ON `webauthn_credentials`(`user_id`);
CREATE TABLE `login_audit_log`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `user_id` INTEGER,
  `email` TEXT,
  `ip_address` TEXT,
  `user_agent` TEXT,
  `success` INTEGER NOT NULL DEFAULT 0,
  `method` TEXT NOT NULL DEFAULT 'password',
  `is_suspicious` INTEGER NOT NULL DEFAULT 0,
  `created_at` TEXT,
  `updated_at` TEXT,
  FOREIGN KEY(`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `login_audit_log_user_id_index` ON `login_audit_log`(`user_id`);
CREATE INDEX `login_audit_log_created_at_index` ON `login_audit_log`(`created_at`);
INSERT INTO migrations VALUES(1,'0001_01_01_000000_create_schema_baseline',1);
INSERT INTO migrations VALUES(2,'2026_03_05_000000_create_fin_account_lots_table',2);
INSERT INTO migrations VALUES(3,'2026_03_05_001906_add_hash_and_statement_id_to_finance_tables',2);
INSERT INTO migrations VALUES(4,'2026_03_05_100000_add_transaction_ids_to_fin_account_lots',2);
INSERT INTO migrations VALUES(5,'2026_01_28_220930_update_client_invoice_lines_table',3);
INSERT INTO migrations VALUES(6,'2026_01_29_031451_change_quantity_column_to_varchar_in_client_invoice_lines',3);
INSERT INTO migrations VALUES(7,'2026_02_05_062520_add_catch_up_threshold_hours_to_client_agreements_table',3);
INSERT INTO migrations VALUES(8,'2026_02_07_000000_add_starting_balances_to_client_invoices',3);
INSERT INTO migrations VALUES(9,'2026_03_13_083906_add_tax_characteristic_to_fin_account_tag_table',3);
INSERT INTO migrations VALUES(10,'2026_03_22_063625_create_fin_transaction_non_duplicate_pairs_table',4);
INSERT INTO migrations VALUES(11,'2026_03_22_100000_create_webauthn_and_audit_tables',5);
INSERT INTO migrations VALUES(12,'2026_03_23_000001_create_genai_import_jobs_table',6);
INSERT INTO migrations VALUES(13,'2026_03_23_000002_create_genai_import_results_table',6);
INSERT INTO migrations VALUES(14,'2026_03_23_000003_create_genai_daily_quota_table',6);
CREATE TABLE `genai_import_jobs`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `user_id` INTEGER NOT NULL,
  `acct_id` INTEGER,
  `job_type` TEXT NOT NULL,
  `file_hash` TEXT NOT NULL,
  `original_filename` TEXT NOT NULL,
  `s3_path` TEXT NOT NULL,
  `mime_type` TEXT,
  `file_size_bytes` INTEGER NOT NULL,
  `context_json` TEXT,
  `status` TEXT NOT NULL DEFAULT 'pending',
  `error_message` TEXT,
  `retry_count` INTEGER NOT NULL DEFAULT 0,
  `scheduled_for` TEXT,
  `parsed_at` TEXT,
  `created_at` TEXT,
  `updated_at` TEXT,
  FOREIGN KEY(`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY(`acct_id`) REFERENCES `fin_accounts`(`acct_id`) ON DELETE SET NULL
);
CREATE INDEX `genai_import_jobs_user_id_status_index` ON `genai_import_jobs`(`user_id`, `status`);
CREATE INDEX `genai_import_jobs_file_hash_index` ON `genai_import_jobs`(`file_hash`);
CREATE INDEX `genai_import_jobs_scheduled_for_status_index` ON `genai_import_jobs`(`scheduled_for`, `status`);
CREATE TABLE `genai_import_results`(
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `job_id` INTEGER NOT NULL,
  `result_index` INTEGER NOT NULL,
  `result_json` TEXT NOT NULL,
  `status` TEXT NOT NULL DEFAULT 'pending_review',
  `imported_at` TEXT,
  `created_at` TEXT,
  `updated_at` TEXT,
  FOREIGN KEY(`job_id`) REFERENCES `genai_import_jobs`(`id`) ON DELETE CASCADE
);
CREATE INDEX `genai_import_results_job_id_result_index_index` ON `genai_import_results`(`job_id`, `result_index`);
CREATE TABLE `genai_daily_quota`(
  `usage_date` TEXT PRIMARY KEY NOT NULL,
  `request_count` INTEGER NOT NULL DEFAULT 0,
  `updated_at` TEXT
);
