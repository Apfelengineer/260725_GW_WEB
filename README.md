# KPTC Scheduler

Group Watcher 3.65 の主要機能を、PC・タブレット・スマートフォンから利用できるよう「KPTC Scheduler」として再設計したWEBブラウザ版です。

PHP APIと内部用SQLiteへデータを保存するため、別端末・別ブラウザ間でも編集内容が共有されます。試験室の空き状況は個人情報を含まない3か月分の公開用JSONへ変換し、署名付きHTTPSで外部公開サーバーへ送信します。ログイン情報は予定データと分離し、ユーザー名・パスワード認証、ログイン試行制限、セッション期限、CSRF対策を実装しています。

## システム資料

- [現行アプリケーション仕様書（PDF）](docs/KPTC_Scheduler_現行アプリケーション仕様書.pdf)
- [独立Linuxサーバー構築・移行手順書（PDF）](docs/KPTC_Scheduler_独立Linuxサーバー構築・移行手順書.pdf)
- [ファイル機能・役割一覧とファイル間関係図（PDF）](docs/KPTC_Scheduler_ファイル機能・役割一覧_関係図.pdf)

## 実装済み

- 日・週・月のスケジュール表示切替と前後期間への移動
- 月曜始まり・土日を含む7日間の週表示
- グループ／メンバーの絞り込みと検索
- 予定の新規登録、全ユーザーの予定編集・削除、メモ、非公開設定
- 開始日・終了日を指定する複数日予定
- 時間指定に加え、終日・午前（9:00〜12:00）・午後（13:00〜17:00）の時間帯選択
- 2026年・2027年の国民の祝日表示
- 日付欄のダブルクリック登録と、ドラッグ＆ドロップによる日付・ユーザー間の移動
- 予定の右クリックメニュー（コピー・切り取り・削除）と日付枠の右クリックメニュー（新規予定・貼り付け）
- Shift＋クリックによる予定の複数選択と、複数予定の一括コピー・貼り付け・削除
- キーボード操作（Ctrl/Cmd+C、Ctrl/Cmd+V、Delete、Esc）
- ユーザーと予定種別の追加・編集・削除
- ユーザー名・パスワード認証、ログイン試行制限、共有データ保存、競合検知
- 管理者画面からのログインID・パスワード再設定・管理者／一般ユーザー権限の管理
- 操作履歴、変更者記録、直前操作の取り消し・削除復元
- 「試験室」グループと3つの試験室ユーザー
- 電波暗室・電磁波妨害評価装置(G-TEM)・パルスサージシステムそれぞれの直近3か月空き状況ページ
- 土日祝日の色分け、午前／午後予約、メンテナンス、満室時のキャンセル待ち表示
- 内部スケジュールDBと3か月分の公開空き状況JSONの分離、およびHMAC署名付きHTTPS連携
- 外部受信時の署名・時刻・JSONスキーマ・世代検証と原子的なファイル置換
- 5分間隔の自動再送、送信状態記録、監視用終了コード
- 内部サーバー用／外部サーバー用の配布ファイル完全分離
- PC／スマートフォン対応のレスポンシブ表示
- Open Graph共有画像と日本語メタ情報

## 開発

Node.js 22.13以上と pnpm を使用します。構成は、画面を生成するVite＋Reactと、共有保存・公開JSON連携を担うPHPに一本化しています。

```bash
pnpm install
pnpm run dev
```

配布用ビルド:

```bash
pnpm run build
pnpm run check
pnpm test
```

`pnpm run build` は次の2つを生成します。

- `dist-internal`: スケジューラー画面、内部API、認証、送信・再送・監視コマンド
- `dist-public`: 空き状況画面、署名付きJSON受信API、公開JSON読取API

外部用には `api.php`、`auth.php`、管理コマンド、SQLite接続処理を含めません。内部画面の「試験室予約」リンク先は、ビルド時に `VITE_KPTC_PUBLIC_AVAILABILITY_URL=https://availability.example.jp/calendar/?room=m6` を設定します。開発用の一体表示は `pnpm run dev`、旧来の一体型出力は `pnpm run build:combined` で利用できます。

## 正式ログイン認証

初回起動後、内部サーバー上でスケジューラーのメンバーIDに対応する認証アカウントを作成します。パスワードはコマンド引数や履歴へ残さず、標準入力から渡します。

```bash
read -s KPTC_NEW_PASSWORD
printf '%s' "$KPTC_NEW_PASSWORD" | php manage-auth-user-cli.php create admin m1 admin --password-stdin
unset KPTC_NEW_PASSWORD
```

一覧、無効化、再有効化、パスワード変更も管理コマンドから行います。

