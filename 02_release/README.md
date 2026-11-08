# KPTC ビルド後配布ファイル

- `origin/Scheduler/`：内部PHP API、画面、認証、公開JSON生成、バックアップ・監視コマンド。
- `origin/Calendar/`：静的HTML・CSS・JavaScript・画像。PHPなし。同一Originでも別Tamanegiでも同じ配布物。
- `renkon/`：検証用社内入口。本番配置は不要。
- `converter/`：PC上で開く、独立したオフライン既存データJSON変換ツール。HTML1個で動作し、サーバーへの配置は不要。
- `SHA256SUMS`：配布物のSHA-256一覧。

公開JSON、SQLite、秘密鍵、実env、ログは含みません。静的カレンダーは固定相対URL`./data/public-availability.json`を読みます。実際の公開JSONは専用VolumeまたはTamanegiの専用フォルダから配信します。

Docker構成には`docker/`・Compose定義・配信担当の`01_source/publisher/delivery.py`も必要です。配布フォルダだけをコピーしてコンテナを構築することはできません。詳細は[HTML構築手順書](../docs/KPTC_Scheduler_Docker構築手順書.html)を参照してください。

再生成：
```bash
cd 01_source
pnpm run build
pnpm run check
pnpm test
```

旧PHPカレンダーへファイルを重ねず、新しい静的フォルダへ切り替えてください。旧PHP・.user.ini・実環境設定を静的公開領域へ持ち込みません。
