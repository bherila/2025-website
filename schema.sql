-- MySQL dump 10.13  Distrib 9.5.0, for macos15.4 (arm64)
--
-- Host: web1.dal.cloudplatform.net    Database: bhnetzum_bwh
-- ------------------------------------------------------
-- Server version	5.5.5-10.6.23-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `AccountLineItemTag`
--

DROP TABLE IF EXISTS `AccountLineItemTag`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `AccountLineItemTag` (
  `tag_id` int(11) NOT NULL AUTO_INCREMENT,
  `tag_userid` varchar(191) NOT NULL,
  `tag_color` varchar(191) NOT NULL,
  `tag_label` varchar(191) NOT NULL,
  PRIMARY KEY (`tag_id`),
  UNIQUE KEY `AccountLineItemTag_tag_userid_tag_label_key` (`tag_userid`,`tag_label`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `StockQuotes`
--

DROP TABLE IF EXISTS `StockQuotes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `StockQuotes` (
  `c_date` date NOT NULL,
  `c_time` time NOT NULL,
  `c_symb` char(5) NOT NULL,
  `c_open` decimal(10,4) NOT NULL,
  `c_high` decimal(10,4) NOT NULL,
  `c_low` decimal(10,4) NOT NULL,
  `c_close` decimal(10,4) NOT NULL,
  `c_vol` mediumint(9) NOT NULL,
  KEY `c_date` (`c_date`,`c_time`,`c_symb`),
  KEY `symbol` (`c_symb`(2))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `account`
--

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

--
-- Table structure for table `earnings_annual`
--

DROP TABLE IF EXISTS `earnings_annual`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `earnings_annual` (
  `symbol` char(5) NOT NULL,
  `fiscalDateEnding` date NOT NULL,
  `reportedEPS` decimal(10,4) DEFAULT NULL,
  PRIMARY KEY (`symbol`,`fiscalDateEnding`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `earnings_quarterly`
--

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
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `fin_account_balance_snapshot`
--

DROP TABLE IF EXISTS `fin_account_balance_snapshot`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_account_balance_snapshot` (
  `snapshot_id` int(11) NOT NULL AUTO_INCREMENT,
  `acct_id` int(11) NOT NULL,
  `balance` varchar(20) NOT NULL,
  `when_added` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`snapshot_id`),
  KEY `fin_accounts_acct_id_fk` (`acct_id`)
) ENGINE=InnoDB AUTO_INCREMENT=1482 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `fin_account_line_item_tag_map`
--

DROP TABLE IF EXISTS `fin_account_line_item_tag_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_account_line_item_tag_map` (
  `t_id` int(11) NOT NULL,
  `tag_id` int(11) NOT NULL,
  `when_added` datetime NOT NULL DEFAULT current_timestamp(),
  `when_deleted` datetime DEFAULT NULL,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_tag_per_transaction` (`t_id`,`tag_id`),
  KEY `fin_account_line_item_tag_map_tag_id_fkey` (`tag_id`),
  CONSTRAINT `fin_account_line_item_tag_map_t_id_fkey` FOREIGN KEY (`t_id`) REFERENCES `fin_account_line_items` (`t_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fin_account_line_item_tag_map_tag_id_fkey` FOREIGN KEY (`tag_id`) REFERENCES `fin_account_tag` (`tag_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=209 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `fin_account_line_items`
--

DROP TABLE IF EXISTS `fin_account_line_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_account_line_items` (
  `t_id` int(11) NOT NULL AUTO_INCREMENT,
  `t_account` int(11) DEFAULT NULL COMMENT 'Account ID#',
  `t_date` varchar(10) NOT NULL COMMENT 'Date of transaction',
  `t_type` varchar(191) DEFAULT NULL,
  `t_schc_category` varchar(191) DEFAULT NULL,
  `t_amt` decimal(13,4) DEFAULT NULL,
  `t_symbol` varchar(20) DEFAULT NULL COMMENT 'Stock symbol',
  `t_qty` float NOT NULL DEFAULT 0 COMMENT 'Quantity of options or shares',
  `t_price` decimal(13,4) DEFAULT NULL,
  `t_commission` decimal(13,4) DEFAULT NULL,
  `t_fee` decimal(13,4) DEFAULT NULL,
  `t_method` varchar(20) DEFAULT NULL COMMENT 'Method of accounting',
  `t_source` varchar(20) DEFAULT NULL,
  `t_origin` varchar(20) DEFAULT NULL,
  `opt_expiration` varchar(10) DEFAULT NULL COMMENT 'Option expiration date',
  `opt_type` enum('call','put') DEFAULT NULL COMMENT 'Option type (call or put)',
  `opt_strike` decimal(13,4) DEFAULT NULL,
  `t_description` varchar(255) DEFAULT NULL COMMENT 'Additional description text from the transaction log',
  `t_comment` varchar(255) DEFAULT NULL COMMENT 'User-provided comment',
  `t_from` varchar(10) DEFAULT NULL COMMENT 'Start date',
  `t_to` varchar(10) DEFAULT NULL COMMENT 'End date',
  `t_interest_rate` varchar(20) DEFAULT NULL COMMENT 'Interest rate',
  `parent_t_id` int(11) DEFAULT NULL,
  `t_cusip` varchar(20) DEFAULT NULL,
  `when_added` datetime DEFAULT NULL,
  `when_deleted` datetime DEFAULT NULL,
  `t_harvested_amount` decimal(13,4) DEFAULT NULL,
  `t_date_posted` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`t_id`),
  KEY `accounting_accounts_acct_id_fk` (`t_account`)
) ENGINE=InnoDB AUTO_INCREMENT=16012 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `fin_account_tag`
--

DROP TABLE IF EXISTS `fin_account_tag`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_account_tag` (
  `tag_id` int(11) NOT NULL AUTO_INCREMENT,
  `tag_userid` varchar(50) NOT NULL,
  `tag_color` varchar(20) NOT NULL,
  `tag_label` varchar(50) NOT NULL,
  `when_added` datetime NOT NULL DEFAULT current_timestamp(),
  `when_deleted` datetime DEFAULT NULL,
  PRIMARY KEY (`tag_id`),
  UNIQUE KEY `unique_tag_per_user` (`tag_userid`,`tag_label`)
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `fin_accounts`
--

DROP TABLE IF EXISTS `fin_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_accounts` (
  `acct_id` int(11) NOT NULL AUTO_INCREMENT,
  `acct_owner` varchar(50) NOT NULL,
  `acct_name` varchar(50) NOT NULL,
  `when_deleted` datetime DEFAULT NULL,
  `acct_last_balance` varchar(20) NOT NULL DEFAULT '0',
  `acct_last_balance_date` datetime DEFAULT NULL,
  `acct_sort_order` int(11) NOT NULL DEFAULT 0,
  `acct_is_debt` bit(1) NOT NULL DEFAULT b'0',
  `acct_is_retirement` bit(1) NOT NULL DEFAULT b'0',
  `when_closed` datetime DEFAULT NULL,
  PRIMARY KEY (`acct_id`),
  UNIQUE KEY `acct_owner` (`acct_owner`,`acct_name`)
) ENGINE=InnoDB AUTO_INCREMENT=34 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `fin_equity_awards`
--

DROP TABLE IF EXISTS `fin_equity_awards`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_equity_awards` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `award_id` char(20) NOT NULL,
  `grant_date` char(10) NOT NULL,
  `vest_date` char(10) NOT NULL,
  `share_count` int(11) NOT NULL,
  `symbol` char(4) NOT NULL,
  `uid` varchar(50) NOT NULL,
  `vest_price` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `fin_equity_awards_pk` (`grant_date`,`award_id`,`vest_date`,`symbol`)
) ENGINE=MyISAM AUTO_INCREMENT=98 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `fin_payslip`
--

