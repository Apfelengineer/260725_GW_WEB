/**
 * 画面と共有APIの間で使用するデータ型、初期デモデータ、通信処理をまとめた層です。
 * 本番APIへ切り替える場合も、画面側はこの公開インターフェースを利用します。
 */

export type Member = {
  id: string;
  name: string;
  group: string;
  initials: string;
  color: string;
  extension: string;
};

export type ScheduleItem = {
  id: string;
  memberId: string;
  date: string;
  endDate?: string;
  start: string;
  end: string;
  timePreset?: "custom" | "all-day" | "morning" | "afternoon";
  title: string;
  category: string;
  private?: boolean;
  memo?: string;
  repeat?: "none" | "daily" | "weekly" | "monthly";
  repeatUntil?: string;
  reminderMinutes?: number;
};

export type ScheduleCategory = {
  id: string;
  name: string;
  color: string;
};

export type Holiday = { date: string; name: string };

export type SharedState = {
  members: Member[];
  schedules: ScheduleItem[];
  categories: ScheduleCategory[];
};

export type AuditEntry = {
  id: number;
  actorId: string;
  actorName: string;
  action: string;
  summary: string;
  createdAt: string;
  canUndo: boolean;
};

export type BootstrapResponse = {
  state: SharedState;
  version: number;
  currentUserId: string | null;
  csrfToken: string;
  audit: AuditEntry[];
};

export const groups = ["すべてのグループ", "電気通信係", "試験室"] as const;

// サーバーへ接続できない場合でも画面確認できるよう、同じ型のデモデータを同梱します。
export const demoCategories: ScheduleCategory[] = [
  { id: "cat-vacation", name: "休暇", color: "#9a83c8" },
  { id: "cat-maintenance", name: "機器点検", color: "#687783" },
  { id: "cat-equipment-use", name: "機器利用", color: "#209885" },
  { id: "cat-waiting", name: "キャンセル待ち", color: "#d09839" },
  { id: "cat-internal-meeting", name: "所内会議", color: "#5086bd" },
  { id: "cat-outside", name: "出張・外出", color: "#e87556" },
  { id: "cat-other", name: "その他", color: "#718096" },
];

export const demoMembers: Member[] = [
  {
    id: "m1",
    name: "佐藤 美咲",
    group: "電気通信係",
    initials: "佐",
    color: "#e96f51",
    extension: "03-1234-5678",
  },
  {
    id: "m2",
    name: "鈴木 健太",
    group: "電気通信係",
    initials: "鈴",
    color: "#3c82c8",
    extension: "03-1234-5681",
  },
  {
    id: "m3",
    name: "高橋 直子",
    group: "電気通信係",
    initials: "高",
    color: "#8a67c8",
    extension: "03-1234-5686",
  },
  {
    id: "m4",
    name: "田中 悠真",
    group: "電気通信係",
    initials: "田",
    color: "#268b7d",
    extension: "03-1234-5688",
  },
  {
    id: "m5",
    name: "伊藤 由紀",
    group: "電気通信係",
    initials: "伊",
    color: "#d18b2f",
    extension: "03-1234-5692",
  },
  { id: "m6", name: "電波暗室", group: "試験室", initials: "電波", color: "#536f91", extension: "03-1234-5701" },
  { id: "m7", name: "電材室", group: "試験室", initials: "電材", color: "#417e72", extension: "03-1234-5702" },
  { id: "m8", name: "電子情報研究室", group: "試験室", initials: "電子", color: "#765f9a", extension: "03-1234-5703" },
];

