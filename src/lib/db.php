<?php
/**
 * src/lib/db.php
 * PDO接続シングルトン
 */

function get_db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $config_path = __DIR__ . '/../config/database.php';
    if (!file_exists($config_path)) {
        http_response_code(500);
        echo json_encode(['errorCode' => 'DB_ACCESS_ERROR', 'message' => 'database.php が見つかりません。database.php.example をコピーして設定してください。']);
        exit;
    }

    $cfg = require $config_path;

    try {
        $dsn = "mysql:host={$cfg['host']};dbname={$cfg['dbname']};charset={$cfg['charset']}";
        $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['errorCode' => 'DB_ACCESS_ERROR', 'message' => $e->getMessage()]);
        exit;
    }

    return $pdo;
}
