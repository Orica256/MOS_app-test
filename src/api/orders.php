<?php
/**
 * src/api/orders.php
 * MOS 注文連携API エントリポイント
 * API仕様書 Ver.2.1.0 準拠
 *
 * エンドポイント: POST /api/orders
 * method: getOrders | updateStatus
 */

require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/response.php';

// ── CORS（ローカル開発用） ──────────────────────────────
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── メソッド制限 ─────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('INVALID_REQUEST', 'Only POST method is allowed.', 400);
}

// ── JSONパース（ver2.1.0: トップレベルはオブジェクト） ───
$raw = file_get_contents('php://input');
$body = json_decode($raw, true);

if (json_last_error() !== JSON_ERROR_NONE || !is_array($body)) {
    json_error('INVALID_JSON_FORMAT', 'The request format is invalid.', 400);
}

// ── method ルーティング ──────────────────────────────────
$method = $body['method'] ?? '';

match ($method) {
    'getOrders'    => handle_get_orders($body),
    'updateStatus' => handle_update_status($body),
    default        => json_error('INVALID_REQUEST', "Unknown method: {$method}", 400),
};

// ════════════════════════════════════════════════════════
// getOrders
// ════════════════════════════════════════════════════════
function handle_get_orders(array $b): void {
    $customerId = isset($b['customerId']) && $b['customerId'] !== null
        ? (string) $b['customerId'] : null;
    $billStatus = $b['billStatus'] ?? null;
    $fromTime   = $b['fromTime']   ?? null;
    $toTime     = $b['toTime']     ?? null;

    // バリデーション
    if ($customerId !== null && !preg_match('/^[0-9]{7}$/', $customerId)) {
        json_error('INVALID_PARAMETER', 'customerId must be 7 digits.', 400);
    }
    if ($billStatus !== null && (!is_int($billStatus) || $billStatus < 1 || $billStatus > 15)) {
        json_error('INVALID_PARAMETER', 'billStatus must be 1-15.', 400);
    }
    $iso_pattern = '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/';
    if ($fromTime !== null && !preg_match($iso_pattern, $fromTime)) {
        json_error('INVALID_PARAMETER', 'fromTime must be ISO8601 format.', 400);
    }
    if ($toTime !== null && !preg_match($iso_pattern, $toTime)) {
        json_error('INVALID_PARAMETER', 'toTime must be ISO8601 format.', 400);
    }

    $pdo = get_db();

    // ── 注文取得クエリ ──
    $where  = [];
    $params = [];

    if ($customerId !== null) {
        $where[]  = 'o.customer_id = :customer_id';
        $params[':customer_id'] = $customerId;
    }
    if ($billStatus !== null) {
        // ビットマスクで複合指定に対応（例: billStatus=9 → 1(受付中) + 8(会計中)）
        $where[]  = '(o.bill_status & :bill_status) > 0';
        $params[':bill_status'] = $billStatus;
    }
    if ($fromTime !== null) {
        $where[]  = 'o.entry_time >= :from_time';
        $params[':from_time'] = $fromTime;
    }
    if ($toTime !== null) {
        $where[]  = 'o.entry_time <= :to_time';
        $params[':to_time'] = $toTime;
    }

    $sql = 'SELECT o.hash, o.store_id, o.entry_time, o.customer_id, o.bill_status
            FROM orders o';
    if (!empty($where)) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    if ($customerId !== null) {
        $sql .= ' LIMIT 1';
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $orders = $stmt->fetchAll();

    // ── 注文行取得 ──
    $result = [];
    foreach ($orders as $order) {
        $stmt2 = $pdo->prepare(
            'SELECT order_time, menu_name, unit_price, tax_rate, order_qty, offer_qty, category_name
             FROM order_items WHERE order_hash = :hash ORDER BY order_time ASC'
        );
        $stmt2->execute([':hash' => $order['hash']]);
        $items = $stmt2->fetchAll();

        $result[] = [
            'hash'       => $order['hash'],
            'storeId'    => $order['store_id'],
            'entryTime'  => $order['entry_time'],
            'customerId' => $order['customer_id'],
            'billStatus' => (int) $order['bill_status'],
            'items'      => array_map(fn($i) => [
                'orderTime'    => $i['order_time'],
                'menuName'     => $i['menu_name'],
                'unitPrice'    => (int) $i['unit_price'],
                'taxRate'      => (int) $i['tax_rate'],
                'orderQty'     => (int) $i['order_qty'],
                'offerQty'     => (int) $i['offer_qty'],
                'categoryName' => $i['category_name'],
            ], $items),
        ];
    }

    json_ok($result);
}

// ════════════════════════════════════════════════════════
// updateStatus
// ════════════════════════════════════════════════════════
function handle_update_status(array $b): void {
    $customerId = $b['customerId'] ?? null;
    $hash       = isset($b['hash']) && $b['hash'] !== null ? (string) $b['hash'] : null;
    $billStatus = $b['billStatus'] ?? null;

    // バリデーション
    if ($customerId === null || !preg_match('/^[0-9]{7}$/', (string) $customerId)) {
        json_error('INVALID_PARAMETER', 'customerId must be 7 digits.', 400);
    }
    if ($billStatus === null || !is_int($billStatus) || $billStatus < 1 || $billStatus > 15) {
        json_error('INVALID_BILL_STATUS', 'billStatus must be one of: 1, 2, 4, 8.', 400);
    }
    if (!in_array($billStatus, [1, 2, 4, 8], true)) {
        json_error('INVALID_BILL_STATUS', 'billStatus must be one of: 1, 2, 4, 8.', 400);
    }
    if ($hash !== null && !preg_match('/^[0-9a-f]{8,64}$/', $hash)) {
        json_error('INVALID_PARAMETER', 'hash must be hex string (8-64 chars).', 400);
    }

    $pdo = get_db();

    // ── 注文存在確認 ──
    $stmt = $pdo->prepare(
        'SELECT hash FROM orders WHERE customer_id = :customer_id ORDER BY entry_time DESC LIMIT 1'
    );
    $stmt->execute([':customer_id' => $customerId]);
    $order = $stmt->fetch();

    if (!$order) {
        // ver2.1.0: ORDER_NOT_FOUND は HTTP 400
        json_error('ORDER_NOT_FOUND', 'Order not found for the specified customerId.', 400);
    }

    // ── ハッシュによる同一性判定 ──
    if ($hash !== null && $order['hash'] !== $hash) {
        json_error('ORDER_NOT_FOUND', 'Hash mismatch. The order may have been updated.', 400);
    }

    // ── ステータス更新 ──
    $stmt2 = $pdo->prepare(
        'UPDATE orders SET bill_status = :bill_status, updated_at = NOW()
         WHERE customer_id = :customer_id'
    );
    $stmt2->execute([
        ':bill_status' => $billStatus,
        ':customer_id' => $customerId,
    ]);

    // 正常系: ボディなし
    json_ok(null, 200);
}
