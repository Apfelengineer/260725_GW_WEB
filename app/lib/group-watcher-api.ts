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

export type AvailabilityPublishStatus = {
  pending: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
};

export type AuthAccount = {
  id: number;
  username: string;
  memberId: string;
  role: "admin" | "user";
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

export type AuthenticatedBootstrapResponse = {
  authenticated: true;
  setupRequired: false;
  state: SharedState;
  version: number;
  currentUserId: string;
  username: string;
  role: "admin" | "user";
  csrfToken: string;
  publicAvailabilityPageUrl: string;
  authAccounts: AuthAccount[];
  audit: AuditEntry[];
  availabilityPublish: AvailabilityPublishStatus;
};

export type UnauthenticatedBootstrapResponse = {
  authenticated: false;
  setupRequired: boolean;
};

export type BootstrapResponse = AuthenticatedBootstrapResponse | UnauthenticatedBootstrapResponse;

export const groups = ["すべてのグループ", "電気通信係", "試験室"] as const;

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
 * UIからPHP APIへの通信をこのオブジェクトへ集約します。
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
  login(username: string, password: string) {
    return this.request<AuthenticatedBootstrapResponse>("login", { method: "POST", body: JSON.stringify({ username, password }) });
  },
  logout(csrfToken: string) {
    return this.request<{ ok: boolean }>("logout", { method: "POST", headers: { "X-CSRF-Token": csrfToken } });
  },
  save(state: SharedState, version: number, csrfToken: string, action: string, summary: string) {
    return this.request<AuthenticatedBootstrapResponse>("save", { method: "POST", headers: { "X-CSRF-Token": csrfToken }, body: JSON.stringify({ state, version, action, summary }) });
  },
  undo(auditId: number, version: number, csrfToken: string) {
    return this.request<AuthenticatedBootstrapResponse>("undo", { method: "POST", headers: { "X-CSRF-Token": csrfToken }, body: JSON.stringify({ auditId, version }) });
  },
  saveAuthAccount(input: { operation: "create" | "update"; id?: number; memberId?: string; username: string; role: "admin" | "user"; password: string }, csrfToken: string) {
    return this.request<AuthenticatedBootstrapResponse>("auth-account", { method: "POST", headers: { "X-CSRF-Token": csrfToken }, body: JSON.stringify(input) });
  },
};
