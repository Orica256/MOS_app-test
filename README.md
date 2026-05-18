# 居酒屋みどり亭 モバイルオーダーシステム（MOS）

> プロトタイプ版 — チーム開発用リポジトリ

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [現在の主な機能](#2-現在の主な機能)
3. [ディレクトリ構成](#3-ディレクトリ構成)
4. [ローカル開発環境セットアップ（XAMPP）](#4-ローカル開発環境セットアップxampp)
5. [ブランチ戦略（GitHub Flow）](#5-ブランチ戦略github-flow)
6. [開発ルール](#6-開発ルール)
7. [API仕様](#7-api仕様)
8. [デモアカウント](#8-デモアカウント)

---

## 1. プロジェクト概要

| 項目 | 内容 |
|---|---|
| システム名 | 居酒屋みどり亭 モバイルオーダーシステム（MOS） |
| フロントエンド | HTML5 + JavaScript + CSS |
| バックエンド | PHP（Apache） |
| DB | MySQL（プロトタイプ: XAMPP / 本番: Amazon RDS for MySQL） |
| インフラ（本番） | AWS ECS on Fargate / Docker ※AWS契約後に対応 |
| API仕様書 | Ver.2.1.0 準拠 |

---

## 2. 現在の主な機能

| 区分 | 主な機能 |
|---|---|
| お客様画面 | QR読取デモ、人数入力、コース選択、メニュー注文、カート、注文履歴、会計確認、会計依頼後の注文ロック、専用の注文一覧画面 |
| スタッフ画面 | 注文管理、部分配膳数の更新、会計管理、レジ通知デモ、卓管理、スタッフ管理、売上レポート、会計履歴 |
| 会計まわり | 会計は注文単位ではなく、QRコード単位（`customerId` 単位）で管理 |
| デモ機能 | モックAPI、疑似リアルタイム通知、過去60日分の売上・会計履歴データ |

---

## 3. ディレクトリ構成

```
mos/
├── .gitignore
├── .htaccess                    # Apacheルーティング設定
├── CLAUDE.md                    # 要求・変更履歴の引き継ぎメモ
├── README.md
├── public/                      # Webルート（XAMPPはここを公開）
│   ├── index.html               # お客様画面
│   ├── staff.html               # スタッフ管理画面
│   ├── css/
│   │   ├── common.css           # 共通CSS変数・リセット
│   │   ├── customer.css         # お客様画面スタイル
│   │   └── staff.css            # スタッフ画面スタイル（ダークテーマ）
│   └── js/
│       ├── data.js              # マスタデータ定義（メニュー・コース等）
│       ├── api.js               # API通信層（ver2.1.0準拠・モック切替対応）
│       ├── customer.js          # お客様画面ロジック
│       └── staff.js             # スタッフ管理画面ロジック
├── src/
│   ├── api/
│   │   ├── orders.php           # POST /api/orders エントリポイント
│   │   └── checkout_requests.php # POST /api/checkout-requests エントリポイント
│   ├── config/
│   │   ├── database.php.example # DB接続設定テンプレート（要コピー）
│   │   └── database.php         # ← 各自作成（.gitignore対象）
│   └── lib/
│       ├── db.php               # PDO接続ヘルパー
│       └── response.php         # APIレスポンスユーティリティ
├── database/
│   └── migrations/
│       ├── 001_create_tables.sql        # DB初期構築SQL
│       └── 002_create_checkout_requests.sql # 会計依頼テーブル追加SQL
```

---

## 4. ローカル開発環境セットアップ（XAMPP）

### 前提

- [XAMPP](https://www.apachefriends.org/jp/index.html) がインストール済みであること
- XAMPPコントロールパネルで **Apache** と **MySQL** が起動していること

### 手順

#### 1. リポジトリをクローン

```bash
# XAMPPのhtdocsディレクトリにクローン
cd C:/xampp/htdocs          # Windows
# または
cd /Applications/XAMPP/htdocs   # Mac

git clone https://github.com/[組織名]/mos.git
cd mos
```

#### 2. DB設定ファイルを作成

```bash
cp src/config/database.php.example src/config/database.php
```

`src/config/database.php` をテキストエディタで開き、必要に応じて編集します。
XAMPPのデフォルト設定はそのままで動作します（`root` / パスワードなし）。

```php
return [
    'host'   => 'localhost',
    'dbname' => 'mos_db',
    'user'   => 'root',
    'pass'   => '',          // XAMPPデフォルト
    'charset'=> 'utf8mb4',
];
```

#### 3. データベースを作成・マイグレーション実行

**phpMyAdmin を使う場合:**

1. ブラウザで `http://localhost/phpmyadmin` を開く
2. 「インポート」タブを選択
3. `database/migrations/001_create_tables.sql` を選択してインポート実行
4. 続けて `database/migrations/002_create_checkout_requests.sql` を実行

**コマンドラインを使う場合:**

```bash
# Windowsの場合（XAMPP shellから）
mysql -u root < database/migrations/001_create_tables.sql
mysql -u root mos_db < database/migrations/002_create_checkout_requests.sql

# Macの場合
/Applications/XAMPP/xamppfiles/bin/mysql -u root < database/migrations/001_create_tables.sql
/Applications/XAMPP/xamppfiles/bin/mysql -u root mos_db < database/migrations/002_create_checkout_requests.sql
```

#### 4. Apacheのmod_rewriteを有効化

`C:/xampp/apache/conf/httpd.conf`（Windows）を開き、以下を確認・変更：

```apache
# 以下の行のコメント（#）を外す
LoadModule rewrite_module modules/mod_rewrite.so
```

また、`AllowOverride None` を `AllowOverride All` に変更（htaccess有効化）：

```apache
<Directory "C:/xampp/htdocs">
    AllowOverride All   # ← None から All に変更
    ...
</Directory>
```

変更後、XAMPPコントロールパネルでApacheを再起動。

#### 5. ブラウザで確認

```
http://localhost/mos/public/index.html    # お客様画面
http://localhost/mos/public/staff.html   # スタッフ管理画面
```

> **注意:** プロトタイプ段階では `js/api.js` の `USE_MOCK: true` に設定されているため、
> PHPバックエンドを起動しなくてもフロントエンドは動作します。
> PHPバックエンドと繋ぐ際は `USE_MOCK: false` に変更してください。

---

## 5. ブランチ戦略（GitHub Flow）

プロトタイプ開発では **GitHub Flow**（シンプル2ブランチ運用）を採用します。

```
main
 └─ feature/[作業内容]  ← 各自の作業ブランチ
```

### ブランチ命名規則

| 種類 | 命名規則 | 例 |
|---|---|---|
| 機能追加 | `feature/[機能名]` | `feature/customer-menu-screen` |
| バグ修正 | `fix/[バグ内容]` | `fix/cart-total-calculation` |
| スタイル | `style/[対象]` | `style/staff-login-page` |
| DB | `db/[内容]` | `db/add-menus-table` |
| ドキュメント | `docs/[内容]` | `docs/update-readme` |

### 開発フロー

```bash
# 1. mainブランチを最新に更新
git switch main
git pull origin main

# 2. 作業ブランチを作成
git switch -c feature/[機能名]

# 3. 作業・コミット
git add .
git commit -m "feat: メニュー画面にカテゴリタブを追加"

# 4. リモートにプッシュ
git push origin feature/[機能名]

# 5. GitHubでPull Requestを作成
#    → レビュー依頼 → 承認後にmainへマージ

# 6. マージ後にブランチを削除
git switch main
git pull origin main
git branch -d feature/[機能名]
```

### コミットメッセージ規則

| プレフィックス | 用途 | 例 |
|---|---|---|
| `feat:`    | 機能追加 | `feat: コース選択画面を追加` |
| `fix:`     | バグ修正 | `fix: カート合計計算のバグを修正` |
| `style:`   | スタイル変更 | `style: ボタンの色をブランドカラーに統一` |
| `refactor:`| リファクタリング | `refactor: API通信処理を共通化` |
| `db:`      | DB変更 | `db: staffテーブルにroleカラムを追加` |
| `docs:`    | ドキュメント | `docs: READMEにセットアップ手順を追記` |
| `chore:`   | その他 | `chore: .gitignoreを更新` |

### Pull Requestのルール

- **1PR = 1機能** を原則とする
- PRタイトルはコミットメッセージ規則に従う
- セルフレビュー後にレビュアーをアサイン
- `main` への直接pushは禁止

---

## 6. 開発ルール

### ファイル変更禁止（要相談）

| ファイル | 理由 |
|---|---|
| `database/migrations/001_create_tables.sql` | 全員のDB構造に影響 |
| `.htaccess` | Apache設定に影響 |
| `public/js/api.js` | API通信の共通処理 |

### 担当分担（推奨）

| 担当 | ファイル |
|---|---|
| お客様画面フロント | `public/index.html`, `public/css/customer.css`, `public/js/customer.js` |
| スタッフ画面フロント | `public/staff.html`, `public/css/staff.css`, `public/js/staff.js` |
| バックエンドAPI | `src/api/orders.php`, `src/lib/` |
| DB設計 | `database/migrations/` |
| 共通 | `public/js/data.js`, `public/css/common.css` |

### 注意事項

- `src/config/database.php` は **絶対にコミットしない**（.gitignore対象）
- パスワード・接続情報をソースコードに直書きしない
- CSSは `common.css` の変数（`--or`, `--ch` 等）を使い、マジックナンバーを避ける

---

## 7. API仕様

### エンドポイント

```
POST /api/orders
POST /api/checkout-requests
Content-Type: application/json
```

### getOrders リクエスト（ver2.1.0: オブジェクト形式）

```json
{
  "method": "getOrders",
  "customerId": "0000001",
  "billStatus": 1,
  "fromTime": null,
  "toTime": "2025-11-25T01:00:00"
}
```

> ⚠️ ver2.0.0 では配列 `[{...}]` 形式でしたが、ver2.1.0 からオブジェクト `{...}` 形式に変更されています。

### createOrder リクエスト

```json
{
  "method": "createOrder",
  "storeId": "AA",
  "customerId": "0000099",
  "tableNo": "1F-1",
  "guestCount": 2,
  "courseKey": "standard",
  "entryTime": "2026-05-16T19:30:00",
  "items": [
    {
      "menuName": "生ビール",
      "unitPrice": 500,
      "taxRate": 10,
      "orderQty": 2,
      "offerQty": 0,
      "categoryName": "ドリンク"
    }
  ]
}
```

### updateStatus リクエスト

```json
{
  "method": "updateStatus",
  "customerId": "0000001",
  "hash": "0c192fff...",
  "billStatus": 2
}
```

### MOS内部用 会計依頼API

レジ連携APIとは別に、顧客画面からスタッフへ「お会計をお願いする」依頼を送るための内部APIを持ちます。

```json
{
  "method": "requestCheckout",
  "customerId": "0000099",
  "tableNo": "1F-1",
  "orderHash": "0c192fff..."
}
```

```json
{
  "method": "getCheckoutRequests",
  "customerId": null,
  "status": "pending"
}
```

```json
{
  "method": "updateCheckoutRequestStatus",
  "requestId": 1,
  "status": "acknowledged"
}
```

> エンドポイント: `POST /api/checkout-requests`  
> 顧客の会計依頼は MOS 内部の通知であり、レジシステム向け `updateStatus` の代替ではありません。

### billStatus値

| 値 | 意味 |
|---|---|
| 1 | 受付中 |
| 2 | 会計済み |
| 4 | 未収金 |
| 8 | 会計中 |

### モック切替

`public/js/api.js` の設定を変更することでモック/本番を切り替えられます：

```javascript
MOS.API_CONFIG = {
  USE_MOCK: true,                         // true=モック / false=実API
  ENDPOINT: "/api/orders",                // 注文API
  CHECKOUT_ENDPOINT: "/api/checkout-requests", // 会計依頼API
  TIMEOUT_MS: 3000,
};
```

---

## 8. デモアカウント

スタッフ画面 (`staff.html`) のデモ用ログイン情報：

| 社員番号 | パスワード | 氏名 | 役職 | アクセス可能な機能 |
|---|---|---|---|---|
| S001 | pass1111 | 田中 一郎 | 👑 管理職 | 全機能 |
| S002 | pass2222 | 佐藤 花子 | 👤 スタッフ | 注文管理・会計管理・卓管理 |
| S003 | pass3333 | 鈴木 太郎 | 👤 スタッフ | 注文管理・会計管理・卓管理 |
| S004 | pass4444 | 山田 美咲 | 👤 スタッフ | 注文管理・会計管理・卓管理 |

> 本番実装時はパスワードを必ず変更し、`password_hash()` でハッシュ化してDBに保存してください。

---

## 主要ファイル

- [お客様画面](public/index.html)
- [スタッフ画面](public/staff.html)
- [お客様画面ロジック](public/js/customer.js)
- [スタッフ画面ロジック](public/js/staff.js)
- [注文API](src/api/orders.php)
- [会計依頼API](src/api/checkout_requests.php)
- [DB初期構築SQL](database/migrations/001_create_tables.sql)
- [会計依頼テーブル追加SQL](database/migrations/002_create_checkout_requests.sql)
