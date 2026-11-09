/** ソースに主要機能と公開用素材が残っていることを軽量に検証する回帰テストです。 */

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const repositoryRoot = new URL("../../", import.meta.url);

test("KPTC Scheduler の主要機能を提供する", async () => {
  // 主要画面・通信層・サーバーAPIをまとめて読み、必須機能の手掛かりを検査します。
  const [page, styles, html, api, phpApi] = await Promise.all([
    readFile(new URL("origin/shared/app/page.tsx", root), "utf8"),
    readFile(new URL("origin/shared/app/globals.css", root), "utf8"),
    readFile(new URL("origin/Scheduler/index.html", root), "utf8"),
    readFile(new URL("origin/shared/app/lib/group-watcher-api.ts", root), "utf8"),
    readFile(new URL("origin/shared/public/api.php", root), "utf8"),
  ]);

  assert.match(page, /スケジュール/);
  assert.match(page, /ユーザー・予定種別/);
  assert.match(page, /予定を登録/);
  assert.match(page, /name="private" type="checkbox"/);
  assert.match(page, /月曜始まり/);
  assert.match(page, /Ctrl\+C/);
  assert.match(page, /useState<string\[\]>\(\[\]\)/);
  assert.match(page, /onSelect\(item, event\.shiftKey\)/);
  assert.match(page, /selectedScheduleIds\.includes\(item\.id\)/);
  assert.match(page, /clipboard\.items/);
  assert.match(page, /function copySchedules/);
  assert.match(page, /function deleteSchedules/);
  assert.match(page, /setSelectedScheduleIds\(\[\]\)/);
  assert.match(page, /event\.key === "Escape"/);
  assert.match(page, /Shift<\/kbd>＋クリックで複数選択/);
  assert.match(page, /onDoubleClick/);
  assert.match(page, /onDrop/);
  assert.match(page, /role="button"[\s\S]*tabIndex=\{0\}[\s\S]*draggable=\{editable\}/);
  assert.match(page, /data-schedule-drop-cell="true"/);
  assert.match(page, /function beginPointerScheduleDrag/);
  assert.match(page, /window\.addEventListener\("pointerup", onPointerUp\)/);
  const dragMoveFunction = page.slice(page.indexOf("function moveSchedule"), page.indexOf("useEffect", page.indexOf("function moveSchedule")));
  assert.match(dragMoveFunction, /setPendingMove/);
  assert.match(dragMoveFunction, /function confirmScheduleMove/);
  assert.match(dragMoveFunction, /予定の移動をキャンセルしました/);
  assert.doesNotMatch(dragMoveFunction, /window\.confirm/);
  assert.match(page, /function MoveConfirmationModal/);
  assert.match(page, /予定の移動確認/);
  assert.match(page, /<dt>移動元<\/dt>/);
  assert.match(page, /<dt>移動先<\/dt>/);
  assert.match(page, />移動する<\/button>/);
  assert.match(page, /予定種別を追加/);
  assert.doesNotMatch(page, /LoginScreen|ゲストとしてログイン|選択したユーザーでログイン/);
  assert.match(page, /function AdminModeModal/);
  assert.match(page, /管理者モードへ切り替え/);
  const memberForm = page.slice(page.indexOf("function MemberModal"),page.indexOf("function CategoryModal"));
  assert.match(memberForm,/内部ユーザーID（自動採番）/);
  assert.match(memberForm,/readOnly/);
  assert.doesNotMatch(memberForm,/name="memberId"/);
  assert.match(page, /autoComplete="current-password"/);
  assert.match(page, /function AdminPasswordModal/);
  assert.match(page, /管理者パスワード変更/);
  assert.match(page, /新規予定作成/);
  assert.match(page, /name="endDate"/);
  assert.match(page, /name="timePreset"/);
  const scheduleForm = page.slice(page.indexOf("function ScheduleModal"), page.indexOf("function MemberModal"));
  const userField = scheduleForm.indexOf('name="memberId"');
  const categoryField = scheduleForm.indexOf('name="category"');
  const startDateField = scheduleForm.indexOf('name="date"');
  const endDateField = scheduleForm.indexOf('name="endDate"');
  const timePresetField = scheduleForm.indexOf('name="timePreset"');
  const titleField = scheduleForm.indexOf('name="title"');
  const locationField = scheduleForm.indexOf('name="location"');
  assert.ok([userField, categoryField, startDateField, endDateField, timePresetField, titleField, locationField].every((index) => index >= 0));
  assert.ok(userField < startDateField && startDateField < endDateField && endDateField < timePresetField && timePresetField < titleField && titleField < locationField && locationField < categoryField);
  assert.match(scheduleForm, /schedule-date-time/);
  assert.doesNotMatch(scheduleForm, /member.group/);
  assert.match(page, /location: String\(form.get\("location"\)/);
  assert.match(page, /午前（9:00–12:00）/);
  assert.match(page, /午後（13:00–17:00）/);
  assert.match(page, /終日/);
  assert.match(page, /操作履歴/);
  assert.match(page, /ユーザー表示順変更/);
  assert.match(page, /予定種別表示順変更/);
  assert.match(page, /<th>表示順<\/th>/);
  assert.match(page, /を上へ/);
  assert.match(page, /を下へ/);
  assert.match(page, /scheduleOccursOn/);
  assert.doesNotMatch(page, /name="repeat"|name="repeatUntil"|name="reminderMinutes"|繰り返し|リマインダー|shownRemindersRef/);
  assert.match(page, /addMonths/);
  assert.match(page, /VITE_KPTC_PUBLIC_AVAILABILITY_URL/);
  assert.match(page, /KPTC_PUBLIC_AVAILABILITY_PAGE_URL|defaultPublicAvailabilityUrl/);
  assert.match(page, /window\.open\(publicUrl, "_blank", "noopener,noreferrer"\)/);
  assert.doesNotMatch(page, /window\.location\.assign\("\.\/reservations\.html\?room=m6"\)/);
  assert.match(page, /useState\(\(\) => dateAtNoon\(new Date\(\)\)\)/);
  assert.doesNotMatch(page, /new Date\(2026, 6, 24/);
  assert.match(styles, /grid-template-columns: minmax\(110px,1\.15fr\) repeat\(7,minmax\(72px,1fr\)\)/);
  assert.match(styles, /day-header\.holiday,.schedule-cell\.holiday \{ background: #fff0ed; \}/);
  assert.match(styles, /day-view-heading\.holiday,.day-events\.holiday \{ background: #fff0ed; \}/);
  assert.match(styles, /month-days > div\.holiday \{ background-color: #fff0ed; \}/);
  assert.match(styles, /member-cell b \{[^}]*overflow-wrap: anywhere; white-space: normal;/);
  assert.match(styles, /day-member-profile b \{[^}]*overflow-wrap: anywhere; white-space: normal;/);
  assert.match(styles, /schedule-event \{[^}]*min-height: 40\.5px;/);
  assert.doesNotMatch(styles, /schedule-event \{[^}]*min-height: 54px;/);
  assert.match(api, /groupWatcherApi/);
  assert.match(api, /saveDelta/);
  assert.match(page, /SchedulerSync/);
  assert.doesNotMatch(api, /demoCategories|demoMembers|demoSchedules/);
  assert.match(api, /\["すべてのグループ", "電気通信係", "試験室"\]/);
  for (const category of ["休暇", "機器点検", "機器利用", "キャンセル待ち", "所内会議", "出張・外出", "その他"]) {
    assert.match(phpApi, new RegExp(`'name'=>'${category}'`));
  }
  assert.match(page, /<th>内線<\/th>/);
  assert.match(page, /name="extension"/);
  assert.doesNotMatch(page, /name="phone"|name="email"|電話番号|メールアドレス|<th>連絡先<\/th>/);
  assert.doesNotMatch(api, /group: "営業部"|group: "開発部"|group: "管理部"|phone:|email:/);
  assert.match(phpApi, /試験室/);
  assert.match(phpApi, /電波暗室/);
  assert.match(api, /japaneseHolidays/);
  assert.doesNotMatch(page, /行き先・在席|メッセージ・伝言|PresencePage|MessagesPage|MessageModal/);
  assert.doesNotMatch(page, /TodayCard|今日の予定|today-card|right-rail/);
  assert.doesNotMatch(styles, /today-card|today-list|right-rail|rail-card/);
  assert.doesNotMatch(api, /PresenceState|MessageItem|messages:/);
  assert.doesNotMatch(api, /repeatUntil|reminderMinutes|repeat\?:/);
  assert.match(phpApi, /pdo_sqlite|sqlite:/);
  assert.match(phpApi, /audit_logs/);
  assert.match(phpApi, /CSRF|csrf/i);
  assert.match(phpApi, /foreach \(\$state\['members'\] as &\$member\)/);
  assert.match(phpApi, /organization_categories_extension_v1/);
  assert.match(phpApi, /migrate_organization_categories/);
  assert.match(phpApi, /remove_repeat_reminder_v1/);
  assert.match(phpApi, /strip_schedule_automation_fields/);
  assert.match(phpApi, /if \(\$action === 'save-delta'\)/);
  assert.match(phpApi, /予定全件ではなく変更分だけを受け取り/);
  assert.match(html, /KPTC Scheduler/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
});

test("実運用に必要なVite・React・PHP構成だけを保持する", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), ["react", "react-dom"]);
  assert.deepEqual(Object.keys(packageJson.devDependencies).sort(), ["@types/node", "@types/react", "@types/react-dom", "@vitejs/plugin-react", "typescript", "vite"]);
  assert.match(packageJson.scripts.build, /build:origin/);
  assert.match(packageJson.scripts.build, /build:renkon/);
  assert.match(packageJson.scripts["build:origin"], /build:scheduler/);
  assert.match(packageJson.scripts["build:origin"], /build:calendar/);
  assert.match(packageJson.scripts["build:scheduler"], /vite\.scheduler\.config\.ts/);
  assert.match(packageJson.scripts["build:calendar"], /vite\.calendar\.config\.ts/);
  for (const unused of ["app", "public", "sakura", "vite.origin.config.ts", "vite.tamanegi.config.ts", "next.config.ts", "worker", "db", "examples"]) {
    await assert.rejects(access(new URL(unused, root)));
  }
});

test("共有用画像を同梱する", async () => {
  await access(new URL("origin/shared/public/og.png", root));
});

test("システム資料を同梱する", async () => {
  const guide = await readFile(new URL("docs/KPTC_Scheduler_Docker構築手順書.html", repositoryRoot), "utf8");
  for (const id of [...guide.matchAll(/href="#([^"]+)"/g)].map(match => match[1])) assert.ok(guide.includes('id="' + id + '"'), 'Missing section: ' + id);
  for (const file of ["compose.origin-single.yaml", "compose.origin-split.yaml", "compose.tamanegi.yaml", "docker/publisher/publisher.env.example", "docker/tamanegi/60-kptc-upload.conf.example"]) {
    assert.ok(guide.includes(file));
    await access(new URL(file, repositoryRoot));
  }
  assert.match(guide, /localからsftpへ切り替える/);
  assert.match(guide, /queued:true/);
  assert.match(guide, /JSONバックアップからSQLiteへ復元/);
  assert.match(guide, /save-delta/);
  assert.match(guide, /困ったときのQ＆A/);
  assert.match(guide, /KPTC_SESSION_COOKIE_PATH/);
  assert.match(guide, /KPTC_SESSION_COOKIE_SECURE/);
  assert.ok(guide.indexOf('<section id="changes">') > guide.indexOf('<section id="glossary">'));
  assert.match(guide, /2026-11-06/);
  assert.match(guide, /<th>用語<\/th><th>解説<\/th>/);
  await assert.rejects(access(new URL("docs/assets", repositoryRoot)));
});

test("構築手順書は単独更新・後日のCalendar追加・ID移行後の復旧を分ける", async () => {
  const guide=await readFile(new URL("docs/KPTC_Scheduler_Docker構築手順書.html",repositoryRoot),"utf8");
  const schedulerOnly=guide.slice(guide.indexOf('<h4 id="update-scheduler-only">'),guide.indexOf('<h4 id="start-calendar-later">'));
  const calendarLater=guide.slice(guide.indexOf('<h4 id="start-calendar-later">'),guide.indexOf('<h4 id="update-all-services">'));
  assert.match(schedulerOnly,/build --pull kptc-scheduler/);
  assert.match(schedulerOnly,/up -d --no-deps --force-recreate kptc-scheduler/);
  assert.match(schedulerOnly,/if ! sudo test -f \/etc\/kptc\/publisher.env/);
  assert.match(schedulerOnly,/pre-id-scheme-/);
  assert.match(schedulerOnly,/公開JSONの「再送待ち」/);
  for(const block of schedulerOnly.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g))assert.doesNotMatch(block[1],/up -d --force-recreate\s*(?:\n|$)/);
  assert.match(calendarLater,/KPTC_AVAILABILITY_DELIVERY_MODE=local/);
  assert.match(calendarLater,/up -d --no-deps --force-recreate kptc-publisher kptc-calendar/);
  assert.match(calendarLater,/monitor-availability-cli.php/);
  assert.match(guide,/ID移行後に旧イメージだけへ戻すことはしない/);
  assert.match(guide,/\/restore\/group-watcher.sqlite/);
  assert.match(guide,/2026-11-09/);
  assert.match(guide,/Q16\./);
});

test("静的カレンダーの現行デザインと公開専用JSONを提供する", async () => {
  const page = await readFile(new URL("origin/shared/app/reservations-page.tsx", root), "utf8");
  const styles = await readFile(new URL("origin/shared/app/reservations.css", root), "utf8");
  const exporter = await readFile(new URL("origin/shared/public/availability-json.php", root), "utf8");
  const contract = await readFile(new URL("origin/shared/public/availability-contract.php", root), "utf8");
  for (const label of ["電波暗室", "電磁波妨害評価装置(G-TEM)", "パルスサージシステム", "午前空きあり", "午後空きあり", "メンテナンス", "キャンセル待ち", "denki@kptc.jp/075-315-8634"]) assert.ok(page.includes(label));
  assert.match(page, /data\/public-availability\.json/);
  assert.match(page, /credentials: "omit"/);
  assert.match(page, /cache: "no-store"/);
  assert.doesNotMatch(page, /public-availability\.php/);
  assert.match(page, /const marker = nonBusinessDay \? "" : statusMarker/);
  assert.match(page, /status === "morning_available" \? "▲"/);
  assert.match(page, /status === "afternoon_available" \? "▼"/);
  assert.match(styles, /reservation-day\.reserved \{ color: #111; background: #555b60; \}/);
  assert.match(styles, /sold-out-overlay/);
  assert.match(styles, /width: min\(340px,46%\)/);
  assert.match(exporter, /\+3 months/);
  assert.match(exporter, /機器利用/);
  assert.match(exporter, /キャンセル待ち/);
  assert.match(exporter, /機器点検/);
  assert.match(contract, /flock\(\$lock, LOCK_EX\)/);
  assert.match(contract, /rename\(\$temporary, \$path\)/);
  for (const old of ["receive-availability.php", "public-availability.php", "health-availability.php"]) {
    await assert.rejects(access(new URL("origin/shared/public/" + old, root)));
  }
});

test("ログイン画面なしの一般モードとパスワード付き管理者モードを提供する", async () => {
  const [api, auth, client, manager, page] = await Promise.all([
    readFile(new URL("origin/shared/public/api.php", root), "utf8"),
    readFile(new URL("origin/shared/public/auth.php", root), "utf8"),
    readFile(new URL("origin/shared/app/lib/group-watcher-api.ts", root), "utf8"),
    readFile(new URL("origin/shared/public/manage-auth-user-cli.php", root), "utf8"),
    readFile(new URL("origin/shared/app/page.tsx", root), "utf8"),
  ]);
  const accountListSection = auth.slice(auth.indexOf("function kptc_auth_account_list"), auth.indexOf("function kptc_auth_enabled_admin_count"));
  assert.doesNotMatch(api, /authenticated'=>false|if \(\$action === 'login'\)|guest-login|if \(\$action === 'logout'\)/);
  assert.match(api, /kptc_auth_start_general_session/);
  assert.match(api, /admin-mode-enter/);
  assert.match(api, /admin-mode-exit/);
  assert.match(api, /admin-mode-password/);
  assert.match(api, /admin_mode_failed_attempts/);
  assert.match(api, /admin_mode_locked_until/);
  assert.match(api, /session_regenerate_id\(true\)/);
  assert.match(auth, /CREATE TABLE IF NOT EXISTS auth_users/);
  assert.match(auth, /password_hash/);
  assert.match(auth, /kptc_auth_placeholder_hash/);
  assert.match(auth, /admin_mode_password_hash/);
  assert.match(auth, /password_verify/);
  assert.match(auth, /PASSWORD_ARGON2ID/);
  assert.match(auth, /管理者パスワードは8〜128文字/);
  assert.match(auth, /\$user\['role'\] = !empty\(\$_SESSION\['admin_mode'\]\) \? 'admin' : 'user'/);
  assert.match(api, /require_admin\(\)/);
  assert.match(api, /KPTC_PUBLIC_AVAILABILITY_PAGE_URL/);
  assert.match(api, /最後の管理者を変更できません/);
  assert.doesNotMatch(accountListSection, /password_hash/);
  assert.doesNotMatch(page, /LoginScreen|<select autoComplete="username"|name="accountId"|name="role"/);
  assert.match(page, /name="password"/);
  assert.match(page, /name="currentPassword"/);
  assert.match(page, /name="newPassword"/);
  assert.match(page, /ユーザー・試験室を追加/);
  assert.match(page, /所属を「試験室」にすると部屋として/);
  assert.match(page, /currentRole === "admin"/);
  assert.match(page, /canEditSchedule/);
  assert.match(api, /require_schedule_editor/);
  assert.match(api, /一般ユーザーはユーザー・予定種別を変更できません/);
  assert.match(auth, /'admin','user','room'/);
  assert.match(client, /enterAdminMode/);
  assert.match(client, /exitAdminMode/);
  assert.match(client, /changeAdminPassword/);
  assert.match(manager, /set-admin-mode-password/);
  assert.doesNotMatch(manager, /SELECT \*/);
});

test("renkonの暗号化トークンがないスケジューラ要求を拒否する", async () => {
  const [entry, gate, api, auth, issuer, renkonConfig] = await Promise.all([
    readFile(new URL("origin/shared/public/scheduler-entry.php", root), "utf8"),
    readFile(new URL("origin/shared/public/portal-access.php", root), "utf8"),
    readFile(new URL("origin/shared/public/api.php", root), "utf8"),
    readFile(new URL("origin/shared/public/auth.php", root), "utf8"),
    readFile(new URL("renkon/open-scheduler.php", root), "utf8"),
    readFile(new URL("renkon/renkon-config.php", root), "utf8"),
  ]);
  assert.match(issuer, /'AES-256-CBC'/);
  assert.match(issuer, /openssl_random_pseudo_bytes/);
  assert.match(issuer, /OPENSSL_RAW_DATA/);
  assert.match(issuer, /base64_encode\(\$randomIv \. \$encryptedRaw\)/);
  assert.match(issuer, /\^\\d\{3\}\$\/D/);
  assert.match(issuer, /rawurlencode\(\$encrypted\)/);
  assert.match(renkonConfig, /KPTC_RENKON_SCHEDULER_URL/);
  assert.match(renkonConfig, /KPTC_PORTAL_TOKEN_KEY/);
  assert.match(renkonConfig, /'SecretKey'/);
  assert.match(renkonConfig, /gmdate\('Ymd'\)/);
  assert.match(renkonConfig, /hash\('sha256', \$prefix \. gmdate\('Ymd'\), true\)/);
  assert.match(gate, /AES-256-CBC/);
  assert.match(gate, /openssl_decrypt/);
  assert.ok(gate.includes('/^user_([0-9]{3})$/D'));
  assert.match(gate, /base64_decode\(\$encrypted, true\)/);
  assert.doesNotMatch(gate, /portal_token_date|kptc_portal_today|AES-128-ECB/);
  assert.match(gate, /http_response_code\(403\)/);
  assert.match(entry, /kptc_portal_authorize_token\(\$token\)/);
  assert.match(api, /kptc_portal_session_is_authorized\(\)/);
  assert.match(api, /kptc_portal_forbidden\(true\)/);
  assert.match(auth, /portal_access_granted/);
  assert.match(auth, /portal_user_id/);
});

test("JSON予定取込を管理者専用で提供し、確認と一括登録を分ける", async () => {
  const [page, api, client] = await Promise.all([
    readFile(new URL("origin/shared/app/page.tsx", root), "utf8"),
    readFile(new URL("origin/shared/public/api.php", root), "utf8"),
    readFile(new URL("origin/shared/app/lib/group-watcher-api.ts", root), "utf8"),
  ]);
  assert.match(page, /canManageUsers && <button[^\n]+JSONから予定を取込/);
  assert.match(page, /内容を確認する/);
  assert.match(page, /importSchedules\(file, "apply", preview.version/);
  assert.match(api, /\$action === 'import-schedules'/);
  assert.match(api, /kptc_import_plan\(\$items, \$record\['state'\]\)/);
  assert.match(client, /body.append\("file", file\)/);
  await access(new URL("../docs/KPTC_Scheduler_JSON予定取込.md", root));
});

test("内部用と外部用の配布ファイルを許可リストで分離する", async () => {
  const copier = await readFile(new URL("scripts/copy-distribution-files.mjs", root), "utf8");
  const internalSection = copier.slice(copier.indexOf("scheduler:"), copier.indexOf("calendar:"));
  const publicSection = copier.slice(copier.indexOf("calendar:"), copier.indexOf("renkon:"));
  assert.match(internalSection, /public\/api\.php/);
  assert.match(internalSection, /runtime-config\.php/);
  assert.match(internalSection, /public\/auth\.php/);
  assert.match(internalSection, /public\/portal-access\.php/);
  assert.match(internalSection, /public\/scheduler-entry\.php/);
  assert.match(internalSection, /public\/backup-scheduler-cli\.php/);
  assert.match(internalSection, /public\/restore-scheduler-cli\.php/);
  assert.doesNotMatch(publicSection, /scheduler-backup\.php|backup-scheduler-cli\.php|restore-scheduler-cli\.php/);
  assert.match(internalSection, /publish-availability-cli\.php/);
  assert.match(internalSection, /availability-room-config\.php/);
  assert.match(internalSection, /schedule-import\.php/);
  assert.doesNotMatch(publicSection, /\.php/);
  assert.match(copier, /directory: "origin\/Calendar"/);
  assert.doesNotMatch(publicSection, /availability-json\.php/);
  assert.doesNotMatch(publicSection, /availability-room-config\.php/);
  assert.doesNotMatch(publicSection, /api\.php|auth\.php|manage-auth-user|publish-availability-cli|group-watcher\.sqlite/);
  await access(new URL("deploy/kptc-availability-publish.timer", root));
  await access(new URL("deploy/kptc-availability-monitor.timer", root));
  const dockerIgnore = await readFile(new URL("../.dockerignore", root), "utf8");
  for (const allowed of ["!01_source/", "!01_source/publisher/", "!01_source/publisher/delivery.py"]) {
    assert.ok(dockerIgnore.split(/\r?\n/).includes(allowed), `Docker配信担当のビルド元を除外しない: ${allowed}`);
  }
});

test("renkon模擬サイトでユーザーIDから暗号化入口へのリンクを作る", async () => {
  const [html, script, config, issuer, renkonConfig, styles, copier] = await Promise.all([
    readFile(new URL("renkon/index.html", root), "utf8"),
    readFile(new URL("renkon/app.js", root), "utf8"),
    readFile(new URL("renkon/config.js", root), "utf8"),
    readFile(new URL("renkon/open-scheduler.php", root), "utf8"),
    readFile(new URL("renkon/renkon-config.php", root), "utf8"),
    readFile(new URL("renkon/styles.css", root), "utf8"),
    readFile(new URL("scripts/copy-distribution-files.mjs", root), "utf8"),
  ]);
  assert.match(html, /pattern="\[0-9\]\{3\}"/);
  assert.match(html, /inputmode="numeric"/);
  assert.match(html, /ユーザーIDを設定/);
  assert.match(html, /スケジューラーを開く/);
  assert.match(html, /試験室の空き状況を見る/);
  assert.match(html, /target="_blank"/);
  assert.match(script, /\^\\d\{3\}\$/);
  assert.match(script, /open-scheduler\.php\?user_id=/);
  assert.match(script, /calendarLink\.href = config\.calendarUrl/);
  assert.match(script, /aria-disabled/);
  assert.doesNotMatch(script, /window\.location\.assign/);
  assert.doesNotMatch(config, /schedulerUrl/);
  assert.match(config, /calendarUrl/);
  assert.match(config, /\/GW\/Calendar\//);
  assert.match(issuer, /openssl_encrypt/);
  assert.match(issuer, /Location:/);
  assert.match(renkonConfig, /\/GW\/Scheduler\//);
  assert.match(styles, /@media \(max-width: 620px\)/);
  assert.match(styles, /system-link\.is-disabled/);
  assert.match(copier, /renkon\/index\.html/);
  assert.match(copier, /renkon\/config\.js/);
  assert.match(copier, /renkon\/open-scheduler\.php/);
});

test("ビルド前とビルド後のフォルダを分離する", async () => {
  await access(new URL("01_source/package.json", repositoryRoot));
  await access(new URL("02_release/origin/Scheduler/index.php", repositoryRoot));
  await assert.rejects(access(new URL("02_release/origin/Scheduler/index.html", repositoryRoot)));
  await access(new URL("02_release/origin/Calendar/index.html", repositoryRoot));
  await assert.rejects(access(new URL("02_release/origin/Calendar/reservations.html", repositoryRoot)));
  await assert.rejects(access(new URL("02_release/origin/Scheduler/scheduler-entry.php", repositoryRoot)));
  await assert.rejects(access(new URL("02_release/tamanegi", repositoryRoot)));
  await access(new URL("02_release/renkon/index.html", repositoryRoot));
  await access(new URL("02_release/SHA256SUMS", repositoryRoot));
  for (const oldPath of ["app", "public", "sakura", "server-runtime-snapshot", "dist-internal", "dist-public"]) {
    await assert.rejects(access(new URL(oldPath, repositoryRoot)));
  }
});

test("分離配置でも公開領域外の実行設定を探索する", async () => {
  const runtimeConfig = await readFile(new URL("origin/shared/public/runtime-config.php", root), "utf8");
  assert.match(runtimeConfig, /dirname\(__DIR__, 2\)/);
  assert.match(runtimeConfig, /dirname\(__DIR__, 3\)/);
  assert.match(runtimeConfig, /GW\/config/);
});

test("同一サーバーと別サーバーの配信を切り替え、公開側にPHPを置かない", async () => {
  const [scheduler, calendar, single, split, tamanegi] = await Promise.all([
    readFile(new URL("docker/origin/Scheduler/Dockerfile", repositoryRoot), "utf8"),
    readFile(new URL("docker/origin/Calendar/Dockerfile", repositoryRoot), "utf8"),
    readFile(new URL("compose.origin-single.yaml", repositoryRoot), "utf8"),
    readFile(new URL("compose.origin-split.yaml", repositoryRoot), "utf8"),
    readFile(new URL("compose.tamanegi.yaml", repositoryRoot), "utf8"),
  ]);
  assert.match(scheduler, /FROM php:8\.4-apache-bookworm/);
  assert.match(scheduler, /extension_loaded\(\$extension\)/);
  assert.match(calendar, /FROM nginx:stable-alpine/);
  assert.doesNotMatch(calendar, /FROM php:/);
  assert.match(single, /network_mode: none/);
  assert.match(single, /kptc-calendar-static-data:\/var\/lib\/kptc-public:ro/);
  assert.match(split, /\/etc\/kptc\/sftp:\/run\/kptc-sftp:ro/);
  assert.doesNotMatch(split, /  kptc-calendar:/);
  assert.doesNotMatch(tamanegi, /kptc-scheduler-data|kptc-outbox|kptc-scheduler:/);
  assert.match(tamanegi, /\/srv\/kptc-calendar\/data:\/var\/lib\/kptc-public:ro/);
  const entries = await (await import("node:fs/promises")).readdir(new URL("02_release/origin/Calendar/", repositoryRoot));
  assert.ok(entries.every(name => !name.endsWith(".php")), "Calendar release must not contain PHP");
});
