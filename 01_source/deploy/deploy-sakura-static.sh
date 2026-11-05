#!/bin/sh
# 既存さくら環境専用。非公開の退避先へ展開したアーカイブから実行します。
set -eu
stage=$1
backup=$(dirname "$stage")
case "$stage" in /home/apfelrunner/GW/deploy-backups/static-*/new) ;; *) echo "Invalid staging path" >&2; exit 1 ;; esac
cd "$stage"
test -f 02_release/origin/Calendar/index.html
test -f 02_release/origin/Scheduler/api.php
crontab -l > "$backup/crontab.previous"
cp -p /home/apfelrunner/GW/config/internal-env.php "$backup/internal-env.previous.php"
cp -pR /home/apfelrunner/www/GW/Scheduler "$backup/Scheduler.previous"
cp -pR /home/apfelrunner/www/GW/Calendar "$backup/Calendar.previous"
/usr/local/bin/php -r '$from=new SQLite3("/home/apfelrunner/GW/group-watcher.sqlite"); $to=new SQLite3($argv[1]); if (!$from->backup($to)) exit(1); $to->close(); $from->close(); chmod($argv[1],0600);' "$backup/pre-static.sqlite"
chmod -R go-rwx "$backup"
# この環境には3行の既存ジョブのみ。予想外のジョブがあれば変更せず停止します。
test "$(wc -l < "$backup/crontab.previous" | tr -d ' ')" = 3
grep -q '/home/apfelrunner/GW/bin/publish-availability' "$backup/crontab.previous"
grep -q '/home/apfelrunner/GW/bin/monitor-availability' "$backup/crontab.previous"
grep -q '/home/apfelrunner/www/GW/Scheduler/backup-scheduler-cli.php' "$backup/crontab.previous"
# 移行中だけ旧公開連携を停止。失敗時は旧設定・コード・cronを戻します。
rollback() {
  echo "Migration failed; restoring application/configuration (DB is preserved)." >&2
  cp -p "$backup/internal-env.previous.php" /home/apfelrunner/GW/config/internal-env.php
  rsync -a --delete "$backup/Scheduler.previous/" /home/apfelrunner/www/GW/Scheduler/
  rsync -a --delete "$backup/Calendar.previous/" /home/apfelrunner/www/GW/Calendar/
  crontab "$backup/crontab.previous"
}
trap 'rollback' EXIT
crontab -r
mkdir -p /home/apfelrunner/GW/outbox /home/apfelrunner/GW/delivery
chmod 700 /home/apfelrunner/GW/outbox /home/apfelrunner/GW/delivery
cp 01_source/publisher/delivery-local-cli.php /home/apfelrunner/GW/bin/delivery-local-cli.php
cp 01_source/deploy/sakura-deliver-availability /home/apfelrunner/GW/bin/deliver-availability
chmod 700 /home/apfelrunner/GW/bin/delivery-local-cli.php /home/apfelrunner/GW/bin/deliver-availability
rsync -a --delete --exclude=.user.ini 02_release/origin/Scheduler/ /home/apfelrunner/www/GW/Scheduler/
find /home/apfelrunner/www/GW/Scheduler -type d -exec chmod 755 {} +
find /home/apfelrunner/www/GW/Scheduler -type f ! -name .user.ini -exec chmod 644 {} +
cp 01_source/deploy/sakura-Calendar.htaccess.example 02_release/origin/Calendar/.htaccess
find 02_release/origin/Calendar -type d -exec chmod 755 {} +
find 02_release/origin/Calendar -type f -exec chmod 644 {} +
# 別フォルダで静的版を完成させてから、公開先の中身を切り替えます。
rsync -a --delete 02_release/origin/Calendar/ /home/apfelrunner/www/GW/Calendar/
/usr/local/bin/php 01_source/deploy/configure-sakura-static-cli.php
/home/apfelrunner/GW/bin/publish-availability
/home/apfelrunner/GW/bin/deliver-availability
/home/apfelrunner/GW/bin/monitor-availability
crontab 01_source/deploy/sakura-static.cron.example
trap - EXIT
echo "Static calendar deployed. Backup: $backup"
