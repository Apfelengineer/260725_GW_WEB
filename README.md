# KPTC Scheduler

Group Watcher 3.65 の主要機能を、PC・タブレット・スマートフォンから利用できるよう「KPTC Scheduler」として再設計したWEBブラウザ版です。

PHP APIと内部用SQLiteへデータを保存するため、別端末・別ブラウザ間でも編集内容が共有されます。試験室の空き状況は個人情報を含まない3か月分の公開用JSONへ変換し、署名付きHTTPSで外部公開サーバーへ送信します。スケジューラーはrenkon（社内ポータル）が発行するCBC暗号化トークンを検証して一般モードで開き、パスワード確認後だけ管理者モードへ切り替わります。セッションとCSRF対策はサーバー側で管理します。

## GitHubのフォルダ構成

- `01_source/`: ビルド前のソース、PHP原本、テスト、ビルド設定、サーバー設定例
- `02_release/origin/`: 内部サーバーoriginへ配置するビルド後ファイル
- `02_release/tamanegi/`: 外部サーバーtamanegiへ配置するビルド後ファイル
- `02_release/renkon/`: 社内システムからの接続を試す模擬サイト（開発・確認専用）
- `docs/`: 仕様書、構築手順書、ファイル関係図

ビルド前とビルド後を明確に分離しています。`02_release`にはデータベース、実環境設定、秘密鍵、公開JSON、ログを含めません。

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
- renkonのCBC暗号化トークンを確認し、ログイン画面なしで予定表を開く一般モード
- パスワード確認、連続失敗時の一時ロックを備えた管理者モード切り替え
- 管理者モードでのユーザー・試験室・予定種別管理と管理者パスワード変更
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
cd 01_source
pnpm install
pnpm run dev
```

配布用ビルド:

```bash
cd 01_source
pnpm run build
pnpm run check
pnpm test
```

`pnpm run build` は次の3つを生成します。

- `02_release/origin`: スケジューラー画面、内部API、認証、送信・再送・監視コマンド
- `02_release/tamanegi`: 空き状況画面、署名付きJSON受信API、公開JSON読取API
- `02_release/renkon`: 3桁のユーザーID入力欄、暗号化トークン発行入口、カレンダーリンクを備える社内ポータル模擬画面

`renkon`は連携確認用であり、本番のorigin・tamanegi構築には不要です。実運用では既存の社内システムが同じ役割を担うため、`02_release/renkon`を社内サーバーへ配置しません。

外部用には `api.php`、`auth.php`、管理コマンド、SQLite接続処理を含めません。内部画面の「試験室予約」リンク先は、内部サーバー設定の `KPTC_PUBLIC_AVAILABILITY_PAGE_URL=https://availability.example.jp/calendar` で指定します。本番URLが変わっても再ビルドは不要です。値がない開発環境では、ビルド時の `VITE_KPTC_PUBLIC_AVAILABILITY_URL`、続いて相対URL `../calendar` を使用します。開発中の2画面は `pnpm run dev` で確認できます。

## 一般モードと管理者モード

renkonで3桁のユーザーIDを設定し、発行された専用リンクを開くと、ログイン画面を表示せず一般モードの予定表が開きます。一般モードでは予定の閲覧・追加・編集・移動・コピー・削除ができます。画面内の「管理者モード」から管理者パスワードを入力すると、ユーザー・試験室・予定種別の管理機能が追加されます。管理者モードから一般モードへはパスワードなしで戻せます。

連携確認用の`renkon`は、入力IDから`user_xxx`を作成し、PHPの`openssl_encrypt`で`AES-256-CBC`暗号化します。毎回ランダムな16バイトIVを生成し、`Base64(IV＋暗号文)`を`?token=...`としてoriginへ渡します。originは先頭16バイトをIVとして復号し、結果が`user_`＋半角数字3桁に完全一致する場合だけ許可します。不正な画面・API要求には`403 Forbidden`を返します。日付判定は廃止し、旧ECBトークンと旧セッションは受け付けません。カレンダーは従来どおり独立した公開リンクです。

指定仕様との互換用の鍵は`hash('sha256', 'SecretKey999', true)`で作る32バイト値です。renkon側の`KPTC_PORTAL_TOKEN_KEY`とorigin側の同名設定にはハッシュ化前の同じ元文字列を設定します。未設定時の元文字列は`SecretKey999`です。スケジューラURLはrenkon側の`KPTC_RENKON_SCHEDULER_URL`で変更できます。`config.js`は公開カレンダーURLだけを管理します。本番では既存社内システムにrenkonの`open-scheduler.php`相当処理を組み込み、ネットワーク制限も併用してください。