```bash
php manage-auth-user-cli.php list
php manage-auth-user-cli.php disable admin
php manage-auth-user-cli.php enable admin
```

パスワードは12文字以上で、PHPが対応する場合はArgon2id、それ以外はPHPの推奨方式でハッシュ化します。5回失敗したユーザー名・接続元は15分間ログインを制限します。ブラウザへ予定データを返すのは認証後だけです。

## 共有API

`public/api.php` が内部の共有データ、正式ログイン、操作履歴、変更取り消しを提供します。予定を保存・削除・取り消した後、試験室3室の当月を含む3か月分を公開可能な空き状態へ変換し、`public/availability-publisher.php` が外部サーバーへ送ります。連携に失敗しても予定の保存は取り消さず、内部DBへ再送待ち、連続失敗回数、最終試行・成功日時、エラー概要を記録します。

`public/public-availability.php` は公開ページ専用です。公開用JSONに保存された室ID・日付・状態（午前空き、午後空き、予約済み、メンテナンス）だけを返し、利用者名、予定件名、メモ、操作履歴は返しません。空き状況ページは内部APIや内部DBを直接参照しません。

外部の `receive-availability.php` は、共有秘密鍵によるHMAC-SHA256署名、送信時刻、最大128KiB、3室だけの固定スキーマ、許可した4状態、3か月以内の期間、更新世代を検証します。検証後は一時ファイルから同じJSONへ置き換えるため、月別ファイルや過去データの履歴は作成しません。

- 内部スケジュールDB: `/home/apfelrunner/GW/group-watcher.sqlite`
- 公開空き状況JSON（外部サーバー）: `/var/lib/kptc-availability/public-availability.json`

設定例は `deploy/internal-server.env.example` と `deploy/external-server.env.example` にあります。共有秘密鍵は `openssl rand -hex 32` などで個別に生成し、両サーバーのWeb用PHP環境と内部側の定期実行環境へ同じ値を設定します。リポジトリやWeb公開フォルダへ秘密鍵を保存しないでください。

共有レンタルサーバーなどでWeb用PHPへ環境変数を設定できない場合は、内部側・外部側それぞれのホームディレクトリに `GW/config/internal-env.php` または `GW/config/public-env.php` を置けます。`runtime-config.php` が公開領域外のこのファイルを自動的に読み込みます。別の場所を使う場合は `KPTC_INTERNAL_CONFIG_FILE` または `KPTC_PUBLIC_CONFIG_FILE` で絶対パスを指定します。

内部側の `publish-availability-cli.php` を5分間隔で実行すると、障害復旧後に自動再送されます。`monitor-availability-cli.php` は正常時0、再送待ち・連続失敗・30分超の未成功時1、DB等の設定異常時2を返します。外部側の `health-availability.php` は最終受信から30分以内かつ当月を含むJSONならHTTP 200、それ以外は503を返すため、一般的なURL監視から確認できます。systemdのサービス／タイマー例は `deploy/` に同梱しています。

同一サーバー上で内部・外部を模擬する場合も、別の公開ディレクトリとURLへそれぞれ配置し、内部側の送信先を外部側の `receive-availability.php` にします。HTTPしか使えないローカル検証時だけ `KPTC_PUBLIC_AVAILABILITY_ALLOW_HTTP=1` を設定できます。本番では必ずHTTPSを使用してください。

将来、組織の認証基盤が確定した場合に差し替える項目:

- OIDC／LDAP等の組織アカウント認証
- 組織側のグループ／メンバー／権限連携

## さくらインターネットへの配置

現行のさくら環境では、内部用を `/home/apfelrunner/www/GW/schedule/`、外部用を `/home/apfelrunner/www/GW/calendar/` へ分けて配置します。公開URLはそれぞれ次のとおりです。

- 内部スケジューラー: `https://apfelrunner.sakura.ne.jp/GW/schedule`
- 外部向け試験室空き状況: `https://apfelrunner.sakura.ne.jp/GW/calendar`

画面の公開フォルダを同じ `GW` 配下に置いても、内部用SQLiteは `/home/apfelrunner/GW/`、外部用JSONは `/home/apfelrunner/GW-public/` に分離し、外部画面から内部DBを直接参照しません。

再送は、内部サーバーの定期実行へ次の1行を登録します。

```cron
*/5 * * * * /usr/local/bin/php /home/apfelrunner/www/GW/schedule/publish-availability-cli.php
```

試験室空き状況ページは `/GW/calendar/?room=m6`（電波暗室）、`room=m7`（電磁波妨害評価装置(G-TEM)）、`room=m8`（パルスサージシステム）で切り替えます。`dist-public/index.html` を生成するため、ファイル名なしのディレクトリURLで表示できます。