DROP TABLE IF EXISTS `fin_payslip`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_payslip` (
  `payslip_id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(50) DEFAULT NULL,
  `period_start` char(10) DEFAULT NULL,
  `period_end` char(10) DEFAULT NULL,
  `pay_date` char(10) DEFAULT NULL,
  `earnings_gross` decimal(10,4) DEFAULT NULL,
  `earnings_bonus` decimal(10,4) DEFAULT NULL,
  `earnings_net_pay` decimal(10,4) NOT NULL DEFAULT 0.0000,
  `earnings_rsu` decimal(10,4) DEFAULT NULL,
  `imp_other` decimal(10,4) DEFAULT NULL,
  `imp_legal` decimal(10,4) DEFAULT 0.0000,
  `imp_fitness` decimal(10,4) DEFAULT 0.0000,
  `imp_ltd` decimal(10,4) DEFAULT 0.0000,
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
  PRIMARY KEY (`payslip_id`),
  UNIQUE KEY `fin_payslip_pk` (`uid`,`period_start`,`period_end`,`pay_date`)
) ENGINE=MyISAM AUTO_INCREMENT=307 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `fin_payslip_uploads`
--

DROP TABLE IF EXISTS `fin_payslip_uploads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fin_payslip_uploads` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `file_name` varchar(200) DEFAULT NULL,
  `file_hash` varchar(50) DEFAULT NULL,
  `parsed_json` longtext DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `graduated_tax`
