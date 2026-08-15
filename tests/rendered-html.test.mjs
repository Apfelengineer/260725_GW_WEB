/** ソースに主要機能と公開用素材が残っていることを軽量に検証する回帰テストです。 */

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("KPTC Scheduler の主要機能を提供する", async () => {
  // 主要画面・通信層・サーバーAPIをまとめて読み、必須機能の手掛かりを検査します。
  const [page, styles, html, api, phpApi] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("sakura/index.html", root), "utf8"),
    readFile(new URL("app/lib/group-watcher-api.ts", root), "utf8"),
    readFile(new URL("public/api.php", root), "utf8"),
  ]);

  assert.match(page, /スケジュール/);
  assert.match(page, /ユーザー・予定種別/);
  assert.match(page, /予定を登録/);
  assert.match(page, /非公開にする/);
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
  assert.match(page, /予定種別を追加/);
  assert.match(page, /LoginScreen/);
  assert.match(page, /autoComplete="username"/);
  assert.match(page, /autoComplete="current-password"/);
  assert.doesNotMatch(page, /利用者を選択してログイン|デモ認証/);
  assert.match(page, /新規予定作成/);
  assert.match(page, /name="endDate"/);
  assert.match(page, /name="timePreset"/);
  const scheduleForm = page.slice(page.indexOf("function ScheduleModal"), page.indexOf("function MemberModal"));
  const userField = scheduleForm.indexOf('name="memberId"');
  const categoryField = scheduleForm.indexOf('name="category"');
  const startDateField = scheduleForm.indexOf('name="date"');
  const endDateField = scheduleForm.indexOf('name="endDate"');
  const timePresetField = scheduleForm.indexOf('name="timePreset"');
  assert.ok([userField, categoryField, startDateField, endDateField, timePresetField].every((index) => index >= 0));
  assert.ok(userField < categoryField && categoryField < startDateField && startDateField < endDateField && endDateField < timePresetField);
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
  assert.match(html, /KPTC Scheduler/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
});

test("実運用に必要なVite・React・PHP構成だけを保持する", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), ["react", "react-dom"]);
  assert.deepEqual(Object.keys(packageJson.devDependencies).sort(), ["@types/node", "@types/react", "@types/react-dom", "@vitejs/plugin-react", "typescript", "vite"]);
  assert.match(packageJson.scripts.build, /build:internal/);
  assert.match(packageJson.scripts.build, /build:public/);
  assert.match(packageJson.scripts["build:internal"], /vite\.internal\.config\.ts/);
  assert.match(packageJson.scripts["build:public"], /vite\.public\.config\.ts/);
  for (const unused of ["app/layout.tsx", "app/chatgpt-auth.ts", "vite.config.ts", "next.config.ts", "drizzle.config.ts", "postcss.config.mjs", "worker/index.ts", "db/index.ts", "examples/d1/db/schema.ts"]) {
    await assert.rejects(access(new URL(unused, root)));
  }
});

test("共有用画像を同梱する", async () => {
  await access(new URL("public/og.png", root));
});

test("システム資料を同梱する", async () => {
  await access(new URL("docs/KPTC_Scheduler_現行アプリケーション仕様書.pdf", root));
  await access(new URL("docs/KPTC_Scheduler_独立Linuxサーバー構築・移行手順書.pdf", root));
  await access(new URL("docs/KPTC_Scheduler_ファイル機能・役割一覧_関係図.pdf", root));
});

