# KPTC Scheduler ビルド後配布ファイル

このフォルダには、`01_source`から生成したサーバー配布用ファイルだけを保存します。TypeScriptやTSXの開発用ソースは含みません。

## 配布先

- `origin/`: 内部サーバーoriginのスケジューラー公開フォルダへ配置します。
- `tamanegi/`: 外部サーバーtamanegiの空き状況公開フォルダへ配置します。
- `renkon/`: 既存社内システムとの接続を試すための模擬サイトです。
- `SHA256SUMS`: 配布ファイルが壊れたり、別の内容へ変わったりしていないか確認する一覧です。

`renkon/`は確認専用です。本番環境では社内システムがすでに存在するため、originや社内サーバーへ配置する必要はありません。必要な場合だけ、`renkon/config.js`のスケジューラーURLとカレンダーURLを書き換えて検証用Webサーバーへ配置します。

## 再生成方法

リポジトリの`01_source`へ移動し、次を実行します。

```bash
pnpm install
pnpm run build
pnpm run check
pnpm test
```

`pnpm run build`は`origin/`、`tamanegi/`、`renkon/`を作り直し、最後に`SHA256SUMS`を更新します。古いハッシュ名付きJavaScript・CSSは残りません。

## 意図的に含めていないもの

次のデータは機密情報またはサーバー固有データのため、GitHubへ保存しません。

- SQLiteデータベースと利用者の予定
- 実環境の`internal-env.php`と`public-env.php`
- JSON連携用の共有秘密鍵
- 最新の公開JSON
- セッション、ログ、バックアップ

さくらインターネット用`.user.ini`の例は`01_source/deploy/`に分離しています。Ubuntu 24.04のorigin・tamanegiでは、WebサーバーまたはPHP-FPMの設定で環境変数を指定してください。

## 配置時の注意

このフォルダだけでは完全には動作しません。PHP実行環境、Webサーバー、HTTPS、保存フォルダ、実環境設定が必要です。現在のデータを引き継ぐ場合は、内部サーバーへSQLiteデータベースも別途移行します。詳しくは`docs/KPTC_Scheduler_独立Linuxサーバー構築・移行手順書.pdf`を参照してください。
