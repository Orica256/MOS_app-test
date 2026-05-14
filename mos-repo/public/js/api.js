/**
 * js/api.js
 * 居酒屋みどり亭 MOS — API通信層
 * API仕様書 Ver.2.1.0 準拠
 *
 * 本番実装時: USE_MOCK = false に変更し、
 *             ENDPOINT を実際のサーバURLに変更する
 */

"use strict";

const MOS = window.MOS || {};

// ─────────────────────────────────────────
// 設定
// ─────────────────────────────────────────
MOS.API_CONFIG = {
  USE_MOCK: true,                    // true=モック / false=実API
  ENDPOINT: "/api/orders",           // 本番エンドポイント
  TIMEOUT_MS: 3000,                  // タイムアウト（最大3秒・仕様書準拠）
};

// ─────────────────────────────────────────
// リクエストビルダー
// ─────────────────────────────────────────

/**
 * getOrders リクエスト構築
 * ver2.1.0: トップレベルはオブジェクト（配列ではない）
 * @param {Object} opts
 * @param {string|null} opts.customerId
 * @param {number|null} opts.billStatus  ビットマスク複合指定可能
 * @param {string|null} opts.fromTime    ISO8601
 * @param {string|null} opts.toTime      ISO8601
 */
MOS.buildGetOrdersReq = ({ customerId = null, billStatus = null, fromTime = null, toTime = null } = {}) => ({
  method: "getOrders",
  customerId,
  billStatus,
  fromTime,
  toTime,
});

/**
 * updateStatus リクエスト構築
 * @param {Object} opts
 * @param {string}      opts.customerId
 * @param {string|null} opts.hash       null の場合は同一性判定スキップ
 * @param {number}      opts.billStatus 1:受付中 / 2:会計済み / 4:未収金 / 8:会計中
 */
MOS.buildUpdateStatusReq = ({ customerId, hash = null, billStatus }) => ({
  method: "updateStatus",
  customerId,
  hash,
  billStatus,
});

// ─────────────────────────────────────────
// API送信（fetch / モック切替）
// ─────────────────────────────────────────
MOS.apiPost = async function(payload) {
  if (MOS.API_CONFIG.USE_MOCK) {
    return MOS._mockApiPost(payload);
  }
  // ── 本番 fetch 実装 ──
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), MOS.API_CONFIG.TIMEOUT_MS);
  try {
    const res = await fetch(MOS.API_CONFIG.ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept":        "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(tid);
    if (res.status === 200) {
      const text = await res.text();
      return { ok: true, data: text ? JSON.parse(text) : null };
    }
    const err = await res.json().catch(() => ({ errorCode: "SYSTEM_ERROR", message: "Unknown error." }));
    return { ok: false, error: err };
  } catch (e) {
    clearTimeout(tid);
    if (e.name === "AbortError") {
      return { ok: false, error: { errorCode: "TIMEOUT", message: "Request timed out." } };
    }
    return { ok: false, error: { errorCode: "SERVICE_UNAVAILABLE", message: e.message } };
  }
};

// ─────────────────────────────────────────
// モック実装（USE_MOCK=true 時に使用）
// 目標応答時間 300ms をシミュレート
// ─────────────────────────────────────────
MOS._mockApiPost = async function(payload) {
  await new Promise(r => setTimeout(r, 280));

  if (payload.method === "getOrders") {
    return { ok: true, data: [] };
  }
  if (payload.method === "updateStatus") {
    // updateStatus 正常系: ボディなし
    return { ok: true, data: null };
  }
  return {
    ok: false,
    error: { errorCode: "INVALID_REQUEST", message: `Unknown method: ${payload.method}` },
  };
};

window.MOS = MOS;
