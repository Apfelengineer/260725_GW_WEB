# origin・tamanegi Docker構築

このフォルダのDockerfileは、`02_release`にあるビルド後ファイルをPHP 8.4＋Apacheの実行環境へ組み込みます。originとtamanegiは別々のサーバーで構築できます。SQLite、公開JSON、バックアップ、秘密鍵はイメージやGitHubへ含めません。

## 1. origin（内部スケジューラ）

リポジトリの最上位フォルダでイメージを作ります。

```bash
docker build -f docker/origin/Dockerfile -t kptc-origin:latest .
```

設定例をWeb公開外の安全な場所へコピーし、`REPLACE...`とURLを実環境の値へ変更します。`KPTC_PORTAL_TOKEN_KEY`は既存社内システムと同じ固定部分、`KPTC_PUBLIC_AVAILABILITY_SECRET`はtamanegiと同じ32文字以上の秘密値にします。

```bash
sudo mkdir -p /etc/kptc
sudo cp docker/origin/origin.env.example /etc/kptc/origin.env
sudo chmod 600 /etc/kptc/origin.env
sudo nano /etc/kptc/origin.env
docker volume create kptc-origin-data
docker run -d --name kptc-origin --restart unless-stopped \
  --env-file /etc/kptc/origin.env \
  -p 127.0.0.1:8080:80 \
  -v kptc-origin-data:/var/lib/kptc-scheduler \
  kptc-origin:latest
```

初回起動後、管理者モードのパスワードを設定します。

```bash
docker exec -it kptc-origin php /var/www/html/manage-auth-user-cli.php set-admin-mode-password
```

originコンテナ内では、公開JSON送信を5分ごと、送信監視を5分ごと、最新JSONバックアップを日本時間の毎日22:00に実行します。バックアップは`kptc-origin-data`ボリューム内の`backups/scheduler-latest.json`へ保存されます。

## 2. tamanegi（外部カレンダー）

```bash
docker build -f docker/tamanegi/Dockerfile -t kptc-tamanegi:latest .
sudo mkdir -p /etc/kptc
sudo cp docker/tamanegi/tamanegi.env.example /etc/kptc/tamanegi.env
sudo chmod 600 /etc/kptc/tamanegi.env
sudo nano /etc/kptc/tamanegi.env
docker volume create kptc-tamanegi-data
docker run -d --name kptc-tamanegi --restart unless-stopped \
  --env-file /etc/kptc/tamanegi.env \
  -p 127.0.0.1:8081:80 \
  -v kptc-tamanegi-data:/var/lib/kptc-availability \
  kptc-tamanegi:latest
```

originの`KPTC_PUBLIC_AVAILABILITY_ENDPOINT`には、外部から到達できるtamanegiのHTTPS URL（例：`https://tamanegi.example.jp/receive-availability.php`）を指定します。公開ページはtamanegiのルートURLです。

## 3. HTTPSとデータの維持

上記の`127.0.0.1:8080`と`127.0.0.1:8081`は、同じサーバー上のリバースプロキシからだけ接続する指定です。実運用ではnginxなどでHTTPSを終端し、originは社内ネットワークだけ、tamanegiは外部公開するよう制限してください。コンテナへ秘密鍵を直接書き込んだり、HTTPでインターネットへ公開したりしないでください。

コンテナを作り直してもデータを残すには、必ず上記のDockerボリュームを付けます。現在のSQLiteを移行する場合は、停止中のoriginの`/var/lib/kptc-scheduler/group-watcher.sqlite`へコピーし、所有者をコンテナ内の`www-data`へ合わせます。tamanegiの公開JSONはoriginから再送できるため、過去ファイルの移行は必須ではありません。

状態確認には次を使用します。

```bash
docker ps
docker logs kptc-origin
docker logs kptc-tamanegi
docker exec kptc-origin php -m
curl -I http://127.0.0.1:8081/
```

originのルートURLがHTTP 403になるのは、renkonまたは既存社内システムの正しいトークンが必要なため正常です。
