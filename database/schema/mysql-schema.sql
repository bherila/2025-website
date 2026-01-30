/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `AccountLineItemTag`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `AccountLineItemTag` (
  `tag_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `tag_userid` varchar(255) NOT NULL,
  `tag_color` varchar(255) NOT NULL,
  `tag_label` varchar(255) NOT NULL,
  PRIMARY KEY (`tag_id`),
  UNIQUE KEY `accountlineitemtag_tag_userid_tag_label_unique` (`tag_userid`,`tag_label`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `account`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `account` (
  `id` varchar(191) NOT NULL,
  `accountId` text NOT NULL,
  `providerId` text NOT NULL,
  `userId` varchar(50) NOT NULL,
  `accessToken` text DEFAULT NULL,
  `refreshToken` text DEFAULT NULL,
  `idToken` text DEFAULT NULL,
  `accessTokenExpiresAt` datetime(3) DEFAULT NULL,
  `refreshTokenExpiresAt` datetime(3) DEFAULT NULL,
  `scope` text DEFAULT NULL,
  `password` text DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL,
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `account_userId_fkey` (`userId`),
  CONSTRAINT `account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cache`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cache` (
  `key` varchar(255) NOT NULL,
  `value` mediumtext NOT NULL,
  `expiration` int(11) NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cache_locks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cache_locks` (
  `key` varchar(255) NOT NULL,
  `owner` varchar(255) NOT NULL,
  `expiration` int(11) NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `client_agreements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_agreements` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `client_company_id` bigint(20) unsigned NOT NULL,
  `active_date` datetime NOT NULL DEFAULT current_timestamp(),
  `termination_date` datetime DEFAULT NULL,
  `agreement_text` text DEFAULT NULL,
  `agreement_link` varchar(4096) DEFAULT NULL,
  `client_company_signed_date` datetime DEFAULT NULL,
  `client_company_signed_user_id` bigint(20) unsigned DEFAULT NULL,
  `client_company_signed_name` varchar(255) DEFAULT NULL,
  `client_company_signed_title` varchar(255) DEFAULT NULL,
  `monthly_retainer_hours` decimal(8,2) NOT NULL DEFAULT 0.00,
  `rollover_months` int(11) NOT NULL DEFAULT 1,
  `hourly_rate` decimal(10,2) NOT NULL DEFAULT 0.00,
  `monthly_retainer_fee` decimal(10,2) NOT NULL DEFAULT 0.00,
  `is_visible_to_client` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `client_agreements_client_company_signed_user_id_foreign` (`client_company_signed_user_id`),
  KEY `client_agreements_client_company_id_index` (`client_company_id`),
  KEY `client_agreements_active_date_index` (`active_date`),
  KEY `client_agreements_termination_date_index` (`termination_date`),
  CONSTRAINT `client_agreements_client_company_id_foreign` FOREIGN KEY (`client_company_id`) REFERENCES `client_companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `client_agreements_client_company_signed_user_id_foreign` FOREIGN KEY (`client_company_signed_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `client_companies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_companies` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_name` varchar(255) NOT NULL,
  `slug` varchar(255) NOT NULL DEFAULT '',
  `address` text DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `phone_number` varchar(255) DEFAULT NULL,
  `default_hourly_rate` decimal(8,2) DEFAULT NULL,
  `additional_notes` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `last_activity` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_companies_slug_unique` (`slug`),
  KEY `client_companies_is_active_index` (`is_active`),
  KEY `client_companies_company_name_index` (`company_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `client_company_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_company_user` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `client_company_id` bigint(20) unsigned NOT NULL,
  `user_id` bigint(20) unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_company_user_client_company_id_user_id_unique` (`client_company_id`,`user_id`),
  KEY `client_company_user_user_id_foreign` (`user_id`),
  CONSTRAINT `client_company_user_client_company_id_foreign` FOREIGN KEY (`client_company_id`) REFERENCES `client_companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `client_company_user_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `client_expenses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_expenses` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `client_company_id` bigint(20) unsigned NOT NULL,
  `project_id` bigint(20) unsigned DEFAULT NULL,
  `fin_line_item_id` bigint(20) unsigned DEFAULT NULL,
  `description` varchar(255) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `expense_date` date NOT NULL,
  `is_reimbursable` tinyint(1) NOT NULL DEFAULT 0,
  `is_reimbursed` tinyint(1) NOT NULL DEFAULT 0,
  `reimbursed_date` date DEFAULT NULL,
  `category` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `creator_user_id` bigint(20) unsigned DEFAULT NULL,
  `client_invoice_line_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `client_expenses_creator_user_id_foreign` (`creator_user_id`),
  KEY `client_expenses_client_company_id_index` (`client_company_id`),
  KEY `client_expenses_project_id_index` (`project_id`),
  KEY `client_expenses_fin_line_item_id_index` (`fin_line_item_id`),
  KEY `client_expenses_expense_date_index` (`expense_date`),
  KEY `client_expenses_is_reimbursable_index` (`is_reimbursable`),
  KEY `client_expenses_client_invoice_line_id_foreign` (`client_invoice_line_id`),
  CONSTRAINT `client_expenses_client_company_id_foreign` FOREIGN KEY (`client_company_id`) REFERENCES `client_companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `client_expenses_client_invoice_line_id_foreign` FOREIGN KEY (`client_invoice_line_id`) REFERENCES `client_invoice_lines` (`client_invoice_line_id`) ON DELETE SET NULL,
  CONSTRAINT `client_expenses_creator_user_id_foreign` FOREIGN KEY (`creator_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `client_expenses_fin_line_item_id_foreign` FOREIGN KEY (`fin_line_item_id`) REFERENCES `fin_account_line_items` (`t_id`) ON DELETE SET NULL,
  CONSTRAINT `client_expenses_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `client_projects` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `client_invoice_lines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_invoice_lines` (
  `client_invoice_line_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `client_invoice_id` bigint(20) unsigned NOT NULL,
  `client_agreement_id` bigint(20) unsigned DEFAULT NULL,
  `description` varchar(255) NOT NULL,
  `quantity` varchar(20) NOT NULL DEFAULT '1',
  `unit_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `line_total` decimal(10,2) NOT NULL DEFAULT 0.00,
  `line_type` enum('retainer','additional_hours','expense','adjustment','credit','prior_month_retainer','prior_month_billable') NOT NULL DEFAULT 'retainer',
  `hours` decimal(10,4) DEFAULT NULL,
  `line_date` date DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`client_invoice_line_id`),
  KEY `client_invoice_lines_client_invoice_id_index` (`client_invoice_id`),
  KEY `client_invoice_lines_client_agreement_id_foreign` (`client_agreement_id`),
  CONSTRAINT `client_invoice_lines_client_agreement_id_foreign` FOREIGN KEY (`client_agreement_id`) REFERENCES `client_agreements` (`id`),
  CONSTRAINT `client_invoice_lines_client_invoice_id_foreign` FOREIGN KEY (`client_invoice_id`) REFERENCES `client_invoices` (`client_invoice_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `client_invoice_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_invoice_payments` (
  `client_invoice_payment_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `client_invoice_id` bigint(20) unsigned NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `payment_date` date NOT NULL,
  `payment_method` varchar(255) NOT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`client_invoice_payment_id`),
  KEY `client_invoice_payments_client_invoice_id_foreign` (`client_invoice_id`),
  CONSTRAINT `client_invoice_payments_client_invoice_id_foreign` FOREIGN KEY (`client_invoice_id`) REFERENCES `client_invoices` (`client_invoice_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `client_invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_invoices` (
  `client_invoice_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `client_company_id` bigint(20) unsigned NOT NULL,
  `client_agreement_id` bigint(20) unsigned DEFAULT NULL,
  `period_start` date DEFAULT NULL,
  `period_end` date DEFAULT NULL,
  `invoice_number` varchar(255) DEFAULT NULL,
  `invoice_total` decimal(10,2) NOT NULL DEFAULT 0.00,
  `issue_date` datetime DEFAULT NULL,
  `due_date` datetime DEFAULT NULL,
  `paid_date` datetime DEFAULT NULL,
  `retainer_hours_included` decimal(10,4) NOT NULL DEFAULT 0.0000,
  `hours_worked` decimal(10,4) NOT NULL DEFAULT 0.0000,
  `rollover_hours_used` decimal(10,4) NOT NULL DEFAULT 0.0000,
  `unused_hours_balance` decimal(10,4) NOT NULL DEFAULT 0.0000,
  `negative_hours_balance` decimal(10,4) NOT NULL DEFAULT 0.0000,
  `hours_billed_at_rate` decimal(10,4) NOT NULL DEFAULT 0.0000,
  `status` enum('draft','issued','paid','void') NOT NULL DEFAULT 'draft',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`client_invoice_id`),
  KEY `client_invoices_client_company_id_index` (`client_company_id`),
  KEY `client_invoices_client_agreement_id_index` (`client_agreement_id`),
  KEY `client_invoices_issue_date_index` (`issue_date`),
  KEY `client_invoices_status_index` (`status`),
  CONSTRAINT `client_invoices_client_agreement_id_foreign` FOREIGN KEY (`client_agreement_id`) REFERENCES `client_agreements` (`id`) ON DELETE SET NULL,
  CONSTRAINT `client_invoices_client_company_id_foreign` FOREIGN KEY (`client_company_id`) REFERENCES `client_companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `client_projects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_projects` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `client_company_id` bigint(20) unsigned NOT NULL,
  `name` varchar(255) NOT NULL,
  `slug` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `creator_user_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_projects_slug_unique` (`slug`),
  KEY `client_projects_creator_user_id_foreign` (`creator_user_id`),
  KEY `client_projects_client_company_id_index` (`client_company_id`),
  CONSTRAINT `client_projects_client_company_id_foreign` FOREIGN KEY (`client_company_id`) REFERENCES `client_companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `client_projects_creator_user_id_foreign` FOREIGN KEY (`creator_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `client_tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_tasks` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint(20) unsigned NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `due_date` datetime DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `assignee_user_id` bigint(20) unsigned DEFAULT NULL,
  `creator_user_id` bigint(20) unsigned DEFAULT NULL,
  `is_high_priority` tinyint(1) NOT NULL DEFAULT 0,
  `is_hidden_from_clients` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `client_tasks_creator_user_id_foreign` (`creator_user_id`),
  KEY `client_tasks_project_id_index` (`project_id`),
  KEY `client_tasks_assignee_user_id_index` (`assignee_user_id`),
  KEY `client_tasks_completed_at_index` (`completed_at`),
  CONSTRAINT `client_tasks_assignee_user_id_foreign` FOREIGN KEY (`assignee_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `client_tasks_creator_user_id_foreign` FOREIGN KEY (`creator_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `client_tasks_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `client_projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `client_time_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_time_entries` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint(20) unsigned NOT NULL,
  `client_company_id` bigint(20) unsigned NOT NULL,
  `task_id` bigint(20) unsigned DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `minutes_worked` int(11) NOT NULL,
  `date_worked` date NOT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `creator_user_id` bigint(20) unsigned DEFAULT NULL,
  `is_billable` tinyint(1) NOT NULL DEFAULT 1,
  `job_type` varchar(255) NOT NULL DEFAULT 'Software Development',
  `client_invoice_line_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `client_time_entries_creator_user_id_foreign` (`creator_user_id`),
  KEY `client_time_entries_project_id_index` (`project_id`),
  KEY `client_time_entries_client_company_id_index` (`client_company_id`),
  KEY `client_time_entries_task_id_index` (`task_id`),
  KEY `client_time_entries_user_id_index` (`user_id`),
  KEY `client_time_entries_date_worked_index` (`date_worked`),
  KEY `client_time_entries_client_invoice_line_id_index` (`client_invoice_line_id`),
  CONSTRAINT `client_time_entries_client_company_id_foreign` FOREIGN KEY (`client_company_id`) REFERENCES `client_companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `client_time_entries_client_invoice_line_id_foreign` FOREIGN KEY (`client_invoice_line_id`) REFERENCES `client_invoice_lines` (`client_invoice_line_id`),
  CONSTRAINT `client_time_entries_creator_user_id_foreign` FOREIGN KEY (`creator_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `client_time_entries_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `client_projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `client_time_entries_task_id_foreign` FOREIGN KEY (`task_id`) REFERENCES `client_tasks` (`id`) ON DELETE SET NULL,
  CONSTRAINT `client_time_entries_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `earnings_annual`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `earnings_annual` (
  `symbol` char(5) NOT NULL,
  `fiscalDateEnding` date NOT NULL,
  `reportedEPS` decimal(10,4) DEFAULT NULL,
  PRIMARY KEY (`symbol`,`fiscalDateEnding`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `earnings_quarterly`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `earnings_quarterly` (
  `symbol` char(5) NOT NULL,
  `fiscalDateEnding` date NOT NULL,
  `reportedDate` date DEFAULT NULL,
  `reportedEPS` decimal(10,4) DEFAULT NULL,
  `estimatedEPS` decimal(10,4) DEFAULT NULL,
  `surprise` decimal(10,4) DEFAULT NULL,
  `surprisePercentage` decimal(10,4) DEFAULT NULL,
  PRIMARY KEY (`symbol`,`fiscalDateEnding`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `failed_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `failed_jobs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` varchar(255) NOT NULL,
  `connection` text NOT NULL,
  `queue` text NOT NULL,
  `payload` longtext NOT NULL,
  `exception` longtext NOT NULL,
  `failed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `failed_jobs_uuid_unique` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `files_for_agreements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `files_for_agreements` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `agreement_id` bigint(20) unsigned NOT NULL,
  `original_filename` varchar(255) NOT NULL,
  `stored_filename` varchar(255) NOT NULL,
  `s3_path` varchar(255) NOT NULL,
  `mime_type` varchar(255) DEFAULT NULL,
  `file_size_bytes` bigint(20) unsigned NOT NULL,
  `uploaded_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `download_history` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Array of {user_id, downloaded_at}' CHECK (json_valid(`download_history`)),
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `files_for_agreements_uploaded_by_user_id_foreign` (`uploaded_by_user_id`),
  KEY `files_for_agreements_agreement_id_index` (`agreement_id`),
  CONSTRAINT `files_for_agreements_agreement_id_foreign` FOREIGN KEY (`agreement_id`) REFERENCES `client_agreements` (`id`) ON DELETE CASCADE,
  CONSTRAINT `files_for_agreements_uploaded_by_user_id_foreign` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `files_for_client_companies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `files_for_client_companies` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `client_company_id` bigint(20) unsigned NOT NULL,
  `original_filename` varchar(255) NOT NULL,
  `stored_filename` varchar(255) NOT NULL,
  `s3_path` varchar(255) NOT NULL,
  `mime_type` varchar(255) DEFAULT NULL,
  `file_size_bytes` bigint(20) unsigned NOT NULL,
  `uploaded_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `download_history` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Array of {user_id, downloaded_at}' CHECK (json_valid(`download_history`)),
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `files_for_client_companies_uploaded_by_user_id_foreign` (`uploaded_by_user_id`),
  KEY `files_for_client_companies_client_company_id_index` (`client_company_id`),
  CONSTRAINT `files_for_client_companies_client_company_id_foreign` FOREIGN KEY (`client_company_id`) REFERENCES `client_companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `files_for_client_companies_uploaded_by_user_id_foreign` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `files_for_fin_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `files_for_fin_accounts` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `acct_id` bigint(20) unsigned NOT NULL,
  `statement_id` bigint(20) unsigned DEFAULT NULL COMMENT 'Optional link to parsed statement',
  `original_filename` varchar(255) NOT NULL,
  `stored_filename` varchar(255) NOT NULL,
  `s3_path` varchar(255) NOT NULL,
  `mime_type` varchar(255) DEFAULT NULL,
  `file_size_bytes` bigint(20) unsigned NOT NULL,
  `uploaded_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `download_history` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Array of {user_id, downloaded_at}' CHECK (json_valid(`download_history`)),
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `files_for_fin_accounts_uploaded_by_user_id_foreign` (`uploaded_by_user_id`),
  KEY `files_for_fin_accounts_acct_id_index` (`acct_id`),
  KEY `files_for_fin_accounts_statement_id_index` (`statement_id`),
  CONSTRAINT `files_for_fin_accounts_acct_id_foreign` FOREIGN KEY (`acct_id`) REFERENCES `fin_accounts` (`acct_id`) ON DELETE CASCADE,
  CONSTRAINT `files_for_fin_accounts_uploaded_by_user_id_foreign` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `files_for_projects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `files_for_projects` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint(20) unsigned NOT NULL,
  `original_filename` varchar(255) NOT NULL,
  `stored_filename` varchar(255) NOT NULL,
  `s3_path` varchar(255) NOT NULL,
  `mime_type` varchar(255) DEFAULT NULL,
  `file_size_bytes` bigint(20) unsigned NOT NULL,
  `uploaded_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `download_history` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Array of {user_id, downloaded_at}' CHECK (json_valid(`download_history`)),
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `files_for_projects_uploaded_by_user_id_foreign` (`uploaded_by_user_id`),
  KEY `files_for_projects_project_id_index` (`project_id`),
  CONSTRAINT `files_for_projects_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `client_projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `files_for_projects_uploaded_by_user_id_foreign` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `files_for_tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `files_for_tasks` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `task_id` bigint(20) unsigned NOT NULL,
  `original_filename` varchar(255) NOT NULL,
  `stored_filename` varchar(255) NOT NULL,
  `s3_path` varchar(255) NOT NULL,
  `mime_type` varchar(255) DEFAULT NULL,
  `file_size_bytes` bigint(20) unsigned NOT NULL,
  `uploaded_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `download_history` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Array of {user_id, downloaded_at}' CHECK (json_valid(`download_history`)),
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `files_for_tasks_uploaded_by_user_id_foreign` (`uploaded_by_user_id`),
  KEY `files_for_tasks_task_id_index` (`task_id`),
  CONSTRAINT `files_for_tasks_task_id_foreign` FOREIGN KEY (`task_id`) REFERENCES `client_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `files_for_tasks_uploaded_by_user_id_foreign` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fin_account_line_item_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_account_line_item_links` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `parent_t_id` bigint(20) unsigned NOT NULL COMMENT 'The parent transaction ID (typically the source/withdrawal)',
  `child_t_id` bigint(20) unsigned NOT NULL COMMENT 'The child transaction ID (typically the destination/deposit)',
  `when_added` timestamp NOT NULL DEFAULT current_timestamp(),
  `when_deleted` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `fin_account_line_item_links_parent_t_id_child_t_id_unique` (`parent_t_id`,`child_t_id`),
  KEY `fin_account_line_item_links_parent_t_id_index` (`parent_t_id`),
  KEY `fin_account_line_item_links_child_t_id_index` (`child_t_id`),
  CONSTRAINT `fin_account_line_item_links_child_t_id_foreign` FOREIGN KEY (`child_t_id`) REFERENCES `fin_account_line_items` (`t_id`) ON DELETE CASCADE,
  CONSTRAINT `fin_account_line_item_links_parent_t_id_foreign` FOREIGN KEY (`parent_t_id`) REFERENCES `fin_account_line_items` (`t_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fin_account_line_item_tag_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_account_line_item_tag_map` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `t_id` bigint(20) unsigned NOT NULL,
  `tag_id` bigint(20) unsigned NOT NULL,
  `when_added` timestamp NOT NULL DEFAULT current_timestamp(),
  `when_deleted` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `fin_account_line_item_tag_map_t_id_tag_id_unique` (`t_id`,`tag_id`),
  KEY `fin_account_line_item_tag_map_tag_id_index` (`tag_id`),
  CONSTRAINT `fin_account_line_item_tag_map_t_id_fkey` FOREIGN KEY (`t_id`) REFERENCES `fin_account_line_items` (`t_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fin_account_line_item_tag_map_t_id_foreign` FOREIGN KEY (`t_id`) REFERENCES `fin_account_line_items` (`t_id`) ON DELETE CASCADE,
  CONSTRAINT `fin_account_line_item_tag_map_tag_id_fkey` FOREIGN KEY (`tag_id`) REFERENCES `fin_account_tag` (`tag_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fin_account_line_item_tag_map_tag_id_foreign` FOREIGN KEY (`tag_id`) REFERENCES `fin_account_tag` (`tag_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fin_account_line_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_account_line_items` (
  `t_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `t_account` bigint(20) unsigned DEFAULT NULL,
  `t_date` varchar(10) NOT NULL,
  `t_type` varchar(255) DEFAULT NULL,
  `t_schc_category` varchar(255) DEFAULT NULL,
  `t_amt` decimal(13,4) DEFAULT NULL,
  `t_symbol` varchar(20) DEFAULT NULL,
  `t_qty` double DEFAULT 0,
  `t_price` decimal(13,4) DEFAULT NULL,
  `t_commission` decimal(13,4) DEFAULT NULL,
  `t_fee` decimal(13,4) DEFAULT NULL,
  `t_basis` decimal(13,4) DEFAULT NULL,
  `t_realized_pl` decimal(13,4) DEFAULT NULL,
  `t_mtm_pl` decimal(13,4) DEFAULT NULL,
  `t_method` varchar(20) DEFAULT NULL,
  `t_source` varchar(20) DEFAULT NULL,
  `t_origin` varchar(20) DEFAULT NULL,
  `opt_expiration` varchar(10) DEFAULT NULL,
  `opt_type` enum('call','put') DEFAULT NULL,
  `opt_strike` decimal(13,4) DEFAULT NULL,
  `t_description` varchar(255) DEFAULT NULL,
  `t_comment` varchar(255) DEFAULT NULL,
  `t_from` varchar(10) DEFAULT NULL,
  `t_to` varchar(10) DEFAULT NULL,
  `t_interest_rate` varchar(20) DEFAULT NULL,
  `t_cusip` varchar(20) DEFAULT NULL,
  `conid` varchar(50) DEFAULT NULL,
  `underlying` varchar(20) DEFAULT NULL,
  `listing_exch` varchar(50) DEFAULT NULL,
  `multiplier` int(11) DEFAULT NULL,
  `when_added` timestamp NULL DEFAULT NULL,
  `when_deleted` timestamp NULL DEFAULT NULL,
  `t_harvested_amount` decimal(13,4) DEFAULT NULL,
  `t_is_not_duplicate` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'When true, this transaction has been verified as not a duplicate',
  `t_date_posted` varchar(10) DEFAULT NULL,
  `t_account_balance` decimal(13,4) DEFAULT NULL,
  PRIMARY KEY (`t_id`),
  KEY `fin_account_line_items_t_account_index` (`t_account`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fin_account_tag`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_account_tag` (
  `tag_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `tag_userid` varchar(50) NOT NULL,
  `tag_color` varchar(20) NOT NULL,
  `tag_label` varchar(50) NOT NULL,
  `when_added` timestamp NOT NULL DEFAULT current_timestamp(),
  `when_deleted` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`tag_id`),
  UNIQUE KEY `fin_account_tag_tag_userid_tag_label_unique` (`tag_userid`,`tag_label`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fin_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_accounts` (
  `acct_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `acct_owner` varchar(50) NOT NULL,
  `acct_name` varchar(50) NOT NULL,
  `when_deleted` timestamp NULL DEFAULT NULL,
  `acct_last_balance` varchar(20) NOT NULL DEFAULT '0',
  `acct_last_balance_date` timestamp NULL DEFAULT NULL,
  `acct_sort_order` int(11) NOT NULL DEFAULT 0,
  `acct_is_debt` tinyint(1) NOT NULL DEFAULT 0,
  `acct_is_retirement` tinyint(1) NOT NULL DEFAULT 0,
  `when_closed` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`acct_id`),
  UNIQUE KEY `fin_accounts_acct_owner_acct_name_unique` (`acct_owner`,`acct_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fin_equity_awards`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_equity_awards` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `award_id` char(20) NOT NULL,
  `grant_date` char(10) NOT NULL,
  `vest_date` char(10) NOT NULL,
  `share_count` int(11) NOT NULL,
  `symbol` char(4) NOT NULL,
  `uid` varchar(50) NOT NULL,
  `vest_price` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `fin_equity_awards_grant_date_award_id_vest_date_symbol_unique` (`grant_date`,`award_id`,`vest_date`,`symbol`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fin_payslip`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_payslip` (
  `payslip_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uid` int(50) NOT NULL,
  `period_start` char(10) DEFAULT NULL,
  `period_end` char(10) DEFAULT NULL,
  `pay_date` char(10) DEFAULT NULL,
  `earnings_gross` decimal(10,4) DEFAULT NULL,
  `earnings_bonus` decimal(10,4) DEFAULT NULL,
  `earnings_net_pay` decimal(10,4) NOT NULL DEFAULT 0.0000,
  `earnings_rsu` decimal(10,4) DEFAULT NULL,
  `imp_other` decimal(10,4) DEFAULT NULL,
  `imp_legal` decimal(10,4) NOT NULL DEFAULT 0.0000,
  `imp_fitness` decimal(10,4) NOT NULL DEFAULT 0.0000,
  `imp_ltd` decimal(10,4) NOT NULL DEFAULT 0.0000,
  `ps_oasdi` decimal(10,4) DEFAULT NULL,
  `ps_medicare` decimal(10,4) DEFAULT NULL,
  `ps_fed_tax` decimal(10,4) DEFAULT NULL,
  `ps_fed_tax_addl` decimal(10,4) DEFAULT NULL,
  `ps_state_tax` decimal(10,4) DEFAULT NULL,
  `ps_state_tax_addl` decimal(10,4) DEFAULT NULL,
  `ps_state_disability` decimal(10,4) DEFAULT NULL,
  `ps_401k_pretax` decimal(10,4) DEFAULT NULL,
  `ps_401k_aftertax` decimal(10,4) DEFAULT NULL,
  `ps_401k_employer` decimal(6,2) DEFAULT NULL,
  `ps_fed_tax_refunded` decimal(10,4) DEFAULT NULL,
  `ps_payslip_file_hash` varchar(50) DEFAULT NULL,
  `ps_is_estimated` tinyint(1) NOT NULL DEFAULT 1,
  `ps_comment` varchar(1000) DEFAULT NULL,
  `ps_pretax_medical` decimal(10,4) NOT NULL DEFAULT 0.0000,
  `ps_pretax_fsa` decimal(10,4) NOT NULL DEFAULT 0.0000,
  `ps_salary` decimal(10,4) NOT NULL DEFAULT 0.0000,
  `ps_vacation_payout` decimal(10,4) NOT NULL DEFAULT 0.0000,
  `ps_pretax_dental` decimal(10,4) NOT NULL DEFAULT 0.0000,
  `ps_pretax_vision` decimal(10,4) NOT NULL DEFAULT 0.0000,
  `other` mediumtext DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`payslip_id`),
  UNIQUE KEY `fin_payslip_uid_period_start_period_end_pay_date_unique` (`uid`,`period_start`,`period_end`,`pay_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fin_payslip_uploads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_payslip_uploads` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `file_name` varchar(200) DEFAULT NULL,
  `file_hash` varchar(50) DEFAULT NULL,
  `parsed_json` longtext DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fin_statement_cash_report`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_statement_cash_report` (
  `cash_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `statement_id` bigint(20) unsigned NOT NULL,
  `currency` varchar(20) NOT NULL,
  `line_item` varchar(100) NOT NULL,
  `total` decimal(18,4) DEFAULT NULL,
  `securities` decimal(18,4) DEFAULT NULL,
  `futures` decimal(18,4) DEFAULT NULL,
  PRIMARY KEY (`cash_id`),
  KEY `fin_statement_cash_report_snapshot_id_index` (`statement_id`),
  CONSTRAINT `fin_statement_cash_report_statement_id_foreign` FOREIGN KEY (`statement_id`) REFERENCES `fin_statements` (`statement_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fin_statement_details`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_statement_details` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `statement_id` bigint(20) unsigned NOT NULL,
  `section` varchar(255) NOT NULL,
  `line_item` varchar(255) NOT NULL,
  `statement_period_value` decimal(16,4) NOT NULL,
  `ytd_value` decimal(16,4) NOT NULL,
  `is_percentage` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fin_statement_details_statement_id_foreign` (`statement_id`),
  CONSTRAINT `fin_statement_details_statement_id_foreign` FOREIGN KEY (`statement_id`) REFERENCES `fin_statements` (`statement_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fin_statement_nav`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_statement_nav` (
  `nav_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `statement_id` bigint(20) unsigned NOT NULL,
  `asset_class` varchar(50) NOT NULL,
  `prior_total` decimal(18,4) DEFAULT NULL,
  `current_long` decimal(18,4) DEFAULT NULL,
  `current_short` decimal(18,4) DEFAULT NULL,
  `current_total` decimal(18,4) DEFAULT NULL,
  `change_amount` decimal(18,4) DEFAULT NULL,
  PRIMARY KEY (`nav_id`),
  KEY `fin_statement_nav_snapshot_id_index` (`statement_id`),
  CONSTRAINT `fin_statement_nav_statement_id_foreign` FOREIGN KEY (`statement_id`) REFERENCES `fin_statements` (`statement_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fin_statement_performance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_statement_performance` (
  `perf_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `statement_id` bigint(20) unsigned NOT NULL,
  `perf_type` enum('mtm','realized_unrealized') NOT NULL,
  `asset_category` varchar(50) DEFAULT NULL,
  `symbol` varchar(50) NOT NULL,
  `prior_quantity` decimal(18,8) DEFAULT NULL,
  `current_quantity` decimal(18,8) DEFAULT NULL,
  `prior_price` decimal(18,8) DEFAULT NULL,
  `current_price` decimal(18,8) DEFAULT NULL,
  `mtm_pl_position` decimal(18,4) DEFAULT NULL,
  `mtm_pl_transaction` decimal(18,4) DEFAULT NULL,
  `mtm_pl_commissions` decimal(18,4) DEFAULT NULL,
  `mtm_pl_other` decimal(18,4) DEFAULT NULL,
  `mtm_pl_total` decimal(18,4) DEFAULT NULL,
  `cost_adj` decimal(18,4) DEFAULT NULL,
  `realized_st_profit` decimal(18,4) DEFAULT NULL,
  `realized_st_loss` decimal(18,4) DEFAULT NULL,
  `realized_lt_profit` decimal(18,4) DEFAULT NULL,
  `realized_lt_loss` decimal(18,4) DEFAULT NULL,
  `realized_total` decimal(18,4) DEFAULT NULL,
  `unrealized_st_profit` decimal(18,4) DEFAULT NULL,
  `unrealized_st_loss` decimal(18,4) DEFAULT NULL,
  `unrealized_lt_profit` decimal(18,4) DEFAULT NULL,
  `unrealized_lt_loss` decimal(18,4) DEFAULT NULL,
  `unrealized_total` decimal(18,4) DEFAULT NULL,
  `total_pl` decimal(18,4) DEFAULT NULL,
  PRIMARY KEY (`perf_id`),
  KEY `fin_statement_performance_snapshot_id_index` (`statement_id`),
  KEY `fin_statement_performance_symbol_index` (`symbol`),
  CONSTRAINT `fin_statement_performance_statement_id_foreign` FOREIGN KEY (`statement_id`) REFERENCES `fin_statements` (`statement_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fin_statement_positions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_statement_positions` (
  `position_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `statement_id` bigint(20) unsigned NOT NULL,
  `asset_category` varchar(50) DEFAULT NULL,
  `currency` varchar(10) DEFAULT NULL,
  `symbol` varchar(50) NOT NULL,
  `quantity` decimal(18,8) DEFAULT NULL,
  `multiplier` int(11) NOT NULL DEFAULT 1,
  `cost_price` decimal(18,8) DEFAULT NULL,
  `cost_basis` decimal(18,4) DEFAULT NULL,
  `close_price` decimal(18,8) DEFAULT NULL,
  `market_value` decimal(18,4) DEFAULT NULL,
  `unrealized_pl` decimal(18,4) DEFAULT NULL,
  `opt_type` enum('call','put') DEFAULT NULL,
  `opt_strike` varchar(20) DEFAULT NULL,
  `opt_expiration` date DEFAULT NULL,
  PRIMARY KEY (`position_id`),
  KEY `fin_statement_positions_snapshot_id_index` (`statement_id`),
  KEY `fin_statement_positions_symbol_index` (`symbol`),
  CONSTRAINT `fin_statement_positions_statement_id_foreign` FOREIGN KEY (`statement_id`) REFERENCES `fin_statements` (`statement_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fin_statement_securities_lent`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_statement_securities_lent` (
  `lent_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `statement_id` bigint(20) unsigned NOT NULL,
  `symbol` varchar(50) NOT NULL,
  `start_date` date DEFAULT NULL,
  `fee_rate` decimal(10,6) DEFAULT NULL,
  `quantity` decimal(18,8) DEFAULT NULL,
  `collateral_amount` decimal(18,4) DEFAULT NULL,
  `interest_earned` decimal(18,4) DEFAULT NULL,
  PRIMARY KEY (`lent_id`),
  KEY `fin_statement_securities_lent_snapshot_id_index` (`statement_id`),
  CONSTRAINT `fin_statement_securities_lent_statement_id_foreign` FOREIGN KEY (`statement_id`) REFERENCES `fin_statements` (`statement_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fin_statements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_statements` (
  `statement_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `acct_id` bigint(20) unsigned NOT NULL,
  `balance` varchar(20) NOT NULL,
  `statement_opening_date` date DEFAULT NULL,
  `statement_closing_date` date DEFAULT NULL,
  PRIMARY KEY (`statement_id`),
  KEY `fin_account_balance_snapshot_acct_id_index` (`acct_id`),
  CONSTRAINT `fin_account_balance_snapshot_acct_id_foreign` FOREIGN KEY (`acct_id`) REFERENCES `fin_accounts` (`acct_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `graduated_tax`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `graduated_tax` (
  `year` int(11) NOT NULL,
  `region` char(2) NOT NULL,
  `income_over` int(11) NOT NULL,
  `type` enum('s','mfj','mfs','hoh') NOT NULL DEFAULT 's',
  `rate` decimal(10,4) NOT NULL,
  `verified` tinyint(1) NOT NULL DEFAULT 0,
  UNIQUE KEY `graduated_tax_year_region_income_over_type_unique` (`year`,`region`,`income_over`,`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `job_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_batches` (
  `id` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `total_jobs` int(11) NOT NULL,
  `pending_jobs` int(11) NOT NULL,
  `failed_jobs` int(11) NOT NULL,
  `failed_job_ids` longtext NOT NULL,
  `options` mediumtext DEFAULT NULL,
  `cancelled_at` int(11) DEFAULT NULL,
  `created_at` int(11) NOT NULL,
  `finished_at` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `jobs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `queue` varchar(255) NOT NULL,
  `payload` longtext NOT NULL,
  `attempts` tinyint(3) unsigned NOT NULL,
  `reserved_at` int(10) unsigned DEFAULT NULL,
  `available_at` int(10) unsigned NOT NULL,
  `created_at` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `jobs_queue_index` (`queue`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `migrations` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `migration` varchar(255) NOT NULL,
  `batch` int(11) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `password_reset_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `password_reset_tokens` (
  `email` varchar(255) NOT NULL,
  `token` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `phr_lab_results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `phr_lab_results` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` varchar(255) DEFAULT NULL,
  `test_name` varchar(255) DEFAULT NULL,
  `collection_datetime` timestamp NULL DEFAULT NULL,
  `result_datetime` timestamp NULL DEFAULT NULL,
  `result_status` varchar(50) DEFAULT NULL,
  `ordering_provider` varchar(100) DEFAULT NULL,
  `resulting_lab` varchar(100) DEFAULT NULL,
  `analyte` varchar(100) DEFAULT NULL,
  `value` varchar(20) DEFAULT NULL,
  `unit` varchar(20) DEFAULT NULL,
  `range_min` decimal(10,2) DEFAULT NULL,
  `range_max` decimal(10,2) DEFAULT NULL,
  `range_unit` varchar(20) DEFAULT NULL,
  `normal_value` varchar(50) DEFAULT NULL,
  `message_from_provider` mediumtext DEFAULT NULL,
  `result_comment` mediumtext DEFAULT NULL,
  `lab_director` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `phr_patient_vitals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `phr_patient_vitals` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` varchar(50) DEFAULT NULL,
  `vital_name` varchar(255) DEFAULT NULL,
  `vital_date` date DEFAULT NULL,
  `vital_value` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `product_keys`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product_keys` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) DEFAULT NULL,
  `product_id` varchar(100) DEFAULT NULL,
  `product_key` varchar(2000) DEFAULT NULL,
  `product_name` varchar(100) DEFAULT NULL,
  `computer_name` varchar(100) DEFAULT NULL,
  `comment` varchar(2000) DEFAULT NULL,
  `used_on` char(10) DEFAULT NULL,
  `claimed_date` varchar(100) DEFAULT NULL,
  `key_type` varchar(100) DEFAULT NULL,
  `key_retrieval_note` mediumtext DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `product_keys_product_key_unique` (`product_key`) USING HASH
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `session`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `session` (
  `id` varchar(191) NOT NULL,
  `expiresAt` datetime(3) NOT NULL,
  `token` varchar(191) NOT NULL,
  `createdAt` datetime(3) NOT NULL,
  `updatedAt` datetime(3) NOT NULL,
  `ipAddress` text DEFAULT NULL,
  `userAgent` text DEFAULT NULL,
  `userId` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `session_token_key` (`token`),
  KEY `session_userId_fkey` (`userId`),
  CONSTRAINT `session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `id` varchar(255) NOT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `payload` longtext NOT NULL,
  `last_activity` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_user_id_index` (`user_id`),
  KEY `sessions_last_activity_index` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `stock_quotes_daily`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stock_quotes_daily` (
  `c_date` date NOT NULL,
  `c_symb` char(5) NOT NULL,
  `c_open` decimal(10,4) NOT NULL,
  `c_high` decimal(10,4) NOT NULL,
  `c_low` decimal(10,4) NOT NULL,
  `c_close` decimal(10,4) NOT NULL,
  `c_vol` bigint(20) NOT NULL,
  UNIQUE KEY `stock_quotes_daily_c_symb_c_date_unique` (`c_symb`,`c_date`),
  KEY `stock_quotes_daily_c_symb_index` (`c_symb`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `timeseries_datapoint`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `timeseries_datapoint` (
  `dp_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `dp_series_id` bigint(20) unsigned NOT NULL,
  `dp_date` date DEFAULT NULL,
  `dp_value` varchar(20) DEFAULT NULL,
  `dp_comment` mediumtext DEFAULT NULL,
  PRIMARY KEY (`dp_id`),
  KEY `timeseries_datapoint_dp_series_id_index` (`dp_series_id`),
  CONSTRAINT `timeseries_datapoint_dp_series_id_foreign` FOREIGN KEY (`dp_series_id`) REFERENCES `timeseries_series` (`id`),
  CONSTRAINT `timeseries_datapoint_timeseries_series_id_fk` FOREIGN KEY (`dp_series_id`) REFERENCES `timeseries_series` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `timeseries_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `timeseries_documents` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uid` int(11) NOT NULL,
  `name` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `timeseries_series`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `timeseries_series` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `document_id` bigint(20) unsigned NOT NULL,
  `series_name` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `timeseries_series_document_id_index` (`document_id`),
  CONSTRAINT `timeseries_series_document_id_foreign` FOREIGN KEY (`document_id`) REFERENCES `timeseries_documents` (`id`),
  CONSTRAINT `timeseries_series_timeseries_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `timeseries_documents` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `twoFactor`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `twoFactor` (
  `id` varchar(191) NOT NULL,
  `secret` text NOT NULL,
  `backupCodes` text NOT NULL,
  `userId` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `twoFactor_userId_fkey` (`userId`),
  CONSTRAINT `twoFactor_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `user_role` varchar(255) NOT NULL DEFAULT 'User',
  `remember_token` varchar(100) DEFAULT NULL,
  `last_login_date` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `gemini_api_key` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`),
  KEY `users_user_role_index` (`user_role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `utility_account`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `utility_account` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `account_name` varchar(255) NOT NULL,
  `account_type` varchar(255) NOT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `utility_account_user_id_index` (`user_id`),
  CONSTRAINT `utility_account_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `utility_bill`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `utility_bill` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `utility_account_id` bigint(20) unsigned NOT NULL,
  `bill_start_date` date NOT NULL,
  `bill_end_date` date NOT NULL,
  `due_date` date NOT NULL,
  `total_cost` decimal(14,5) NOT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'Unpaid',
  `notes` text DEFAULT NULL,
  `power_consumed_kwh` decimal(14,5) DEFAULT NULL,
  `total_generation_fees` decimal(14,5) DEFAULT NULL,
  `total_delivery_fees` decimal(14,5) DEFAULT NULL,
  `taxes` decimal(14,5) DEFAULT NULL,
  `fees` decimal(14,5) DEFAULT NULL,
  `discounts` decimal(13,4) DEFAULT NULL,
  `credits` decimal(13,4) DEFAULT NULL,
  `payments_received` decimal(13,4) DEFAULT NULL,
  `previous_unpaid_balance` decimal(13,4) DEFAULT NULL,
  `t_id` bigint(20) unsigned DEFAULT NULL,
  `pdf_original_filename` varchar(255) DEFAULT NULL,
  `pdf_stored_filename` varchar(255) DEFAULT NULL,
  `pdf_s3_path` varchar(255) DEFAULT NULL,
  `pdf_file_size_bytes` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `utility_bill_utility_account_id_index` (`utility_account_id`),
  KEY `utility_bill_t_id_index` (`t_id`),
  CONSTRAINT `utility_bill_utility_account_id_foreign` FOREIGN KEY (`utility_account_id`) REFERENCES `utility_account` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `verification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `verification` (
  `id` varchar(191) NOT NULL,
  `identifier` text NOT NULL,
  `value` text NOT NULL,
  `expiresAt` datetime(3) NOT NULL,
  `createdAt` datetime(3) DEFAULT NULL,
  `updatedAt` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `vxcv_files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vxcv_files` (
  `hash` varbinary(20) NOT NULL,
  `filename` varchar(150) NOT NULL,
  `mime` varchar(30) NOT NULL,
  `downloads` int(11) NOT NULL DEFAULT 0,
  `max_downloads` int(11) NOT NULL DEFAULT 7,
  `size` int(11) NOT NULL,
  `uploaded` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `blocked` tinyint(4) NOT NULL DEFAULT 0,
  `ip` int(11) NOT NULL,
  PRIMARY KEY (`hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `vxcv_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vxcv_links` (
  `uniqueid` char(5) NOT NULL,
  `url` varchar(15000) NOT NULL,
  PRIMARY KEY (`uniqueid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
--
-- WARNING: can't read the INFORMATION_SCHEMA.libraries table. It's most probably an old server 5.5.5-10.6.24-MariaDB.
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (6,'0001_01_01_000001_create_cache_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (7,'0001_01_01_000002_create_jobs_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (8,'2025_11_06_084417_create_migrated_tables',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (9,'0001_01_01_000000_create_users_table',2);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (11,'2025_11_08_222740_add_gemini_api_key_to_users_table',3);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (12,'2025_11_11_084311_add_timestamps_to_fin_payslip_table',4);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (13,'2025_11_18_075245_create_fin_statement_details_table',5);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (14,'2025_11_28_072001_add_t_account_balance_to_fin_account_line_items_table',6);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (15,'2025_11_28_072150_add_t_account_balance_to_fin_account_line_items_table',6);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (16,'2025_11_29_185525_create_fin_account_line_item_links_table',7);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (17,'2025_11_29_185549_migrate_parent_t_id_to_links_table',7);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (18,'2025_11_29_185611_remove_parent_t_id_from_fin_account_line_items',7);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (19,'2025_11_30_180948_add_is_not_duplicate_to_fin_account_line_items',8);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (20,'2025_11_30_183121_add_ib_columns_to_fin_account_line_items',9);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (21,'2025_11_30_201814_create_statement_detail_tables',10);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (22,'2025_12_01_053950_rename_fin_account_balance_snapshot_to_fin_statements',11);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (23,'2025_12_22_174104_add_user_role_to_users_table',12);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (24,'2025_12_22_174127_create_client_companies_table',12);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (25,'2025_12_22_174145_create_client_company_user_table',12);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (26,'2025_12_23_034747_add_slug_to_client_companies_table',13);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (27,'2025_12_23_034902_create_client_projects_table',13);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (28,'2025_12_23_034907_create_client_tasks_table',13);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (29,'2025_12_23_034907_create_client_time_entries_table',13);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (30,'2025_12_23_052015_add_last_login_date_to_users_table',14);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (31,'2025_12_23_052135_create_client_agreements_table',14);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (32,'2025_12_23_052215_create_client_invoices_table',14);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (33,'2025_12_23_052300_create_client_invoice_lines_table',14);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (34,'2025_12_23_052319_add_invoice_line_to_client_time_entries_table',14);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (35,'2025_12_23_071831_add_due_date_to_client_tasks_table',15);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (36,'2025_12_23_081114_add_client_agreement_id_to_client_invoice_lines_table',16);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (37,'2025_12_27_223125_create_files_tables',17);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (38,'2025_12_28_054636_create_client_invoice_payments_table',18);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (39,'2026_01_11_000001_create_client_expenses_table',19);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (40,'2026_01_12_094817_create_utility_account_table',20);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (41,'2026_01_12_094820_create_utility_bill_table',20);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (42,'2026_01_12_102909_add_columns_to_utility_bill_table',21);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (43,'2026_01_16_055957_add_details_to_utility_bill_table',22);
