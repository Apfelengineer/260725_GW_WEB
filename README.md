# KPTC Scheduler

Group Watcher 3.65 の主要機能を、PC・タブレット・スマートフォンから利用できるよう「KPTC Scheduler」として再設計したWEBブラウザ版です。

PHP APIと内部用SQLiteへデータを保存するため、別端末・別ブラウザ間でも編集内容が共有されます。試験室の空き状況は個人情報を含まない3か月分の公開用JSONへ変換し、専用配信担当がlocal書込みまたはSFTP転送で静的Calendarへ配信します。スケジューラーはrenkon（社内ポータル）が発行するCBC暗号化トークンを検証して一般モードで開き、パスワード確認後だけ管理者モードへ切り替わります。セッションとCSRF対策はサーバー側で管理します。

## GitHubのフォルダ構成

- `01_source/origin/Scheduler/`: SchedulerのHTML・React起動点
- `01_source/origin/Calendar/`: CalendarのHTML・React起動点
- `01_source/origin/shared/`: 両画面のReact・PHP原本
- `02_release/origin/Scheduler/`: OriginサーバーのScheduler配下へ配置する完成物
- `02_release/origin/Calendar/`: OriginサーバーのCalendar配下へ配置する完成物
- `02_release/renkon/`: 社内システムからの接続を試す模擬サイト（開発・確認専用）
- `docs/`: 専門外の方向けDocker構築手順書（HTML）
- `docker/origin/Scheduler/`・`docker/origin/Calendar/`: Scheduler・静的CalendarのDockerfileと設定例。配信担当は`docker/publisher/`

ビルド前とビルド後を明確に分離しています。`02_release`にはデータベース、実環境設定、秘密鍵、公開JSON、ログを含めません。

DockerでOrigin単一サーバーへ構築する場合は、[Docker構築手順](docker/README.md)を参照してください。各イメージは`02_release/origin/Scheduler`または`02_release/origin/Calendar`の完成物を使用し、データと秘密設定はDockerボリューム・起動時環境変数へ分離します。

## システム資料

- [専門外の方向けDocker構築手順書（HTML）](docs/KPTC_Scheduler_Docker構築手順書.html)

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
- PHPなしの静的カレンダーと、内部DB・公開JSON・転送鍵の分離
- 当月を含む3か月分のJSON検証、世代確認、一時ファイルからの一括置換
- local配信からSFTP配信への設定切替、30秒間隔の再試行と監視
- Scheduler用／Calendar用の配布ファイル完全分離
- PC／スマートフォン対応のレスポンシブ表示
- Open Graph共有画像と日本語メタ情報

## 開発

Node.js 22.13以上とpnpmを使用します。画面はVite＋React、内部保存・公開JSON生成はPHP、配信担当はPython＋OpenSSHで動作します。

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

- `02_release/origin/Scheduler`: スケジューラー画面、内部API、認証、送信・再送・監視コマンド
- `02_release/origin/Calendar`: 静的HTML・CSS・JavaScript・画像（PHPなし）
- `02_release/renkon`: 3桁のユーザーID入力欄、暗号化トークン発行入口、カレンダーリンクを備える社内ポータル模擬画面

`renkon`は連携確認用であり、本番のOrigin構築には不要です。実運用では既存の社内システムが同じ役割を担うため、`02_release/renkon`を配置しません。

外部用には `api.php`、`auth.php`、管理コマンド、SQLite接続処理を含めません。内部画面の「試験室予約」リンク先は、内部サーバー設定の `KPTC_PUBLIC_AVAILABILITY_PAGE_URL=https://origin.example.jp/Calendar/` で指定します。本番URLが変わっても再ビルドは不要です。値がない開発環境では、ビルド時の `VITE_KPTC_PUBLIC_AVAILABILITY_URL`、続いて相対URL `../Calendar` を使用します。開発中の2画面は `pnpm run dev` で確認できます。

## 一般モードと管理者モード