export const demoSchedules: ScheduleItem[] = [
  { id: "s1", memberId: "m1", date: "2026-07-20", start: "09:30", end: "10:30", title: "営業定例", category: "所内会議", memo: "週次の案件レビュー" },
  { id: "s2", memberId: "m1", date: "2026-07-21", start: "13:00", end: "15:00", title: "山田商事 訪問", category: "出張・外出" },
  { id: "s3", memberId: "m1", date: "2026-07-23", start: "11:00", end: "12:00", title: "提案書レビュー", category: "その他" },
  { id: "s4", memberId: "m2", date: "2026-07-20", start: "10:00", end: "11:00", title: "新規案件MTG", category: "所内会議" },
  { id: "s5", memberId: "m2", date: "2026-07-22", start: "14:30", end: "16:30", title: "江東物流 訪問", category: "出張・外出", memo: "見積書を持参" },
  { id: "s6", memberId: "m2", date: "2026-07-24", start: "09:00", end: "11:30", title: "月次レポート", category: "その他" },
  { id: "s7", memberId: "m3", date: "2026-07-20", start: "13:00", end: "14:00", title: "開発スプリント計画", category: "所内会議" },
  { id: "s8", memberId: "m3", date: "2026-07-21", start: "10:00", end: "12:00", title: "API設計", category: "その他", memo: "認証方式を確定" },
  { id: "s9", memberId: "m3", date: "2026-07-23", start: "15:00", end: "16:00", title: "リリース判定", category: "所内会議", private: true },
  { id: "s10", memberId: "m4", date: "2026-07-21", start: "09:30", end: "11:30", title: "画面実装", category: "その他" },
  { id: "s11", memberId: "m4", date: "2026-07-22", start: "13:30", end: "14:30", title: "コードレビュー", category: "所内会議" },
  { id: "s12", memberId: "m4", date: "2026-07-24", start: "10:00", end: "12:00", title: "データ移行検証", category: "その他" },
  { id: "s13", memberId: "m5", date: "2026-07-21", start: "09:00", end: "18:00", title: "有給休暇", category: "休暇", private: true },
  { id: "s14", memberId: "m5", date: "2026-07-23", start: "10:00", end: "11:00", title: "採用面談", category: "所内会議" },
  { id: "room-demo-m6-july", memberId: "m6", date: "2026-07-01", endDate: "2026-07-01", start: "00:00", end: "23:59", timePreset: "all-day", title: "電波暗室 予約済み", category: "機器利用", repeat: "daily", repeatUntil: "2026-07-31" },
  { id: "room-demo-m7-1", memberId: "m7", date: "2026-07-27", start: "09:00", end: "12:00", timePreset: "morning", title: "材料評価", category: "機器利用" },
  { id: "room-demo-m7-2", memberId: "m7", date: "2026-07-28", start: "13:00", end: "17:00", timePreset: "afternoon", title: "耐久試験", category: "機器利用" },
  { id: "room-demo-m7-3", memberId: "m7", date: "2026-07-29", start: "09:00", end: "17:00", title: "終日試験", category: "機器利用" },
  { id: "room-demo-m7-4", memberId: "m7", date: "2026-07-30", start: "09:00", end: "17:00", title: "設備点検", category: "機器点検" },
  { id: "room-demo-m7-5", memberId: "m7", date: "2026-08-05", start: "09:00", end: "12:00", timePreset: "morning", title: "部材試験", category: "機器利用" },
  { id: "room-demo-m7-6", memberId: "m7", date: "2026-08-12", start: "09:00", end: "17:00", title: "定期メンテナンス", category: "機器点検" },
  { id: "room-demo-m8-1", memberId: "m8", date: "2026-07-27", start: "13:00", end: "17:00", timePreset: "afternoon", title: "通信評価", category: "機器利用" },
  { id: "room-demo-m8-2", memberId: "m8", date: "2026-08-03", start: "09:00", end: "17:00", title: "情報機器試験", category: "機器利用" },
  { id: "room-demo-m8-3", memberId: "m8", date: "2026-08-18", start: "09:00", end: "17:00", title: "設備校正", category: "機器点検" },
  { id: "room-demo-m8-4", memberId: "m8", date: "2026-09-07", start: "09:00", end: "12:00", timePreset: "morning", title: "EMC事前評価", category: "機器利用" },
  { id: "room-demo-m8-5", memberId: "m8", date: "2026-09-15", start: "13:00", end: "17:00", timePreset: "afternoon", title: "電子情報評価", category: "機器利用" },
];

