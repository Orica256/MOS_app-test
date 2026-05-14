# 居酒屋みどり亭 モバイルオーダーシステム（MOS）

> プロトタイプ版 — チーム開発用リポジトリ

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [ディレクトリ構成](#2-ディレクトリ構成)
3. [ローカル開発環境セットアップ（XAMPP）](#3-ローカル開発環境セットアップxampp)
4. [ブランチ戦略（GitHub Flow）](#4-ブランチ戦略github-flow)
5. [開発ルール](#5-開発ルール)
6. [API仕様](#6-api仕様)
7. [デモアカウント](#7-デモアカウント)

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

## 2. ディレクトリ構成

```
mos/
├── .gitignore
├── .htaccess                    # Apacheルーティング設定
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
│   │   └── orders.php           # POST /api/orders エントリポイント
│   ├── config/
│   │   ├── database.php.example # DB接続設定テンプレート（要コピー）
│   │   └── database.php         # ← 各自作成（.gitignore対象）
│   └── lib/
│       ├── db.php               # PDO接続ヘルパー
│       └── response.php         # APIレスポンスユーティリティ
├── database/
│   └── migrations/
│       └── 001_create_tables.sql # DB初期構築SQL
└── docs/                        # ドキュメント置き場
```

---

## 3. ローカル開発環境セットアップ（XAMPP）

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

**コマンドラインを使う場合:**

```bash
# Windowsの場合（XAMPP shellから）
mysql -u root < database/migrations/001_create_tables.sql

# Macの場合
/Applications/XAMPP/xamppfiles/bin/mysql -u root < database/migrations/001_create_tables.sql
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

## 4. ブランチ戦略（GitHub Flow）

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

## 5. 開発ルール

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

## 6. API仕様

### エンドポイント

```
POST /api/orders
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

### updateStatus リクエスト

```json
{
  "method": "updateStatus",
  "customerId": "0000001",
  "hash": "0c192fff...",
  "billStatus": 2
}
```

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
  USE_MOCK: true,           // true=モック / false=実API
  ENDPOINT: "/api/orders",  // 本番エンドポイント
  TIMEOUT_MS: 3000,
};
```

---

## 7. デモアカウント

スタッフ画面 (`staff.html`) のデモ用ログイン情報：

| 社員番号 | パスワード | 氏名 | 役職 | アクセス可能な機能 |
|---|---|---|---|---|
| S001 | pass1111 | 田中 一郎 | 👑 管理職 | 全機能 |
| S002 | pass2222 | 佐藤 花子 | 👤 スタッフ | 注文管理・卓管理 |
| S003 | pass3333 | 鈴木 太郎 | 👤 スタッフ | 注文管理・卓管理 |
| S004 | pass4444 | 山田 美咲 | 👤 スタッフ | 注文管理・卓管理 |

> 本番実装時はパスワードを必ず変更し、`password_hash()` でハッシュ化してDBに保存してください。

---

## 関連ドキュメント

- [MOS 仕様書 v1.3.0](docs/MOS_仕様書_v1.3.0.md)
- [API仕様書 Ver.2.1.0](docs/API仕様書_ver2_1_0.pdf)