初回の管理者パスワードは、内部サーバーの公開フォルダで次を実行して設定します。入力したパスワードはハッシュ化され、内部SQLiteに保存されます。

```bash
php manage-auth-user-cli.php set-admin-mode-password
```

8〜128文字のパスワードを設定してください。設定後は管理者モード画面内から変更できます。確認を5回連続で誤ると、同じセッションからの切り替えを60秒間停止します。

旧版のアカウント情報は操作記録との互換性のため内部DBに保持されます。通常運用で利用者がアカウントを選択する操作はありません。

```bash
php manage-auth-user-cli.php list
```

重要: 一般モードでも予定を編集できます。指定CBC形式は暗号化のみであり、改ざん検出・トークンの有効期限・一度限りの使用・本人確認は提供しません。ランダムIVは再利用を防ぐ仕組みではありません。既定鍵を本番の秘密鍵として使わず、リバースプロキシ、VPNまたは社内ネットワーク制限も併用してください。

## 共有API

`01_source/public/api.php` が内部の共有データ、一般／管理者モード、操作履歴、変更取り消しを提供します。予定を保存・削除・取り消した後、試験室3室の当月を含む3か月分を公開可能な空き状態へ変換し、`01_source/public/availability-publisher.php` が外部サーバーへ送ります。連携に失敗しても予定の保存は取り消さず、内部DBへ再送待ち、連続失敗回数、最終試行・成功日時、エラー概要を記録します。

`01_source/public/public-availability.php` は公開ページ専用です。公開用JSONに保存された室ID・日付・状態（午前空き、午後空き、予約済み、メンテナンス）だけを返し、利用者名、予定件名、メモ、操作履歴は返しません。空き状況ページは内部APIや内部DBを直接参照しません。

外部の `receive-availability.php` は、共有秘密鍵によるHMAC-SHA256署名、送信時刻、最大128KiB、3室だけの固定スキーマ、許可した4状態、3か月以内の期間、更新世代を検証します。検証後は一時ファイルから同じJSONへ置き換えるため、月別ファイルや過去データの履歴は作成しません。

- 内部スケジュールDB: `/home/apfelrunner/GW/group-watcher.sqlite`
- 公開空き状況JSON（外部サーバー）: `/var/lib/kptc-availability/public-availability.json`

設定例は `01_source/deploy/internal-server.env.example` と `01_source/deploy/external-server.env.example` にあります。共有秘密鍵は `openssl rand -hex 32` などで個別に生成し、両サーバーのWeb用PHP環境と内部側の定期実行環境へ同じ値を設定します。リポジトリやWeb公開フォルダへ秘密鍵を保存しないでください。

共有レンタルサーバーなどでWeb用PHPへ環境変数を設定できない場合は、内部側・外部側それぞれのホームディレクトリに `GW/config/internal-env.php` または `GW/config/public-env.php` を置けます。`runtime-config.php` が公開領域外のこのファイルを自動的に読み込みます。別の場所を使う場合は `KPTC_INTERNAL_CONFIG_FILE` または `KPTC_PUBLIC_CONFIG_FILE` で絶対パスを指定します。

内部側の `publish-availability-cli.php` を5分間隔で実行すると、障害復旧後に自動再送されます。`monitor-availability-cli.php` は正常時0、再送待ち・連続失敗・30分超の未成功時1、DB等の設定異常時2を返します。外部側の `health-availability.php` は最終受信から30分以内かつ当月を含むJSONならHTTP 200、それ以外は503を返すため、一般的なURL監視から確認できます。systemdのサービス／タイマー例は `01_source/deploy/` に同梱しています。

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

試験室空き状況ページは `/GW/calendar/?room=m6`（電波暗室）、`room=m7`（電磁波妨害評価装置(G-TEM)）、`room=m8`（パルスサージシステム）で切り替えます。`02_release/tamanegi/index.html` を生成するため、ファイル名なしのディレクトリURLで表示できます。

### 試験室を追加する場合

公開画面の試験室一覧は、`01_source/public/availability-room-config.php`の許可リストに登録した「試験室」ユーザーから生成し、署名付き公開JSONへ名称・画像ファイル名・表示順を含めます。新しい試験室は、管理画面で試験室ユーザーを追加し、同ファイルの`kptc_public_room_ids()`へユーザーIDを追記して、外部サーバーの公開フォルダへ`<ユーザーID>.png`を配置すると、次回のJSON送信後に画面へ追加されます。画面のTypeScript修正や再ビルドは不要です。許可リストにない試験室ユーザーは外部公開されません。

既存3室の公開名称・説明は`01_source/public/availability-room-config.php`で上書きしています。スケジューラー上の名称と公開名称を変える場合だけ、この設定を変更してください。画像が未配置の場合は、試験室名の先頭2文字を代替表示します。
