# KPTC Scheduler ビルド後配布ファイル

このフォルダには、`01_source`から生成したサーバー配布用ファイルだけを保存します。TypeScriptやTSXの開発用ソースは含みません。

## 配布先

- `origin/Scheduler/`：Originサーバーの内部スケジューラ公開フォルダ
- `origin/Calendar/`：Originサーバーの公開カレンダー公開フォルダ
- `renkon/`：既存社内システムとの接続を試す模擬サイト
- `SHA256SUMS`：配布ファイルの破損・差替え確認用一覧

`origin/Scheduler/index.php`は暗号化トークンを検証してから画面を返す入口です。`origin/Calendar/index.html`は認証を必要としない公開カレンダーの入口です。SQLite、公開JSON、環境設定、秘密値、ログは含めません。

`renkon/`は開発・確認専用です。本番では既存社内システムへ`open-scheduler.php`相当の処理を組み込むため、Originサーバーへ配置する必要はありません。

## 再生成

```bash
cd 01_source
pnpm install
pnpm run build
pnpm run check
pnpm test
```

ビルドは`origin/Scheduler/`、`origin/Calendar/`、`renkon/`を作り直し、最後に`SHA256SUMS`を更新します。古いハッシュ名付きJavaScript・CSSは残りません。

## 配置時の注意

このフォルダだけでは動作しません。PHP実行環境、Webサーバー、HTTPS、非公開の保存領域、実環境設定が必要です。さくら用`.user.ini`の例は`01_source/deploy/`、Docker用設定例は`docker/origin/`にあります。
