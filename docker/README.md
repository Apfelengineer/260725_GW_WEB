# KPTC Docker構成の簡易参考
詳細手順は[HTML構築手順書](../docs/KPTC_Scheduler_Docker構築手順書.html)を参照してください。

| 運用段階 | サーバー | 使用する定義 |
|---|---|---|
| 初期：同一サーバー | Origin | `compose.origin-single.yaml` |
| 分離後 | Origin | `compose.origin-split.yaml` |
| 分離後 | Tamanegi | `compose.tamanegi.yaml` |

## 共通の担当
- Scheduler：PHP 8.4＋Apache、内部SQLite、公開JSONの生成。
- 配信担当：Python＋OpenSSH。SQLiteなし。公開JSONの検証、local書込みまたはSFTP転送、結果記録。
- Calendar：Nginx、HTML・CSS・JavaScript・画像だけ。JSON読取り専用。PHP・受信API・鍵なし。

## 初期設定（Origin・新規構築のみ）
```bash
cp compose.env.example .env
nano .env
sudo install -d -m 700 /etc/kptc
sudo cp docker/origin/Scheduler/scheduler.env.example /etc/kptc/scheduler.env
sudo cp docker/publisher/publisher.env.example /etc/kptc/publisher.env
sudo chmod 600 /etc/kptc/scheduler.env /etc/kptc/publisher.env
sudo nano /etc/kptc/scheduler.env
sudo nano /etc/kptc/publisher.env
sudo docker compose -f compose.origin-single.yaml build --pull
sudo docker compose -f compose.origin-single.yaml up -d
```

`KPTC_ORIGIN_BIND_ADDRESS`にはOrigin内部IPを指定します。ブラウザが`http://origin:8080/`ならCookie Pathは`/`、Secureは`0`。HTTPSの`/Scheduler/`経由ならPathは`/Scheduler/`、Secureは`1`です。

## 生成・配信・監視
```bash
sudo docker exec kptc-scheduler php /var/www/html/publish-availability-cli.php
sudo docker compose -f compose.origin-single.yaml exec kptc-publisher python /opt/kptc/delivery.py --once
sudo docker exec kptc-scheduler php /var/www/html/monitor-availability-cli.php
```
`queued:true`は生成済み、配信担当の`ok:true`は配信済みです。生成は保存時と5分ごと、配信確認は30秒ごと。公開画面は60秒ごとにJSONを再取得します。

## 保存領域
- `kptc-scheduler-data`：SQLiteと毎日22時の非公開バックアップ。Scheduler専用。
- `kptc-outbox`：公開JSONの生成先。Schedulerが書込み、配信担当は読取り専用。
- `kptc-publish-status`：配信結果。配信担当が書込み、Schedulerは読取り専用。
- `kptc-calendar-static-data`：local公開JSON。配信担当が書込み、Calendarは読取り専用。

## Tamanegiへの分離
HTML手順書9章に従い、転送専用アカウント・鍵・known_hosts・通信制限を準備します。publisher.envを`KPTC_AVAILABILITY_DELIVERY_MODE=sftp`へ変更し、Originでsplit定義、Tamanegiで専用定義を起動します。秘密鍵をマウントするのは配信担当だけです。Tamanegiの`/srv/kptc-calendar/data`だけを転送可能にし、既存HPや静的プログラムへ書き込む権限を与えません。

公開URLの`/Scheduler/`・`/Calendar/`は管理者のプロキシで接頭辞を取り除いて転送します。JSONは`/Calendar/data/public-availability.json`。PHP・旧受信APIへの転送は廃止です。`/healthz`はWeb稼働だけを確認し、JSON鮮度は配信担当のhealthと内部監視で確認します。
