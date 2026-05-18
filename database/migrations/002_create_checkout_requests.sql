-- ============================================================
-- 002_create_checkout_requests.sql
-- MOS 内部用 会計依頼テーブル
-- ============================================================

USE mos_db;

CREATE TABLE IF NOT EXISTS checkout_requests (
  id              INT          NOT NULL AUTO_INCREMENT,
  customer_id     CHAR(7)      NOT NULL COMMENT '顧客ID（7桁）',
  order_hash      VARCHAR(64)           COMMENT '依頼時点の代表注文ハッシュ',
  table_no        VARCHAR(16)  NOT NULL COMMENT '卓番号',
  status          ENUM('pending','acknowledged','resolved') NOT NULL DEFAULT 'pending'
                                  COMMENT 'pending:未確認, acknowledged:確認済み, resolved:完了',
  requested_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at DATETIME              NULL,
  resolved_at     DATETIME              NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_checkout_customer (customer_id),
  INDEX idx_checkout_status   (status),
  INDEX idx_checkout_requested_at (requested_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='MOS内部用 会計依頼';
