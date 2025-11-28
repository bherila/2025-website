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
DROP TABLE IF EXISTS `fin_account_balance_snapshot`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_account_balance_snapshot` (
  `snapshot_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `acct_id` bigint(20) unsigned NOT NULL,
  `balance` varchar(20) NOT NULL,
  `when_added` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`snapshot_id`),
  KEY `fin_account_balance_snapshot_acct_id_index` (`acct_id`),
  CONSTRAINT `fin_account_balance_snapshot_acct_id_foreign` FOREIGN KEY (`acct_id`) REFERENCES `fin_accounts` (`acct_id`)
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
  `t_qty` double NOT NULL DEFAULT 0,
  `t_price` decimal(13,4) DEFAULT NULL,
  `t_commission` decimal(13,4) DEFAULT NULL,
  `t_fee` decimal(13,4) DEFAULT NULL,
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
  `parent_t_id` bigint(20) unsigned DEFAULT NULL,
  `t_cusip` varchar(20) DEFAULT NULL,
  `when_added` timestamp NULL DEFAULT NULL,
  `when_deleted` timestamp NULL DEFAULT NULL,
  `t_harvested_amount` decimal(13,4) DEFAULT NULL,
  `t_date_posted` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`t_id`),
  KEY `fin_account_line_items_t_account_index` (`t_account`),
  KEY `fin_account_line_items_parent_t_id_index` (`parent_t_id`),
  CONSTRAINT `fin_account_line_items_parent_t_id_foreign` FOREIGN KEY (`parent_t_id`) REFERENCES `fin_account_line_items` (`t_id`) ON DELETE SET NULL
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
DROP TABLE IF EXISTS `fin_statement_details`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_statement_details` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `snapshot_id` bigint(20) unsigned NOT NULL,
  `section` varchar(255) NOT NULL,
  `line_item` varchar(255) NOT NULL,
  `statement_period_value` decimal(16,4) NOT NULL,
  `ytd_value` decimal(16,4) NOT NULL,
  `is_percentage` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fin_statement_details_snapshot_id_foreign` (`snapshot_id`),
  CONSTRAINT `fin_statement_details_snapshot_id_foreign` FOREIGN KEY (`snapshot_id`) REFERENCES `fin_account_balance_snapshot` (`snapshot_id`) ON DELETE CASCADE
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
  `remember_token` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `gemini_api_key` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`)
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