renkonで3桁のユーザーIDを設定し、発行された専用リンクを開くと、ログイン画面を表示せず一般モードの予定表が開きます。一般モードでは予定の閲覧・追加・編集・移動・コピー・削除ができます。画面内の「管理者モード」から管理者パスワードを入力すると、ユーザー・試験室・予定種別の管理機能が追加されます。管理者モードから一般モードへはパスワードなしで戻せます。

連携確認用の`renkon`は、入力IDから`user_xxx`を作成し、PHPの`openssl_encrypt`で`AES-256-CBC`暗号化します。毎回ランダムな16バイトIVを生成し、`Base64(IV＋暗号文)`を`?token=...`としてoriginへ渡します。originは先頭16バイトをIVとして復号し、結果が`user_`＋半角数字3桁に完全一致する場合だけ許可します。不正な画面・API要求には`403 Forbidden`を返します。旧ECBトークンと旧セッションは受け付けません。カレンダーは従来どおり独立した公開リンクです。

トークン鍵は、固定部分の末尾へPHPの`gmdate('Ymd')`で取得したUTC当日の8桁日付を付け、`hash('sha256', 固定部分 . YYYYmmdd, true)`で32バイト化します。既定の固定部分は`SecretKey`なので、2026年9月8日（UTC）の元文字列は`SecretKey20260908`です。renkon側とorigin側の`KPTC_PORTAL_TOKEN_KEY`には同じ固定部分を設定します。従来値`SecretKey999`は移行互換として`SecretKey`へ読み替えます。スケジューラURLはrenkon側の`KPTC_RENKON_SCHEDULER_URL`で変更できます。`config.js`は公開カレンダーURLだけを管理します。本番では既存社内システムにrenkonの`open-scheduler.php`相当処理を組み込み、ネットワーク制限も併用してください。

初回の管理者パスワードは、内部サーバーの公開フォルダで次を実行して設定します。入力したパスワードはハッシュ化され、内部SQLiteに保存されます。

```bash
php manage-auth-user-cli.php set-admin-mode-password
```

8〜128文字のパスワードを設定してください。設定後は管理者モード画面内から変更できます。確認を5回連続で誤ると、同じセッションからの切り替えを60秒間停止します。

旧版のアカウント情報は操作記録との互換性のため内部DBに保持されます。通常運用で利用者がアカウントを選択する操作はありません。

```bash
php manage-auth-user-cli.php list
```

重要: 一般モードでも予定を編集できます。UTC日付で鍵が毎日変わるため、前日の鍵で作ったトークンは復号できません。ただしCBC形式自体は改ざん検出・発行時刻の検証・一度限りの使用・本人確認を提供しません。UTC 00:00をまたいだ未使用トークンも無効になります。既定の固定部分を本番の秘密として使わず、十分に長いランダム値と、リバースプロキシ、VPNまたは社内ネットワーク制限を併用してください。

## JSONからの予定一括登録

内部ユーザーIDは電気通信係`e001`〜、試験室`t001`〜の自動採番です。旧版DBは初回アクセス時に退避してから関連予定・アカウントも一括移行します。IDの自由編集はできません。[内部ID体系](docs/KPTC_Scheduler_内部ID体系.md)を参照してください。

既存アプリの`.sch`・`.dtl`を変換する場合は、`02_release/converter/KPTC_既存データJSON変換ツール.html`をPCのブラウザで開きます。ユーザー別・月別のファイルを一括読込し、ツール上で登録先ユーザーを指定して予定JSONを保存できます。予定種別は指定6種を保持し、それ以外を「その他」へ自動変換します。HTML1個のオフライン独立ツールで、スケジューラへの送信や自動登録は行いません。[使い方](docs/KPTC_既存データJSON変換ツール_使い方.md)を参照してください。

管理者モードの「JSONから予定を取込」で、内容確認後に予定だけを現在のDBへ一括追加できます。既存予定やユーザー・認証設定は上書きしません。最大1MiB・5000件で、過去・未来の予定を扱います。不正な予定があれば全件中止し、同じID・同じ内容の再取込は重複登録しません。ファイル形式と操作方法は[JSON予定取込](docs/KPTC_Scheduler_JSON予定取込.md)を参照してください。

