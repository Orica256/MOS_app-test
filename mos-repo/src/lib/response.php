<?php
/**
 * src/lib/response.php
 * APIレスポンス共通ユーティリティ
 */

function json_ok(mixed $data = null, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    // updateStatus の正常系はボディなし（空）
    if ($data === null) {
        echo '';
    } else {
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    exit;
}

function json_error(string $code, string $message, int $status): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'errorCode' => $code,
        'message'   => $message,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