export const japaneseHolidays: Holiday[] = [
  { date: "2026-01-01", name: "元日" }, { date: "2026-01-12", name: "成人の日" },
  { date: "2026-02-11", name: "建国記念の日" }, { date: "2026-02-23", name: "天皇誕生日" },
  { date: "2026-03-20", name: "春分の日" }, { date: "2026-04-29", name: "昭和の日" },
  { date: "2026-05-03", name: "憲法記念日" }, { date: "2026-05-04", name: "みどりの日" },
  { date: "2026-05-05", name: "こどもの日" }, { date: "2026-05-06", name: "休日" },
  { date: "2026-07-20", name: "海の日" }, { date: "2026-08-11", name: "山の日" },
  { date: "2026-09-21", name: "敬老の日" }, { date: "2026-09-22", name: "休日" },
  { date: "2026-09-23", name: "秋分の日" }, { date: "2026-10-12", name: "スポーツの日" },
  { date: "2026-11-03", name: "文化の日" }, { date: "2026-11-23", name: "勤労感謝の日" },
  { date: "2027-01-01", name: "元日" }, { date: "2027-01-11", name: "成人の日" },
  { date: "2027-02-11", name: "建国記念の日" }, { date: "2027-02-23", name: "天皇誕生日" },
  { date: "2027-03-21", name: "春分の日" }, { date: "2027-03-22", name: "休日" },
  { date: "2027-04-29", name: "昭和の日" }, { date: "2027-05-03", name: "憲法記念日" },
  { date: "2027-05-04", name: "みどりの日" }, { date: "2027-05-05", name: "こどもの日" },
  { date: "2027-07-19", name: "海の日" }, { date: "2027-08-11", name: "山の日" },
  { date: "2027-09-20", name: "敬老の日" }, { date: "2027-09-23", name: "秋分の日" },
  { date: "2027-10-11", name: "スポーツの日" }, { date: "2027-11-03", name: "文化の日" },
  { date: "2027-11-23", name: "勤労感謝の日" },
];

/**
 * API 接続の差し替え口です。
 * 実API受領後は、UIを変更せずこのオブジェクトの実装を HTTP 通信へ置き換えます。
 */
// PHP APIの各操作を集約し、HTTPエラー時は状態コードと最新データを呼び出し元へ渡します。
export const groupWatcherApi = {
  async request<T>(action: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`./api.php?action=${encodeURIComponent(action)}`, {
      credentials: "same-origin",
      ...options,
      headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    });
    const payload = await response.json();
    if (!response.ok) throw Object.assign(new Error(payload.error || "通信に失敗しました"), { status: response.status, payload });
    return payload as T;
  },
  bootstrap() {
    return this.request<BootstrapResponse>("bootstrap");
  },
  login(memberId: string) {
    return this.request<BootstrapResponse>("login", { method: "POST", body: JSON.stringify({ memberId }) });
  },
  logout(csrfToken: string) {
    return this.request<{ ok: boolean }>("logout", { method: "POST", headers: { "X-CSRF-Token": csrfToken } });
  },
  save(state: SharedState, version: number, csrfToken: string, action: string, summary: string) {
    return this.request<BootstrapResponse>("save", { method: "POST", headers: { "X-CSRF-Token": csrfToken }, body: JSON.stringify({ state, version, action, summary }) });
  },
  undo(auditId: number, version: number, csrfToken: string) {
    return this.request<BootstrapResponse>("undo", { method: "POST", headers: { "X-CSRF-Token": csrfToken }, body: JSON.stringify({ auditId, version }) });
  },
};
