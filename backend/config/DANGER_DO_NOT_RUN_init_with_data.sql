-- ══════════════════════════════════════════════════════════════════════════
--  ⛔ 경고 — 이 파일을 실행하면 데이터가 전부 삭제됩니다
-- ══════════════════════════════════════════════════════════════════════════
--
--  이 파일은 users / markets / applications 테이블을 DROP 하고 다시 만듭니다.
--  그리고 데이터를 넣는 INSERT 구문이 하나도 없습니다.
--  즉 실행하면 "테이블은 멀쩡한데 회원·마켓·신청 데이터만 0건" 이 됩니다.
--
--  ▸ 실행해도 되는 경우 : 완전히 비어 있는 새 DB 를 처음 만들 때
--  ▸ 실행하면 안 되는 경우 : 팀 공용 DB, 이미 데이터가 들어 있는 DB (그냥 절대 금지)
--
--  스키마가 바뀌었을 때는 이 파일이 아니라 마이그레이션 스크립트를 쓰세요.
--  마이그레이션은 기존 데이터를 지우지 않고 컬럼만 추가/변경합니다.
--
--      cd backend
--      node scripts/migrate-add-swagger-columns.js
--      node scripts/migrate-add-auth-sessions.js
--      node scripts/migrate-add-user-profile-fields.js
--      node scripts/migrate-add-active-role.js
--      (scripts 폴더의 migrate-*.js 를 전부 실행하면 최신 스키마가 됩니다)
--
--  실행 전에는 반드시 백업부터.
--      mysqldump -u root -p flea_market_db > backup_$(date +%Y%m%d_%H%M).sql
--
-- ══════════════════════════════════════════════════════════════════════════

-- ── 안전장치 ──────────────────────────────────────────────────────────────
-- users / markets / applications 중 하나라도 이미 있으면 여기서 오류를 내고 멈춥니다.
-- 없는 테이블을 일부러 참조해서 실패시키는 방식이라, 오류 메시지의 테이블 이름이 곧 중단 사유입니다.
--   STOP_TABLES_ALREADY_EXIST__USE_migrate_SCRIPTS_INSTEAD
--   = "이미 테이블이 있습니다. migrate 스크립트를 쓰세요"
-- (변수·구문 이름을 영문으로 둔 이유: 이 줄들은 아래 SET NAMES 보다 먼저 실행돼서
--  클라이언트 인코딩 설정 전에 한글 식별자를 쓰면 환경에 따라 깨질 수 있습니다.)
SET @existing_tables := (
  SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = DATABASE()
     AND table_name IN ('users', 'markets', 'applications')
);

SET @safety_check := IF(@existing_tables = 0,
  'SELECT ''OK - empty database, continuing.'' AS safety',
  'SELECT * FROM `STOP_TABLES_ALREADY_EXIST__USE_migrate_SCRIPTS_INSTEAD`'
);

PREPARE safety_stmt FROM @safety_check;
EXECUTE safety_stmt;
DEALLOCATE PREPARE safety_stmt;
-- ──────────────────────────────────────────────────────────────────────────

-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: localhost    Database: flea_market_db
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `applications`
--

DROP TABLE IF EXISTS `applications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `applications` (
  `applicationId` int NOT NULL AUTO_INCREMENT,
  `marketId` int NOT NULL,
  `sellerId` BIGINT UNSIGNED NOT NULL,
  `boothNumber` varchar(10) NOT NULL,
  `itemName` varchar(100) NOT NULL,
  `itemImage` varchar(255) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'Pending',
  PRIMARY KEY (`applicationId`),
  KEY `marketId` (`marketId`),
  KEY `sellerId` (`sellerId`),
  CONSTRAINT `applications_ibfk_1` FOREIGN KEY (`marketId`) REFERENCES `markets` (`marketId`) ON DELETE CASCADE,
  CONSTRAINT `applications_ibfk_2` FOREIGN KEY (`sellerId`) REFERENCES `users` (`userId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `applications`
--

