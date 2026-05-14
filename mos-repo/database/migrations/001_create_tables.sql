-- ============================================================
-- 001_create_tables.sql
-- 居酒屋みどり亭 MOS データベース初期構築
-- 対象DBMS: MySQL 5.7 以上 / MariaDB 10.3 以上
-- 実行方法: XAMPPのphpMyAdminでインポート、またはMySQLコマンドラインで実行
--   mysql -u root mos_db < database/migrations/001_create_tables.sql
-- ============================================================

-- データベース作成（存在しない場合のみ）
CREATE DATABASE IF NOT EXISTS mos_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE mos_db;

-- ────────────────────────────────────────────────────────────
-- 店舗テーブル
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stores (
  store_id   CHAR(2)      NOT NULL COMMENT '店舗番号（2桁大文字英字）',
  store_name VARCHAR(64)  NOT NULL COMMENT '店舗名',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='店舗マスタ';

-- ────────────────────────────────────────────────────────────
-- テーブル（卓）マスタ
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS table_seats (
  id         INT          NOT NULL AUTO_INCREMENT,
  store_id   CHAR(2)      NOT NULL COMMENT '店舗番号',
  table_no   VARCHAR(16)  NOT NULL COMMENT '卓番号（例: 1F-1, C-3）',
  area       VARCHAR(32)  NOT NULL COMMENT 'エリア名（例: カウンター, 1Fテーブル）',
  capacity   TINYINT      NOT NULL DEFAULT 4 COMMENT '最大収容人数',
  status     VARCHAR(32)  NOT NULL DEFAULT 'empty' COMMENT '卓ステータス（empty/occupied/cleaning/reserved + カスタム）',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_table (store_id, table_no),
  FOREIGN KEY (store_id) REFERENCES stores(store_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='卓マスタ';

-- ────────────────────────────────────────────────────────────
-- QRコードテーブル
-- customerId は入店時に発行（7桁の連番）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qr_codes (
  customer_id CHAR(7)     NOT NULL COMMENT '顧客ID（7桁連番）',
  store_id    CHAR(2)     NOT NULL COMMENT '店舗番号',
  table_no    VARCHAR(16) NOT NULL COMMENT '卓番号',
  issued_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'QR発行日時',
  expires_at  DATETIME             COMMENT '有効期限（翌日の営業終了時刻を想定）',
  PRIMARY KEY (customer_id),
  FOREIGN KEY (store_id) REFERENCES stores(store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='QRコード管理';

-- ────────────────────────────────────────────────────────────
-- メニューカテゴリ
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_categories (
  id         INT          NOT NULL AUTO_INCREMENT,
  store_id   CHAR(2)      NOT NULL COMMENT '店舗番号（NULLの場合は全店共通）',
  name       VARCHAR(16)  NOT NULL COMMENT 'カテゴリ名（例: 焼鳥, ドリンク）',
  sort_order TINYINT      NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (store_id) REFERENCES stores(store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='メニューカテゴリ';

-- ────────────────────────────────────────────────────────────
-- メニューテーブル
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menus (
  id           INT          NOT NULL AUTO_INCREMENT,
  store_id     CHAR(2)      NOT NULL COMMENT '店舗番号',
  category_id  INT                   COMMENT 'カテゴリID',
  name         VARCHAR(64)  NOT NULL COMMENT 'メニュー名',
  unit_price   INT          NOT NULL DEFAULT 0 COMMENT '単価（税抜）',
  tax_rate     TINYINT      NOT NULL DEFAULT 10 COMMENT '税率',
  description  VARCHAR(255)          COMMENT '説明文',
  is_sold_out  TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '在庫なしフラグ（0:在庫あり, 1:売切）',
  is_free      TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '¥0メニューフラグ',
  sort_order   SMALLINT     NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (store_id)    REFERENCES stores(store_id),
  FOREIGN KEY (category_id) REFERENCES menu_categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='メニューマスタ';

-- ────────────────────────────────────────────────────────────
-- コーステーブル
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  id           INT          NOT NULL AUTO_INCREMENT,
  course_key   VARCHAR(32)  NOT NULL COMMENT 'コース識別子（premium/standard/alacarte）',
  name         VARCHAR(64)  NOT NULL COMMENT 'コース名',
  price        INT          NOT NULL DEFAULT 0 COMMENT '料金（税込/名）',
  duration_min SMALLINT              COMMENT '飲み放題時間（分）NULLは無制限',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_course_key (course_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='コースマスタ';

-- ────────────────────────────────────────────────────────────
-- 注文テーブル（API仕様書 ver2.1.0 に準拠）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  hash        VARCHAR(64)  NOT NULL COMMENT '注文データを一意に識別するハッシュ値',
  store_id    CHAR(2)      NOT NULL COMMENT '店舗番号',
  customer_id CHAR(7)      NOT NULL COMMENT '顧客ID（7桁）',
  entry_time  DATETIME     NOT NULL COMMENT '入店日時（ISO8601）',
  bill_status TINYINT      NOT NULL DEFAULT 1
                           COMMENT '会計状況（1:受付中, 2:会計済み, 4:未収金, 8:会計中）',
  guest_count TINYINT      NOT NULL DEFAULT 1 COMMENT '来店人数',
  course_key  VARCHAR(32)           COMMENT 'コース識別子',
  table_no    VARCHAR(16)           COMMENT '卓番号',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (hash),
  INDEX idx_customer   (customer_id),
  INDEX idx_store      (store_id),
  INDEX idx_status     (bill_status),
  INDEX idx_entry_time (entry_time),
  FOREIGN KEY (store_id) REFERENCES stores(store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='注文ヘッダ（API仕様書ver2.1.0準拠）';

-- ────────────────────────────────────────────────────────────
-- 注文明細テーブル（items配列に対応）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id            INT          NOT NULL AUTO_INCREMENT,
  order_hash    VARCHAR(64)  NOT NULL COMMENT '注文ハッシュ（ordersテーブルFK）',
  order_time    DATETIME     NOT NULL COMMENT '注文行の注文日時',
  menu_name     VARCHAR(64)  NOT NULL COMMENT 'メニュー名',
  unit_price    INT          NOT NULL COMMENT '単価（税抜）',
  tax_rate      TINYINT      NOT NULL DEFAULT 10 COMMENT '税率',
  order_qty     TINYINT      NOT NULL DEFAULT 1 COMMENT '注文数量（1〜99）',
  offer_qty     TINYINT      NOT NULL DEFAULT 0 COMMENT '提供数量（0〜99）',
  category_name VARCHAR(16)           COMMENT 'カテゴリ名',
  PRIMARY KEY (id),
  INDEX idx_order_hash (order_hash),
  FOREIGN KEY (order_hash) REFERENCES orders(hash) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='注文明細（API仕様書ver2.1.0 items配列対応）';

-- ────────────────────────────────────────────────────────────
-- スタッフテーブル
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff (
  id          INT          NOT NULL AUTO_INCREMENT,
  store_id    CHAR(2)      NOT NULL COMMENT '店舗番号',
  staff_code  VARCHAR(16)  NOT NULL COMMENT '社員番号（例: S001）',
  name        VARCHAR(64)  NOT NULL COMMENT '氏名',
  password_hash VARCHAR(255) NOT NULL COMMENT 'パスワードハッシュ（password_hash使用）',
  role        ENUM('staff','manager') NOT NULL DEFAULT 'staff' COMMENT '役職',
  is_active   TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '有効フラグ',
  joined_at   DATE                  COMMENT '入社日',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_staff_code (staff_code),
  FOREIGN KEY (store_id) REFERENCES stores(store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='スタッフマスタ';

-- ────────────────────────────────────────────────────────────
-- 初期データ投入
-- ────────────────────────────────────────────────────────────
INSERT IGNORE INTO stores (store_id, store_name) VALUES
  ('AA', '居酒屋みどり亭 緑橋一号店');

INSERT IGNORE INTO courses (course_key, name, price, duration_min) VALUES
  ('premium',  'プレミアム飲み放題',   1980, 120),
  ('standard', 'スタンダード飲み放題', 1480, 120),
  ('alacarte', '単品注文',              0,   NULL);

INSERT IGNORE INTO table_seats (store_id, table_no, area, capacity) VALUES
  ('AA', 'C-1',  'カウンター',   1),
  ('AA', 'C-2',  'カウンター',   1),
  ('AA', 'C-3',  'カウンター',   1),
  ('AA', '1F-1', '1Fテーブル',   4),
  ('AA', '1F-2', '1Fテーブル',   4),
  ('AA', '1F-3', '1Fテーブル',   4),
  ('AA', '2F-1', '2Fテーブル',   6),
  ('AA', '2F-2', '2Fテーブル',   6),
  ('AA', '2F-3', '2Fテーブル',   6);

-- デモ用スタッフ（password_hash は PHP の password_hash('pass1111', PASSWORD_DEFAULT) 相当）
-- 本番環境ではパスワードを必ず変更してください
INSERT IGNORE INTO staff (store_id, staff_code, name, password_hash, role, joined_at) VALUES
  ('AA', 'S001', '田中 一郎', '$2y$10$exampleHashForDemo1111xxxxxx', 'manager', '2022-04-01'),
  ('AA', 'S002', '佐藤 花子', '$2y$10$exampleHashForDemo2222xxxxxx', 'staff',   '2023-06-15'),
  ('AA', 'S003', '鈴木 太郎', '$2y$10$exampleHashForDemo3333xxxxxx', 'staff',   '2024-01-10'),
  ('AA', 'S004', '山田 美咲', '$2y$10$exampleHashForDemo4444xxxxxx', 'staff',   '2023-09-01');