test("試験室3室の空き状況ページと署名付きJSON連携を提供する", async () => {
  // 表示記号、配色、用途別画面、署名付き3か月JSON連携を確認します。
  const [page, styles, internalVite, publicVite, phpApi, publicApi, jsonPublisher, jsonContract, publisher, receiver, retryPublisher, monitor, publicHealth] = await Promise.all([
    readFile(new URL("app/reservations-page.tsx", root), "utf8"),
    readFile(new URL("app/reservations.css", root), "utf8"),
    readFile(new URL("vite.internal.config.ts", root), "utf8"),
    readFile(new URL("vite.public.config.ts", root), "utf8"),
    readFile(new URL("public/api.php", root), "utf8"),
    readFile(new URL("public/public-availability.php", root), "utf8"),
    readFile(new URL("public/availability-json.php", root), "utf8"),
    readFile(new URL("public/availability-contract.php", root), "utf8"),
    readFile(new URL("public/availability-publisher.php", root), "utf8"),
    readFile(new URL("public/receive-availability.php", root), "utf8"),
    readFile(new URL("public/publish-availability-cli.php", root), "utf8"),
    readFile(new URL("public/monitor-availability-cli.php", root), "utf8"),
    readFile(new URL("public/health-availability.php", root), "utf8"),
  ]);
  assert.match(page, /電波暗室/);
  assert.match(page, /電磁波妨害評価装置\(G-TEM\)/);
  assert.match(page, /パルスサージシステム/);
  assert.doesNotMatch(page, /KPTC SCHEDULER \/ LAB AVAILABILITY/);
  assert.match(page, /入力インパルス試験機/);
  assert.match(page, /ご予約・お問い合わせ:xxx@yyy\/075-xxx-xxxx/);
  assert.match(page, /必ずメールか電話でお問い合わせ/);
  assert.match(page, /technology-center-logo-white\.png/);
  assert.doesNotMatch(page, /KPTC Schedulerへ戻る|予約の登録・変更/);
  assert.match(page, /メンテナンス/);
  assert.match(page, /キャンセル待ち/);
  assert.match(page, /午前空きあり/);
  assert.match(page, /午後空きあり/);
  assert.match(page, /status === "morning_available" \? "▲"/);
  assert.match(page, /status === "afternoon_available" \? "▼"/);
  assert.match(page, /status === "reserved"/);
  assert.match(page, /public-availability\.php/);
  assert.doesNotMatch(page, /groupWatcherApi|bootstrap\(|ScheduleItem|Member/);
  assert.match(page, /length: 3/);
  assert.match(styles, /sold-out-overlay/);
  assert.match(styles, /reservation-day\.saturday/);
  assert.match(styles, /reservation-day\.sunday/);
  assert.match(styles, /reservation-day\.reserved \{ color: #111; background: #555b60; \}/);
  assert.match(styles, /width: min\(340px,46%\)/);
  assert.doesNotMatch(internalVite, /reservations\.html/);
  assert.match(publicVite, /reservations\.html/);
  assert.doesNotMatch(publicVite, /sakura\/index\.html/);
  assert.match(phpApi, /room_demo_v1/);
  assert.match(phpApi, /public_availability_pending/);
  assert.match(phpApi, /kptc_publish_availability/);
  assert.match(phpApi, /public_availability_json_v1/);
  assert.match(jsonContract, /public-availability\.json/);
  assert.match(jsonPublisher, /\+3 months/);
  assert.doesNotMatch(jsonPublisher, /\+12 months/);
  assert.match(jsonPublisher, /機器利用/);
  assert.match(jsonPublisher, /キャンセル待ち/);
  assert.match(jsonPublisher, /機器点検/);
  assert.match(jsonPublisher, /sourceVersion/);
  assert.doesNotMatch(jsonPublisher, /repeatUntil|\$repeat/);
  assert.match(jsonContract, /JSON_PRETTY_PRINT/);
  assert.match(jsonContract, /rename\(\$temporary, \$path\)/);
  assert.match(jsonContract, /kptc_validate_public_availability/);
  assert.doesNotMatch(jsonPublisher, /PDO|sqlite:|CREATE TABLE|public_meta/);
  assert.doesNotMatch(jsonContract, /PDO|sqlite:|CREATE TABLE|public_meta/);
  assert.doesNotMatch(publicApi, /app_state|audit_logs|group-watcher\.sqlite/);
  assert.match(publisher, /hash_hmac\('sha256'/);
  assert.match(publisher, /X-KPTC-Timestamp/);
  assert.match(publisher, /X-KPTC-Signature/);
  assert.match(publisher, /CURLOPT_FOLLOWLOCATION => false/);
  assert.match(receiver, /hash_equals/);
  assert.match(receiver, /131072/);
  assert.match(receiver, /kptc_validate_public_availability/);
  assert.match(receiver, /kptc_compare_public_availability/);
  assert.match(retryPublisher, /PHP_SAPI !== 'cli'/);
  assert.match(retryPublisher, /public_availability_consecutive_failures/);
  assert.match(retryPublisher, /exit\(1\)/);
  assert.match(monitor, /public_availability_last_success_at/);
  assert.match(monitor, /exit\(\$healthy \? 0 : 1\)/);
  assert.match(publicHealth, /http_response_code\(\$healthy \? 200 : 503\)/);
  assert.match(publicHealth, /KPTC_PUBLIC_AVAILABILITY_STALE_SECONDS/);
  await assert.rejects(access(new URL("public/availability-store.php", root)));
  await access(new URL("public/technology-center-logo-white.png", root));
});

test("認証情報を予定データから分離して正式ログインを提供する", async () => {
  const [api, auth, client, manager, page] = await Promise.all([
    readFile(new URL("public/api.php", root), "utf8"),
    readFile(new URL("public/auth.php", root), "utf8"),
    readFile(new URL("app/lib/group-watcher-api.ts", root), "utf8"),
    readFile(new URL("public/manage-auth-user-cli.php", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
  ]);
  const loginSection = api.slice(api.indexOf("if ($action === 'login')"), api.indexOf("if ($action === 'logout')"));
  const accountListSection = auth.slice(auth.indexOf("function kptc_auth_account_list"), auth.indexOf("function kptc_auth_enabled_admin_count"));
  assert.match(api, /authenticated'=>false/);
  assert.match(api, /kptc_auth_verify/);
  assert.match(api, /session_regenerate_id\(true\)/);
  assert.doesNotMatch(loginSection, /デモ版へログイン|\$input\['memberId'\]/);
  assert.match(auth, /CREATE TABLE IF NOT EXISTS auth_users/);
  assert.match(auth, /password_hash/);
  assert.match(auth, /password_verify/);
  assert.match(auth, /auth_login_attempts/);
  assert.match(auth, />= 5/);
  assert.match(api, /require_admin\(\)/);
  assert.match(api, /最後の管理者を一般ユーザーへ変更できません/);
  assert.doesNotMatch(accountListSection, /password_hash/);
  assert.match(page, /パスワードの現在値は安全上表示できません/);
  assert.match(page, /currentRole === "admin"/);
  assert.match(client, /JSON\.stringify\(\{ username, password \}\)/);
  assert.match(manager, /--password-stdin/);
  assert.doesNotMatch(manager, /SELECT \*/);
});

test("内部用と外部用の配布ファイルを許可リストで分離する", async () => {
  const copier = await readFile(new URL("scripts/copy-distribution-files.mjs", root), "utf8");
  const internalSection = copier.slice(copier.indexOf("internal:"), copier.indexOf("public:"));
  const publicSection = copier.slice(copier.indexOf("public:"));
  assert.match(internalSection, /public\/api\.php/);
  assert.match(internalSection, /runtime-config\.php/);
  assert.match(internalSection, /public\/auth\.php/);
  assert.match(internalSection, /publish-availability-cli\.php/);
  assert.match(publicSection, /receive-availability\.php/);
  assert.match(publicSection, /public-availability\.php/);
  assert.match(publicSection, /health-availability\.php/);
  assert.match(publicSection, /availability-contract\.php/);
  assert.match(publicSection, /runtime-config\.php/);
  assert.match(publicSection, /reservations\.html/);
  assert.match(publicSection, /index\.html/);
  assert.doesNotMatch(publicSection, /availability-json\.php/);
  assert.doesNotMatch(publicSection, /api\.php|auth\.php|manage-auth-user|publish-availability-cli|group-watcher\.sqlite/);
  await access(new URL("deploy/kptc-availability-publish.timer", root));
  await access(new URL("deploy/kptc-availability-monitor.timer", root));
});

test("分離配置でも公開領域外の実行設定を探索する", async () => {
  const runtimeConfig = await readFile(new URL("public/runtime-config.php", root), "utf8");
  assert.match(runtimeConfig, /dirname\(__DIR__, 2\)/);
  assert.match(runtimeConfig, /dirname\(__DIR__, 3\)/);
  assert.match(runtimeConfig, /GW\/config/);
});