LOCK TABLES `applications` WRITE;
/*!40000 ALTER TABLE `applications` DISABLE KEYS */;
/*!40000 ALTER TABLE `applications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `markets`
--

DROP TABLE IF EXISTS `markets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `markets` (
  `marketId` int NOT NULL AUTO_INCREMENT,
  `hostId` BIGINT UNSIGNED NOT NULL,
  `title` varchar(100) NOT NULL,
  `description` text NOT NULL,
  `marketImage` varchar(255) DEFAULT NULL,
  `locationName` varchar(255) NOT NULL,
  `latitude` float NOT NULL,
  `longitude` float NOT NULL,
  `eventDate` date NOT NULL,
  `isExpired` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`marketId`),
  FOREIGN KEY (`hostId`) REFERENCES `users` (`userId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `markets`
--

LOCK TABLES `markets` WRITE;
/*!40000 ALTER TABLE `markets` DISABLE KEYS */;
/*!40000 ALTER TABLE `markets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `userType` tinyint NOT NULL COMMENT '0: 판매자, 1: 주최자',
  `userId` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `password` varchar(255) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `email` varchar(100) NOT NULL,
  `region` varchar(50) NOT NULL,
  -- [추가] 마이페이지 프로필 컬럼.
  -- 예전에는 이 파일에 없어서, 새 PC에서 DB를 처음 만들면 닉네임이 없어 회원가입부터 실패했습니다.
  `nickname` varchar(50) DEFAULT NULL,
  `profileImage` varchar(255) DEFAULT NULL,
  `introText` varchar(150) DEFAULT NULL,
  `bioText` text,
  `bioImage` varchar(255) DEFAULT NULL,
  -- 닉네임 중복은 SELECT 검사만으로는 동시 요청을 막지 못하므로 UNIQUE 로 최종 방어합니다.
  UNIQUE KEY `uk_users_nickname` (`nickname`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-14 18:01:42

-- ------------------------------------------------------
-- 아래는 Swagger API 작업으로 추가된 스키마입니다.
-- 이미 DB를 만들어 둔 사람은 이 파일을 재실행하지 말고
-- scripts/migrate-add-swagger-columns.js 를 대신 실행하세요.
-- ------------------------------------------------------

ALTER TABLE markets ADD COLUMN IF NOT EXISTS boothPrice INT DEFAULT 0;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS productDesc TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS title VARCHAR(100) NULL;
-- [JWT activeRole] 기본값을 'seller' -> NULL 로 변경했습니다.
--   기본값이 'seller' 라서 회원가입 INSERT 에 activeRole 이 빠진 주최자 계정이 전부 판매자로 저장됐고,
--   activeRole 을 토큰에 싣는 순간 "주최자로 로그인했는데 판매자 모드" 가 됩니다.
--   NULL = "지정 안 함" 이며, 서버가 계정 종류(userType)를 따라 host/seller 로 해석합니다.
--   이미 DB 를 만들어 둔 사람은 scripts/migrate-add-active-role.js 를 실행하세요. (백필 포함)
ALTER TABLE users ADD COLUMN IF NOT EXISTS activeRole VARCHAR(10) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS `comments` (
  `commentId` int NOT NULL AUTO_INCREMENT,
  `targetType` varchar(20) NOT NULL COMMENT 'market 등 댓글이 달리는 대상 종류',
  `targetId` int NOT NULL,
  `userId` BIGINT UNSIGNED NOT NULL COMMENT '작성자',
  `content` varchar(500) NOT NULL,
  `parentId` int NULL COMMENT '대댓글이면 부모 댓글의 commentId, 최상위 댓글이면 NULL',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`commentId`),
  KEY `userId` (`userId`),
  KEY `target` (`targetType`,`targetId`),
  KEY `parentId` (`parentId`),
  CONSTRAINT `comments_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`) ON DELETE CASCADE,
  CONSTRAINT `comments_ibfk_2` FOREIGN KEY (`parentId`) REFERENCES `comments` (`commentId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `payments` (
  `paymentId` int NOT NULL AUTO_INCREMENT,
  `applicationId` int NOT NULL,
  `amount` int NOT NULL DEFAULT '0',
  `status` varchar(20) NOT NULL DEFAULT 'Paid' COMMENT '모의 결제이므로 항상 Paid',
  `paidAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`paymentId`),
  KEY `applicationId` (`applicationId`),
  CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`applicationId`) REFERENCES `applications` (`applicationId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------
-- [추가] 마이페이지 프로필 컬럼 (nickname / profileImage / introText / bioText / bioImage)
--
-- 위 CREATE TABLE users 에 이미 포함되어 있으므로, DB를 새로 만드는 경우엔 아래를 실행할 필요가 없습니다.
-- 이미 DB를 만들어 둔 사람만 아래 중 하나를 선택해서 실행하세요.
--
--   방법 1 (권장) : cd backend
--                  node scripts/migrate-add-user-profile-fields.js
--                  node scripts/migrate-add-nickname-unique.js
--                  -> 컬럼 추가 + 빈 닉네임 자동 부여 + 중복 닉네임 분리 + UNIQUE 인덱스까지 한 번에 처리합니다.
--
--   방법 2        : 아래 ALTER 문을 직접 실행 (MySQL 8 에서는 ADD COLUMN IF NOT EXISTS 를 지원하지 않으므로,
--                  이미 있는 컬럼은 오류가 납니다. 그럴 땐 해당 줄만 건너뛰고 실행하세요.)
-- ------------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname VARCHAR(50) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profileImage VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS introText VARCHAR(150) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bioText TEXT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bioImage VARCHAR(255) NULL;
-- UNIQUE 인덱스는 기존 데이터에 중복 닉네임이 있으면 실패합니다.
-- 반드시 migrate-add-nickname-unique.js 로 정리한 뒤 생성하세요.
-- ALTER TABLE users ADD UNIQUE KEY uk_users_nickname (nickname);
