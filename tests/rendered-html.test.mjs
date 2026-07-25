import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("Group Watcher の主要機能を提供する", async () => {
  const [page, layout, api] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/lib/group-watcher-api.ts", root), "utf8"),
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
  assert.match(page, /localStorage/);
  assert.match(page, /addMonths/);
  assert.match(api, /groupWatcherApi/);
  assert.match(api, /demoCategories/);
  assert.match(layout, /Group Watcher/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
});

test("共有用画像を同梱する", async () => {
  await access(new URL("public/og.png", root));
});
