<?php
/**
 * src/api/orders.php
 * MOS 注文連携API エントリポイント
 * API仕様書 Ver.2.1.0 準拠
 *
 * エンドポイント: POST /api/orders
 * method: getOrders | createOrder | updateStatus
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
    'createOrder'  => handle_create_order($body),
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

    $sql = 'SELECT o.hash, o.store_id, o.entry_time, o.customer_id, o.bill_status,
                   o.guest_count, o.course_key, o.table_no
            FROM orders o';
    if (!empty($where)) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    $sql .= ' ORDER BY o.entry_time DESC';
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
            'guestCount' => (int) $order['guest_count'],
            'courseKey'  => $order['course_key'],
            'tableNo'    => $order['table_no'],
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
// createOrder
// ════════════════════════════════════════════════════════
function handle_create_order(array $b): void {
    $storeId    = isset($b['storeId']) ? (string) $b['storeId'] : '';
    $customerId = isset($b['customerId']) ? (string) $b['customerId'] : '';
    $tableNo    = isset($b['tableNo']) ? trim((string) $b['tableNo']) : '';
    $guestCount = $b['guestCount'] ?? null;
    $courseKey  = array_key_exists('courseKey', $b) && $b['courseKey'] !== null
        ? (string) $b['courseKey'] : null;
    $entryTime  = isset($b['entryTime']) ? (string) $b['entryTime'] : '';
    $items      = $b['items'] ?? null;

    if (!preg_match('/^[A-Z0-9]{2}$/', $storeId)) {
        json_error('INVALID_PARAMETER', 'storeId must be 2 uppercase letters or digits.', 400);
    }
    if (!preg_match('/^[0-9]{7}$/', $customerId)) {
        json_error('INVALID_PARAMETER', 'customerId must be 7 digits.', 400);
    }
    if ($tableNo === '' || strlen($tableNo) > 16) {
        json_error('INVALID_PARAMETER', 'tableNo is required and must be 16 chars or less.', 400);
    }
    if (!is_int($guestCount) || $guestCount < 1 || $guestCount > 40) {
        json_error('INVALID_PARAMETER', 'guestCount must be 1-40.', 400);
    }
    if ($courseKey !== null && !preg_match('/^[a-z0-9_-]{1,32}$/', $courseKey)) {
        json_error('INVALID_PARAMETER', 'courseKey format is invalid.', 400);
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $entryTime)) {
        json_error('INVALID_PARAMETER', 'entryTime must be ISO8601 format.', 400);
    }
    if (!is_array($items) || count($items) === 0) {
        json_error('INVALID_PARAMETER', 'items must contain at least one item.', 400);
    }

    foreach ($items as $item) {
        if (!is_array($item)) {
            json_error('INVALID_PARAMETER', 'Each item must be an object.', 400);
        }
        $menuName = isset($item['menuName']) ? trim((string) $item['menuName']) : '';
        $unitPrice = $item['unitPrice'] ?? null;
        $taxRate = $item['taxRate'] ?? null;
        $orderQty = $item['orderQty'] ?? null;
        $offerQty = $item['offerQty'] ?? 0;
        $categoryName = array_key_exists('categoryName', $item) && $item['categoryName'] !== null
            ? trim((string) $item['categoryName']) : null;

        if ($menuName === '' || strlen($menuName) > 64) {
            json_error('INVALID_PARAMETER', 'menuName is required and must be 64 chars or less.', 400);
        }
        if (!is_int($unitPrice) || $unitPrice < 0) {
            json_error('INVALID_PARAMETER', 'unitPrice must be a non-negative integer.', 400);
        }
        if (!is_int($taxRate) || $taxRate < 0 || $taxRate > 100) {
            json_error('INVALID_PARAMETER', 'taxRate must be 0-100.', 400);
        }
        if (!is_int($orderQty) || $orderQty < 1 || $orderQty > 99) {
            json_error('INVALID_PARAMETER', 'orderQty must be 1-99.', 400);
        }
        if (!is_int($offerQty) || $offerQty < 0 || $offerQty > 99) {
            json_error('INVALID_PARAMETER', 'offerQty must be 0-99.', 400);
        }
        if ($categoryName !== null && strlen($categoryName) > 16) {
            json_error('INVALID_PARAMETER', 'categoryName must be 16 chars or less.', 400);
        }
    }

    $pdo = get_db();
    $entryTimeSql = str_replace('T', ' ', $entryTime);
    $orderTimeSql = date('Y-m-d H:i:s');
    $existingStmt = $pdo->prepare(
        'SELECT hash, store_id, entry_time, bill_status, guest_count, course_key, table_no
         FROM orders
         WHERE customer_id = :customer_id
         ORDER BY entry_time DESC
         LIMIT 1'
    );
    $existingStmt->execute([':customer_id' => $customerId]);
    $existingOrder = $existingStmt->fetch();

    if ($existingOrder && (int) $existingOrder['bill_status'] !== 1) {
        json_error('INVALID_REQUEST', 'Cannot add items after billing has started.', 400);
    }

    $hash = $existingOrder ? $existingOrder['hash'] : bin2hex(random_bytes(16));

    try {
        $pdo->beginTransaction();

        if ($existingOrder) {
            $stmt = $pdo->prepare(
                'UPDATE orders
                 SET updated_at = NOW()
                 WHERE hash = :hash'
            );
            $stmt->execute([':hash' => $hash]);
        } else {
            $stmt = $pdo->prepare(
                'INSERT INTO orders (
                    hash, store_id, customer_id, entry_time, bill_status,
                    guest_count, course_key, table_no
                 ) VALUES (
                    :hash, :store_id, :customer_id, :entry_time, 1,
                    :guest_count, :course_key, :table_no
                 )'
            );
            $stmt->execute([
                ':hash'        => $hash,
                ':store_id'    => $storeId,
                ':customer_id' => $customerId,
                ':entry_time'  => $entryTimeSql,
                ':guest_count' => $guestCount,
                ':course_key'  => $courseKey,
                ':table_no'    => $tableNo,
            ]);
        }

        $stmt2 = $pdo->prepare(
            'INSERT INTO order_items (
                order_hash, order_time, menu_name, unit_price, tax_rate,
                order_qty, offer_qty, category_name
             ) VALUES (
                :order_hash, :order_time, :menu_name, :unit_price, :tax_rate,
                :order_qty, :offer_qty, :category_name
             )'
        );

        foreach ($items as $item) {
            $stmt2->execute([
                ':order_hash'    => $hash,
                ':order_time'    => $orderTimeSql,
                ':menu_name'     => trim((string) $item['menuName']),
                ':unit_price'    => $item['unitPrice'],
                ':tax_rate'      => $item['taxRate'],
                ':order_qty'     => $item['orderQty'],
                ':offer_qty'     => $item['offerQty'] ?? 0,
                ':category_name' => array_key_exists('categoryName', $item) && $item['categoryName'] !== null
                    ? trim((string) $item['categoryName']) : null,
            ]);
        }

        $itemsStmt = $pdo->prepare(
            'SELECT order_time, menu_name, unit_price, tax_rate, order_qty, offer_qty, category_name
             FROM order_items
             WHERE order_hash = :hash
             ORDER BY order_time ASC, id ASC'
        );
        $itemsStmt->execute([':hash' => $hash]);
        $storedItems = $itemsStmt->fetchAll();

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        json_error('DB_ACCESS_ERROR', 'Failed to create order.', 500);
    }

    json_ok([
        'hash'       => $hash,
        'storeId'    => $existingOrder ? $existingOrder['store_id'] : $storeId,
        'entryTime'  => $existingOrder ? str_replace(' ', 'T', $existingOrder['entry_time']) : $entryTime,
        'customerId' => $customerId,
        'billStatus' => 1,
        'guestCount' => $existingOrder ? (int) $existingOrder['guest_count'] : $guestCount,
        'courseKey'  => $existingOrder ? $existingOrder['course_key'] : $courseKey,
        'tableNo'    => $existingOrder ? $existingOrder['table_no'] : $tableNo,
        'items'      => array_map(fn($i) => [
            'orderTime'    => str_replace(' ', 'T', $i['order_time']),
            'menuName'     => $i['menu_name'],
            'unitPrice'    => (int) $i['unit_price'],
            'taxRate'      => (int) $i['tax_rate'],
            'orderQty'     => (int) $i['order_qty'],
            'offerQty'     => (int) $i['offer_qty'],
            'categoryName' => $i['category_name'],
        ], $storedItems),
    ]);
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
    if ($hash !== null) {
        $stmt = $pdo->prepare(
            'SELECT hash FROM orders
             WHERE hash = :hash AND customer_id = :customer_id
             LIMIT 1'
        );
        $stmt->execute([
            ':hash'        => $hash,
            ':customer_id' => $customerId,
        ]);
    } else {
        $stmt = $pdo->prepare(
            'SELECT hash FROM orders
             WHERE customer_id = :customer_id
             ORDER BY entry_time DESC
             LIMIT 1'
        );
        $stmt->execute([
            ':customer_id' => $customerId,
        ]);
    }
    $order = $stmt->fetch();

    if (!$order) {
        // ver2.1.0: ORDER_NOT_FOUND は HTTP 400
        json_error('ORDER_NOT_FOUND', 'Order not found for the specified customerId.', 400);
    }

    // ── ステータス更新 ──
    $stmt2 = $pdo->prepare(
        'UPDATE orders SET bill_status = :bill_status, updated_at = NOW()
         WHERE hash = :hash AND customer_id = :customer_id'
    );
    $stmt2->execute([
        ':bill_status' => $billStatus,
        ':hash'        => $order['hash'],
        ':customer_id' => $customerId,
    ]);

    // 正常系: ボディなし
    json_ok(null, 200);
}