## 毎日22時の最新JSONバックアップ

`backup-scheduler-cli.php`は日本時間の当日以降に終了する予定を、未来側の上限なしで保存します。開始が過去でも当日以降まで継続する予定は含めます。ユーザー・試験室・予定種別・互換用アカウント・管理者パスワードのハッシュも含み、過去に終了した予定と操作履歴は含めません。本番DBの予定は削除しません。

- さくらの保存先: `/home/apfelrunner/GW/backups/scheduler-latest.json`
- Ubuntuの保存先例: `/var/lib/kptc-scheduler/backups/scheduler-latest.json`
- 変更する場合: 内部設定の`KPTC_SCHEDULER_BACKUP_JSON`に絶対パスを指定
- 未設定の場合: 内部DBの隣の`backups/scheduler-latest.json`

元DBを読み取り専用のトランザクションで検査し、JSONを一時ファイルへ書き込み、読み戻し・SHA-256確認・一時SQLiteへの復元試験に成功した後だけ最新版を原子的に置き換えます。DB破損・必須項目の欠落などで失敗した場合は直前の正常JSONを保持し、非0の終了コードとエラーログを返します。保存ファイルは所有者のみ読み書き可能（600）、新規保存フォルダは700です。正常終了後に世代別ファイルは残りません。並行実行防止用の`.lock`は必要なファイルです。

```bash
php backup-scheduler-cli.php
php restore-scheduler-cli.php /非公開保存先/scheduler-latest.json /非公開保存先/restored.sqlite
```

復元処理は未使用のファイル名にだけ新しいDBを作ります。本番DBへ自動で上書き・切替はしません。管理者は復元したDBを確認してから、利用を止めた状態で内部設定のDBパスを新しいDBへ切り替えてください。既存ブラウザのセッションも終了させ、renkonから入り直してください。公開JSONの更新世代が復元DBより先へ進んでいる場合は、管理者が世代番号の整合を取ってから公開送信を再開してください。過去の予定・操作履歴は復元されません。

さくらでは既存の送信・監視cronを維持して次を追加します（サーバー時刻が日本時間であることを確認）。

```cron
0 22 * * * /usr/local/bin/php /home/apfelrunner/www/GW/Scheduler/backup-scheduler-cli.php >/home/apfelrunner/GW/scheduler-backup.log 2>&1
```

Ubuntu 24.04では`01_source/deploy/kptc-scheduler-backup.service`と`.timer`を`/etc/systemd/system/`へ置き、配置パス・実行ユーザー・環境設定パスを確認後、`systemctl enable --now kptc-scheduler-backup.timer`で有効化します。実行時刻は明示的に`Asia/Tokyo`の22時、停止中の取り逃しは起動後に実行します。ログは`journalctl -u kptc-scheduler-backup.service`で確認できます。

注意: このJSONは公開カレンダー用JSONとは別です。機密情報を含むためWeb公開領域・GitHubへ置かないでください。環境設定や共通鍵・画像は含まれません。最新版のみのため誤削除が正常なデータとして翌日保存された場合は戻せず、同一サーバー全体の故障にも対応できません。通常の整合性チェックで検出できない意味上のデータ破損もあり、完全な検知を保証するものではありません。メール通知・別サーバーへの複製は現時点では含みません。

検証: `cd 01_source && pnpm run test:backup`（PHPのSQLite3・PDO SQLite拡張が必要）。

## 共有APIの処理

`01_source/origin/shared/public/api.php` が内部の共有データ、一般／管理者モード、操作履歴、変更取り消しを提供します。予定を保存・削除・取り消した後、試験室3室の当月を含む3か月分を公開可能な空き状態へ変換し、`01_source/origin/shared/public/availability-publisher.php` が公開JSON専用出力領域へ保存します。連携に失敗しても予定の保存は取り消さず、内部DBへ再送待ち、連続失敗回数、最終試行・成功日時、エラー概要を記録します。

