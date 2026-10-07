# Origin単一サーバー Docker構築

このフォルダのDockerfileは、`02_release`のビルド後ファイルをPHP 8.4＋Apacheの実行環境へ組み込みます。1台のOriginサーバー上で、スケジューラと公開カレンダーを別コンテナ・別保存領域として動かします。

## 配置と公開URL

| 用途 | コンテナ | 公開URLパス | ホスト待受 |
|---|---|---|---|
| 内部スケジューラ | `kptc-scheduler` | `/Scheduler/` | `127.0.0.1:8080` |
| 公開カレンダー | `kptc-calendar` | `/Calendar/` | `127.0.0.1:8081` |

カレンダーの英語表記は`Calendar`に統一しています。LinuxのパスとURLでは大文字・小文字を区別するため、公開パスは`/Calendar/`を使用してください。

## 環境設定

```bash
sudo install -d -m 700 /etc/kptc
sudo cp docker/origin/Scheduler/scheduler.env.example /etc/kptc/scheduler.env
sudo cp docker/origin/Calendar/calendar.env.example /etc/kptc/calendar.env
sudo chmod 600 /etc/kptc/scheduler.env /etc/kptc/calendar.env
sudo nano /etc/kptc/scheduler.env
sudo nano /etc/kptc/calendar.env
```

両ファイルの`KPTC_PUBLIC_AVAILABILITY_SECRET`には同じ32文字以上のランダム値を設定します。スケジューラからカレンダーへの送信先はDocker内部名の`http://kptc-calendar/receive-availability.php`です。外部インターネットへHTTP送信する設定ではありません。

## 起動

リポジトリ最上位で実行します。

```bash
sudo docker compose -f compose.origin-single.yaml config
sudo docker compose -f compose.origin-single.yaml up -d --build
sudo docker compose -f compose.origin-single.yaml ps
```

## リバースプロキシ管理者への要件

- `/Scheduler/`を`http://127.0.0.1:8080/`へ、`/Calendar/`を`http://127.0.0.1:8081/`へ中継し、公開側の接頭辞をコンテナへ渡す前に取り除きます。
- `/Scheduler`から`/Scheduler/`、`/Calendar`から`/Calendar/`への転送では、クエリ文字列を保持します。
- `Host`、`X-Forwarded-For`、`X-Forwarded-Proto`を渡し、HTTPSを使用します。
- `/Scheduler/`は特定IPだけ、`/Calendar/`は全IPからアクセス可能とします。
- PHPとJSON応答はキャッシュせず、名前にハッシュを含む静的ファイルだけ長期キャッシュできます。
- 8080番と8081番は外部へ直接公開しません。

リバースプロキシそのものの導入・設定は、このリポジトリの作業範囲外です。

## 保存領域

- SQLiteとJSONバックアップ：`kptc-scheduler-data`
- 公開用3か月JSON：`kptc-calendar-data`

公開カレンダーはスケジューラのSQLiteを直接読みません。予定保存時と5分ごとの再送処理で、公開してよい3か月分だけを署名付きJSONとして内部Dockerネットワーク経由で送信します。
