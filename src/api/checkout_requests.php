<?php
/**
 * src/api/checkout_requests.php
 * MOS 内部用 会計依頼 API
 *
 * エンドポイント: POST /api/checkout-requests
 * method:
 *   - requestCheckout
 *   - getCheckoutRequests
 *   - updateCheckoutRequestStatus
 */

require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/response.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('INVALID_REQUEST', 'Only POST method is allowed.', 400);
}

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);

if (json_last_error() !== JSON_ERROR_NONE || !is_array($body)) {
    json_error('INVALID_JSON_FORMAT', 'The request format is invalid.', 400);
}

$method = $body['method'] ?? '';

match ($method) {
    'requestCheckout'            => handle_request_checkout($body),
    'getCheckoutRequests'        => handle_get_checkout_requests($body),
    'updateCheckoutRequestStatus'=> handle_update_checkout_request_status($body),
    default                      => json_error('INVALID_REQUEST', "Unknown method: {$method}", 400),
};

function handle_request_checkout(array $b): void {
    $customerId = isset($b['customerId']) ? (string) $b['customerId'] : '';
    $tableNo    = isset($b['tableNo']) ? trim((string) $b['tableNo']) : '';
    $orderHash  = array_key_exists('orderHash', $b) && $b['orderHash'] !== null
        ? (string) $b['orderHash'] : null;

    if (!preg_match('/^[0-9]{7}$/', $customerId)) {
        json_error('INVALID_PARAMETER', 'customerId must be 7 digits.', 400);
    }
    if ($tableNo === '' || strlen($tableNo) > 16) {
        json_error('INVALID_PARAMETER', 'tableNo is required and must be 16 chars or less.', 400);
    }
    if ($orderHash !== null && !preg_match('/^[0-9a-f]{8,64}$/', $orderHash)) {
        json_error('INVALID_PARAMETER', 'orderHash must be hex string (8-64 chars).', 400);
    }

    $pdo = get_db();

    $existing = $pdo->prepare(
        "SELECT id, customer_id, order_hash, table_no, status, requested_at, acknowledged_at, resolved_at
         FROM checkout_requests
         WHERE customer_id = :customer_id
           AND status IN ('pending','acknowledged')
         ORDER BY requested_at DESC
         LIMIT 1"
    );
    $existing->execute([':customer_id' => $customerId]);
    $row = $existing->fetch();

    if ($row) {
        json_ok(map_checkout_request($row));
    }

    $stmt = $pdo->prepare(
        'INSERT INTO checkout_requests (customer_id, order_hash, table_no)
         VALUES (:customer_id, :order_hash, :table_no)'
    );
    $stmt->execute([
        ':customer_id' => $customerId,
        ':order_hash'  => $orderHash,
        ':table_no'    => $tableNo,
    ]);

    $id = (int) $pdo->lastInsertId();
    $stmt2 = $pdo->prepare(
        'SELECT id, customer_id, order_hash, table_no, status, requested_at, acknowledged_at, resolved_at
         FROM checkout_requests
         WHERE id = :id'
    );
    $stmt2->execute([':id' => $id]);
    $created = $stmt2->fetch();

    json_ok(map_checkout_request($created));
}

function handle_get_checkout_requests(array $b): void {
    $customerId = array_key_exists('customerId', $b) && $b['customerId'] !== null
        ? (string) $b['customerId'] : null;
    $status = array_key_exists('status', $b) && $b['status'] !== null
        ? (string) $b['status'] : null;

    if ($customerId !== null && !preg_match('/^[0-9]{7}$/', $customerId)) {
        json_error('INVALID_PARAMETER', 'customerId must be 7 digits.', 400);
    }
    if ($status !== null && !in_array($status, ['pending', 'acknowledged', 'resolved'], true)) {
        json_error('INVALID_PARAMETER', 'status is invalid.', 400);
    }

    $pdo = get_db();
    $where = [];
    $params = [];

    if ($customerId !== null) {
        $where[] = 'customer_id = :customer_id';
        $params[':customer_id'] = $customerId;
    }
    if ($status !== null) {
        $where[] = 'status = :status';
        $params[':status'] = $status;
    }

    $sql = 'SELECT id, customer_id, order_hash, table_no, status, requested_at, acknowledged_at, resolved_at
            FROM checkout_requests';
    if (!empty($where)) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    $sql .= ' ORDER BY requested_at DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    json_ok(array_map('map_checkout_request', $rows));
}

function handle_update_checkout_request_status(array $b): void {
    $requestId = $b['requestId'] ?? null;
    $status = isset($b['status']) ? (string) $b['status'] : '';

    if (!is_int($requestId) || $requestId < 1) {
        json_error('INVALID_PARAMETER', 'requestId must be a positive integer.', 400);
    }
    if (!in_array($status, ['acknowledged', 'resolved'], true)) {
        json_error('INVALID_PARAMETER', 'status must be acknowledged or resolved.', 400);
    }

    $pdo = get_db();

    $check = $pdo->prepare('SELECT id FROM checkout_requests WHERE id = :id');
    $check->execute([':id' => $requestId]);
    if (!$check->fetch()) {
        json_error('ORDER_NOT_FOUND', 'Checkout request not found.', 400);
    }

    $extra = $status === 'acknowledged'
        ? 'acknowledged_at = COALESCE(acknowledged_at, NOW())'
        : 'resolved_at = COALESCE(resolved_at, NOW())';

    $stmt = $pdo->prepare(
        "UPDATE checkout_requests
         SET status = :status, {$extra}
         WHERE id = :id"
    );
    $stmt->execute([
        ':status' => $status,
        ':id'     => $requestId,
    ]);

    json_ok(null, 200);
}

function map_checkout_request(array $row): array {
    return [
        'id'             => (int) $row['id'],
        'customerId'     => $row['customer_id'],
        'orderHash'      => $row['order_hash'],
        'tableNo'        => $row['table_no'],
        'status'         => $row['status'],
        'requestedAt'    => to_iso8601($row['requested_at']),
        'acknowledgedAt' => $row['acknowledged_at'] ? to_iso8601($row['acknowledged_at']) : null,
        'resolvedAt'     => $row['resolved_at'] ? to_iso8601($row['resolved_at']) : null,
    ];
}

function to_iso8601(string $value): string {
    return str_replace(' ', 'T', $value);
}
