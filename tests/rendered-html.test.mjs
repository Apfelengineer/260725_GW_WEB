import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("Group Watcher の主要機能を提供する", async () => {
  const [page, layout, api, phpApi] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/lib/group-watcher-api.ts", root), "utf8"),
    readFile(new URL("public/api.php", root), "utf8"),
  ]);

  assert.match(page, /スケジュール/);
  assert.match(page, /行き先・在席/);
  assert.match(page, /メッセージ・伝言/);
  assert.match(page, /ユーザー・予定種別/);
  assert.match(page, /予定を登録/);
  assert.match(page, /非公開にする/);
  assert.match(page, /月曜始まり/);
  assert.match(page, /Ctrl\+C/);
  assert.match(page, /onDoubleClick/);
  assert.match(page, /onDrop/);
  assert.match(page, /予定種別を追加/);
  assert.match(page, /LoginScreen/);
  assert.match(page, /新規予定作成/);
  assert.match(page, /name="endDate"/);
  assert.match(page, /name="timePreset"/);
  assert.match(page, /午前（9:00–12:00）/);
  assert.match(page, /午後（13:00–17:00）/);
  assert.match(page, /終日/);
  assert.match(page, /リマインダー/);
  assert.match(page, /操作履歴/);
  assert.match(page, /scheduleOccursOn/);
  assert.match(page, /addMonths/);
  assert.match(api, /groupWatcherApi/);
  assert.match(api, /demoCategories/);
  assert.match(api, /試験室/);
  assert.match(api, /電波暗室/);
  assert.match(api, /japaneseHolidays/);
  assert.match(phpApi, /pdo_sqlite|sqlite:/);
  assert.match(phpApi, /audit_logs/);
  assert.match(phpApi, /CSRF|csrf/i);
  assert.match(layout, /Group Watcher/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
});

test("共有用画像を同梱する", async () => {
  await access(new URL("public/og.png", root));
});

test("試験室3室の空き状況ページを提供する", async () => {
  const [page, styles, vite, phpApi] = await Promise.all([
    readFile(new URL("app/reservations-page.tsx", root), "utf8"),
    readFile(new URL("app/reservations.css", root), "utf8"),
    readFile(new URL("vite.sakura.config.ts", root), "utf8"),
    readFile(new URL("public/api.php", root), "utf8"),
  ]);
  assert.match(page, /電波暗室/);
  assert.match(page, /電磁波妨害評価装置\(G-TEM\)/);
  assert.match(page, /パルスサージシステム/);
  assert.match(page, /入力インパルス試験機/);
  assert.match(page, /ご予約・お問い合わせ:xxx@yyy\/075-xxx-xxxx/);
  assert.match(page, /必ずメールか電話でお問い合わせ/);
  assert.match(page, /technology-center-logo-white\.png/);
  assert.doesNotMatch(page, /Group Watcherへ戻る|予約の登録・変更/);
  assert.match(page, /▲/);
  assert.match(page, /▼/);
  assert.match(page, /メンテナンス/);
  assert.match(page, /キャンセル待ち/);
  assert.match(page, /予約可（午前のみ）/);
  assert.match(page, /予約可（午後のみ）/);
  assert.match(page, /status\.morning \? "▼"/);
  assert.match(page, /status\.afternoon \? "▲"/);
  assert.match(page, /length: 3/);
  assert.match(styles, /sold-out-overlay/);
  assert.match(styles, /reservation-day\.saturday/);
  assert.match(styles, /reservation-day\.sunday/);
  assert.match(styles, /width: min\(340px,46%\)/);
  assert.match(vite, /reservations\.html/);
  assert.match(phpApi, /room_demo_v1/);
  await access(new URL("public/technology-center-logo-white.png", root));
});