--

DROP TABLE IF EXISTS `graduated_tax`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `graduated_tax` (
  `year` int(11) NOT NULL,
  `region` char(2) NOT NULL,
  `income_over` int(11) NOT NULL,
  `type` enum('s','mfj','mfs','hoh') NOT NULL DEFAULT 's',
  `rate` decimal(10,4) NOT NULL,
  `verified` bit(1) NOT NULL DEFAULT b'0',
  UNIQUE KEY `graduated_tax_pk` (`year`,`region`,`income_over`,`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `phr_lab_results`
--

DROP TABLE IF EXISTS `phr_lab_results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `phr_lab_results` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` varchar(191) DEFAULT NULL,
  `test_name` varchar(255) DEFAULT NULL,
  `collection_datetime` datetime DEFAULT NULL,
  `result_datetime` datetime DEFAULT NULL,
  `result_status` varchar(50) DEFAULT NULL,
  `ordering_provider` varchar(100) DEFAULT NULL,
  `resulting_lab` varchar(100) DEFAULT NULL,
  `analyte` varchar(100) DEFAULT NULL,
  `value` varchar(20) DEFAULT NULL,
  `unit` varchar(20) DEFAULT NULL,
  `range_min` decimal(10,2) DEFAULT NULL COMMENT 'Value (unit) should be greater than or equal to this value',
  `range_max` decimal(10,2) DEFAULT NULL COMMENT 'Value (unit) should be less than or equal to this value',
  `range_unit` varchar(20) DEFAULT NULL COMMENT 'Unit of range_min and range_max',
  `normal_value` varchar(50) DEFAULT NULL COMMENT 'Value is normal if it equals this e.g. "Not Detected"',
  `message_from_provider` mediumtext DEFAULT NULL,
  `result_comment` mediumtext DEFAULT NULL,
  `lab_director` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `phr_patient_vitals`
--

DROP TABLE IF EXISTS `phr_patient_vitals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `phr_patient_vitals` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` varchar(50) DEFAULT NULL,
  `vital_name` varchar(255) DEFAULT NULL,
  `vital_date` date DEFAULT NULL,
  `vital_value` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=96 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `product_keys`
--

DROP TABLE IF EXISTS `product_keys`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product_keys` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(191) DEFAULT NULL,
  `product_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `product_key` varchar(2000) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `product_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `computer_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `comment` varchar(2000) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `used_on` char(10) DEFAULT NULL,
  `claimed_date` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `key_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `key_retrieval_note` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `product_key` (`product_key`) USING HASH
) ENGINE=MyISAM AUTO_INCREMENT=184 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `session`
--

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

--
-- Table structure for table `stock_quotes_daily`
--

DROP TABLE IF EXISTS `stock_quotes_daily`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stock_quotes_daily` (
  `c_date` date NOT NULL,
  `c_symb` char(5) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `c_open` decimal(10,4) NOT NULL,
  `c_high` decimal(10,4) NOT NULL,
  `c_low` decimal(10,4) NOT NULL,
  `c_close` decimal(10,4) NOT NULL,
  `c_vol` bigint(20) NOT NULL,
  UNIQUE KEY `c_date` (`c_symb`,`c_date`),
  KEY `symbol` (`c_symb`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `timeseries_datapoint`
--

DROP TABLE IF EXISTS `timeseries_datapoint`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `timeseries_datapoint` (
  `dp_id` int(11) NOT NULL AUTO_INCREMENT,
  `dp_series_id` int(11) NOT NULL,
  `dp_date` date DEFAULT NULL,
  `dp_value` varchar(20) DEFAULT NULL,
  `dp_comment` mediumtext DEFAULT NULL,
  PRIMARY KEY (`dp_id`),
  KEY `timeseries_datapoint_timeseries_series_id_fk` (`dp_series_id`),
  CONSTRAINT `timeseries_datapoint_timeseries_series_id_fk` FOREIGN KEY (`dp_series_id`) REFERENCES `timeseries_series` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `timeseries_documents`
--

DROP TABLE IF EXISTS `timeseries_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `timeseries_documents` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` int(11) NOT NULL,
  `name` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `timeseries_series`
--

DROP TABLE IF EXISTS `timeseries_series`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `timeseries_series` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `document_id` int(11) NOT NULL,
  `series_name` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `timeseries_series_timeseries_documents_id_fk` (`document_id`),
  CONSTRAINT `timeseries_series_timeseries_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `timeseries_documents` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `twoFactor`
--

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

--
-- Table structure for table `user`
--

DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user` (
  `id` varchar(50) NOT NULL,
  `name` varchar(50) NOT NULL,
  `email` varchar(50) NOT NULL,
  `emailVerified` tinyint(1) NOT NULL,
  `image` text DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL,
  `updatedAt` datetime(3) NOT NULL,
  `twoFactorEnabled` tinyint(1) DEFAULT NULL,
  `username` varchar(50) DEFAULT NULL,
  `inviteCode` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_email_key` (`email`),
  UNIQUE KEY `user_username_key` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users_legacy`
--

DROP TABLE IF EXISTS `users_legacy`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users_legacy` (
  `uid` bigint(20) NOT NULL AUTO_INCREMENT,
  `email` varchar(50) NOT NULL,
  `pw` varchar(100) DEFAULT NULL,
  `salt` bigint(20) NOT NULL DEFAULT 0,
  `alias` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci DEFAULT NULL,
  `ax_maxmin` tinyint(1) NOT NULL DEFAULT 0,
  `ax_homes` tinyint(1) DEFAULT 0,
  `ax_tax` tinyint(1) NOT NULL DEFAULT 0,
  `ax_evdb` tinyint(1) DEFAULT 0,
  `ax_spgp` tinyint(1) NOT NULL DEFAULT 0,
  `ax_phr` tinyint(4) NOT NULL DEFAULT 0,
  `reset_token` varchar(64) DEFAULT NULL,
  `reset_requested_at` datetime DEFAULT NULL,
  `passkey_credential_id` varchar(255) DEFAULT NULL,
  `passkey_public_key` text DEFAULT NULL,
  PRIMARY KEY (`uid`),
  UNIQUE KEY `users_pk` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=7577 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `verification`
--

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

--
-- Table structure for table `vxcv_files`
--

DROP TABLE IF EXISTS `vxcv_files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vxcv_files` (
  `hash` binary(20) NOT NULL,
  `filename` varchar(150) NOT NULL,
  `mime` varchar(30) NOT NULL,
  `downloads` int(11) NOT NULL DEFAULT 0,
  `max_downloads` int(11) NOT NULL DEFAULT 7,
  `size` int(11) NOT NULL,
  `uploaded` datetime NOT NULL,
  `blocked` tinyint(4) NOT NULL DEFAULT 0,
  `ip` int(11) NOT NULL,
  PRIMARY KEY (`hash`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vxcv_links`
--

DROP TABLE IF EXISTS `vxcv_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vxcv_links` (
  `uniqueid` char(5) NOT NULL,
  `url` varchar(15000) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (`uniqueid`),
  KEY `url` (`url`(15))
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-11-06  0:43:27