公開画面は`./data/public-availability.json`を直接読み、内部API・SQLiteに接続しません。公開側のPHP受信API・共有HMAC秘密値は廃止しています。

- `kptc-scheduler-data`：内部SQLiteと非公開バックアップ。
- `kptc-outbox`：公開JSONの生成先。配信担当は読取り専用。
- `kptc-publish-status`：配信担当が書く監視結果。内部画面は読取り専用。
- `kptc-calendar-static-data`：localの公開JSON。Calendarは読取り専用。

`01_source/publisher/delivery.py`はSQLiteをマウントしない専用コンテナで動きます。`KPTC_AVAILABILITY_DELIVERY_MODE=local`なら同一サーバーの専用Volumeへ書込み、`sftp`なら限定した転送アカウントでTamanegiへ送ります。SFTP鍵は配信担当だけへread-onlyで渡し、ホスト鍵検証・シェル転送禁止・接続先制限を適用します。JSONは最大128KiB・許可項目・日付・状態・当月3か月・世代を確認します。

予定保存時と5分ごとのCLIでJSONを生成し、配信担当が30秒ごとに配信・再試行します。生成の`queued:true`と配信の`ok:true`を区別してください。`monitor-availability-cli.php`はDB版番号と配信結果・鮮度を照合します。Calendarの`/healthz`はWebプロセスだけの確認です。公開画面は60秒ごとに再取得し、30分以上古い情報に注意を表示します。

構築・旧版移行・Tamanegiへの分離は[HTML手順書](docs/KPTC_Scheduler_Docker構築手順書.html)を参照してください。Schedulerは`docker/origin/Scheduler/scheduler.env.example`、配信担当は`docker/publisher/publisher.env.example`からenvを作成します。既存envを例で上書きしません。

将来、組織の認証基盤が確定した場合に差し替える項目:

- OIDC／LDAP等の組織アカウント認証
- 組織側のグループ／メンバー／権限連携

## さくらインターネットへの配置

さくら共有サーバーではDocker・Pythonを使わず、非公開領域の`01_source/publisher/delivery-local-cli.php`を定期実行して静的CalendarへJSONを配信します。PHPは内部処理だけに使用し、公開Calendarフォルダには置きません。通常のUbuntu構成はPython配信コンテナを使用します。

共有サーバーのPHP配信処理には`KPTC_AVAILABILITY_SOURCE_JSON`（非公開の生成先）、`KPTC_AVAILABILITY_LOCAL_JSON`（公開先）、`KPTC_AVAILABILITY_STATUS_JSON`（非公開の結果）を絶対パスで渡し、引数に内部側の`availability-contract.php`のパスを指定します。生成5分・配信1分・監視10分の定期実行を使います。スケジューラのSQLiteと毎日22時のバックアップは既存の非公開領域を引き継ぎます。

従来の公開URL：
- 内部：`https://apfelrunner.sakura.ne.jp/GW/Scheduler/`
- 外部：`https://apfelrunner.sakura.ne.jp/GW/Calendar/`

静的画面の部屋切替IDは`t001`等です。旧`?room=m6`・`?room=m7`・`?room=m8`は既存画像との対応で読み替えます。JSON取得先は`data/public-availability.json`です。

### 試験室を追加する場合

公開画面の試験室一覧は、`01_source/origin/shared/public/availability-room-config.php`の`kptc_public_room_keys()`に登録した「試験室」から生成します。初期3室は旧キーと`legacyId`で照合し、画像名を維持します。新しい試験室は管理画面で追加し、同関数へ新ID（例：`t004`）を追記して、Calendarへ対応する画像（例：`t004.png`）を配置すると公開できます。静的コンテナは画像追加後に再ビルドします。許可リストにない試験室は公開しません。

既存3室の公開名称・説明は`01_source/origin/shared/public/availability-room-config.php`で上書きしています。スケジューラー上の名称と公開名称を変える場合だけ、この設定を変更してください。画像が未配置の場合は、試験室名の先頭2文字を代替表示します。
