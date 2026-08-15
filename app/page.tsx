/**
 * KPTC Scheduler のメイン画面。
 * 予定表とユーザー・予定種別管理を一つの画面で制御します。
 */

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  groupWatcherApi,
  groups,
  japaneseHolidays,
  type AuditEntry,
  type AuthAccount,
  type AuthenticatedBootstrapResponse,
  type AvailabilityPublishStatus,
  type Member,
  type ScheduleCategory,
  type ScheduleItem,
  type SharedState,
} from "./lib/group-watcher-api";

type Section = "schedule" | "members";
type CalendarView = "day" | "week" | "month";
type EditorState = { mode: "create"; memberId: string; date: string } | { mode: "edit"; item: ScheduleItem };
type ClipboardState = { mode: "copy" | "cut"; items: ScheduleItem[] };
type CellTarget = { memberId: string; date: string };
type ContextMenuState = { scheduleId: string; x: number; y: number };
type CellContextMenuState = { target: CellTarget; x: number; y: number };
type ManagementTab = "members" | "categories" | "accounts" | "audit";

// 日付はタイムゾーン境界で前後しないよう、常に正午を基準に計算します。
const weekdayNames = ["日", "月", "火", "水", "木", "金", "土"];

function dateAtNoon(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function addDays(value: Date, amount: number) {
  const result = dateAtNoon(value);
  result.setDate(result.getDate() + amount);
  return result;
}

function addMonths(value: Date, amount: number) {
  const result = new Date(value.getFullYear(), value.getMonth() + amount, 1, 12);
  return result;
}

function daysBetween(from: string, to: string) {
  return Math.round((dateAtNoon(new Date(`${to}T12:00:00`)).getTime() - dateAtNoon(new Date(`${from}T12:00:00`)).getTime()) / 86400000);
}

function scheduleOccursOn(item: ScheduleItem, targetKey: string) {
  // 開始日から終了日までの範囲に、表示対象の日付が含まれるか判定します。
  const endDate = item.endDate || item.date;
  const duration = Math.max(0, daysBetween(item.date, endDate));
  const offset = daysBetween(item.date, targetKey);
  return offset >= 0 && offset <= duration;
}

function mondayOf(value: Date) {
  const result = dateAtNoon(value);
  const offset = result.getDay() === 0 ? -6 : 1 - result.getDay();
  result.setDate(result.getDate() + offset);
  return result;
}

function sameDate(a: Date, b: Date) {
  return dateKey(a) === dateKey(b);
}

function weekDates(value: Date) {
  const monday = mondayOf(value);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

function openRoomAvailability() {
  // スケジューラーを保持したまま、公開用の空き状況を独立したタブで開きます。
  const publicUrl = import.meta.env.VITE_KPTC_PUBLIC_AVAILABILITY_URL || "../calendar/?room=m6";
  window.open(publicUrl, "_blank", "noopener,noreferrer");
}

function monthGridDates(value: Date) {
  const first = new Date(value.getFullYear(), value.getMonth(), 1, 12);
  const start = mondayOf(first);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function formatLongDate(value: Date) {
  return `${value.getFullYear()}年${value.getMonth() + 1}月${value.getDate()}日（${weekdayNames[value.getDay()]}）`;
}

function formatPeriod(value: Date, view: CalendarView) {
  if (view === "day") return formatLongDate(value);
  if (view === "month") return `${value.getFullYear()}年${value.getMonth() + 1}月`;
  const dates = weekDates(value);
  const start = dates[0];
  const end = dates[6];
  if (start.getFullYear() !== end.getFullYear()) {
    return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 — ${end.getFullYear()}年${end.getMonth() + 1}月${end.getDate()}日`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 — ${end.getMonth() + 1}月${end.getDate()}日`;
  }
  return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 — ${end.getDate()}日`;
}

function categoryStyle(name: string, categories: ScheduleCategory[]) {
  const color = categories.find((category) => category.name === name)?.color ?? "#718096";
  return { "--event-color": color, "--event-bg": `${color}18` } as React.CSSProperties;
}

function scheduleTimeLabel(item: ScheduleItem) {
  if (item.timePreset === "all-day") return "終日";
  if (item.timePreset === "morning") return "午前";
  if (item.timePreset === "afternoon") return "午後";
  return item.start;
}

function SectionIcon({ symbol }: { symbol: string }) {
  return <span className="nav-symbol" aria-hidden="true">{symbol}</span>;
}

function Avatar({ member, small = false }: { member: Member; small?: boolean }) {
  return (
    <span className={`avatar ${small ? "avatar-small" : ""}`} style={{ "--avatar-color": member.color } as React.CSSProperties} aria-hidden="true">
      {member.initials}
    </span>
  );
}

function Logo() {
  return (
    <div className="brand-lockup" aria-label="KPTC Scheduler">
      <span className="brand-mark"><span>K</span></span>
      <span className="brand-copy"><b>KPTC Scheduler</b><small>チームの今を、ひと目で。</small></span>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty-state"><span aria-hidden="true">○</span><p>{children}</p></div>;
}

function LoginScreen({ serverAvailable, setupRequired, onLogin }: { serverAvailable: boolean; setupRequired: boolean; onLogin: (username: string, password: string) => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try { await onLogin(username, password); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "ログインできませんでした"); }
    finally { setSubmitting(false); }
  }
  return (
    <main className="auth-screen">
      <form className="login-card" onSubmit={submit}>
        <Logo />
        <div><span className="eyebrow">SECURE SIGN IN</span><h1>KPTC Schedulerへログイン</h1><p>管理者から発行されたユーザー名とパスワードを入力してください。</p></div>
        <label className="field"><span>ユーザー名</span><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
        <label className="field"><span>パスワード</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={!serverAvailable || !username || !password || submitting}>{submitting ? "ログイン中…" : "ログイン"}</button>
        <small>{!serverAvailable ? "内部サーバーへ接続できません。管理者へお問い合わせください。" : setupRequired ? "初期アカウントが未設定です。管理用コマンドで管理者を作成してください。" : "通信とセッションはサーバー側で安全に管理されます。"}</small>
      </form>
    </main>
  );
}

export default function Home() {
  // サーバーと共有する業務データと、画面内だけで使う選択状態を分けて保持します。
  const [section, setSection] = useState<Section>("schedule");
  const [view, setView] = useState<CalendarView>("week");
  const [calendarDate, setCalendarDate] = useState(() => dateAtNoon(new Date()));
  const [group, setGroup] = useState<string>("すべてのグループ");
  const [search, setSearch] = useState("");
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [categories, setCategories] = useState<ScheduleCategory[]>([]);
  const [scheduleEditor, setScheduleEditor] = useState<EditorState | null>(null);
  const [memberEditor, setMemberEditor] = useState<Member | "new" | null>(null);
  const [categoryEditor, setCategoryEditor] = useState<ScheduleCategory | "new" | null>(null);
  const [accountEditor, setAccountEditor] = useState<AuthAccount | "new" | null>(null);
  const [managementTab, setManagementTab] = useState<ManagementTab>("members");
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<string[]>([]);
  const [selectedCell, setSelectedCell] = useState<CellTarget | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [cellContextMenu, setCellContextMenu] = useState<CellContextMenuState | null>(null);
  const [toast, setToast] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [serverAvailable, setServerAvailable] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");
  const [currentUsername, setCurrentUsername] = useState("");
  const [currentRole, setCurrentRole] = useState<"admin" | "user">("user");
  const [authAccounts, setAuthAccounts] = useState<AuthAccount[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [availabilityPublish, setAvailabilityPublish] = useState<AvailabilityPublishStatus | null>(null);
  const [syncStatus, setSyncStatus] = useState<"saved" | "saving" | "offline">("saving");
  const versionRef = useRef(0);
  const lastSyncedRef = useRef("");
  const mutationRef = useRef({ action: "更新", summary: "共有データを更新" });
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  function applySharedState(state: SharedState) {
    setMembers(state.members);
    setSchedules(state.schedules);
    setCategories(state.categories);
  }

  function applyServerPayload(payload: AuthenticatedBootstrapResponse) {
    lastSyncedRef.current = JSON.stringify(payload.state);
    versionRef.current = payload.version;
    setCsrfToken(payload.csrfToken);
    setCurrentUserId(payload.currentUserId);
    setCurrentUsername(payload.username);
    setCurrentRole(payload.role);
    setAuthAccounts(payload.authAccounts);
    if (payload.role !== "admin") setManagementTab((tab) => tab === "accounts" ? "members" : tab);
    setAuditLogs(payload.audit);
    setAvailabilityPublish(payload.availabilityPublish);
    applySharedState(payload.state);
    setSyncStatus("saved");
  }

  function markMutation(action: string, summary: string) {
    mutationRef.current = { action, summary };
  }

  useEffect(() => {
    // 初期表示時に共有DBを読み込み、失敗時のみ同梱デモデータへ切り替えます。
    let active = true;
    groupWatcherApi.bootstrap().then((payload) => {
      if (!active) return;
      if (payload.authenticated) applyServerPayload(payload);
      else setSetupRequired(payload.setupRequired);
      setAuthReady(true);
    }).catch(() => {
      if (!active) return;
      setServerAvailable(false);
      setSyncStatus("offline");
      setAuthReady(true);
    });
    return () => { active = false; };
    // 初回だけ共有データとログイン状態を取得します。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // 変更を短時間まとめ、バージョン番号付きで直列保存して同時編集の競合を検出します。
    if (!authReady || !serverAvailable || !currentUserId || !csrfToken) return;
    const state: SharedState = { members, schedules, categories };
    const serialized = JSON.stringify(state);
    if (serialized === lastSyncedRef.current) return;
    const mutation = { ...mutationRef.current };
    const timer = window.setTimeout(() => {
      saveQueueRef.current = saveQueueRef.current.then(async () => {
        if (serialized === lastSyncedRef.current) return;
        setSyncStatus("saving");
        try {
          const payload = await groupWatcherApi.save(state, versionRef.current, csrfToken, mutation.action, mutation.summary);
          applyServerPayload(payload);
        } catch (error) {
          const conflict = (error as { status?: number; payload?: AuthenticatedBootstrapResponse }).status === 409;
          const payload = (error as { payload?: AuthenticatedBootstrapResponse }).payload;
          if (payload?.state) {
            applyServerPayload(payload);
            setToast(conflict ? "他の利用者の更新を反映しました。もう一度操作してください" : error instanceof Error ? error.message : "変更を保存できませんでした");
          } else {
            setSyncStatus("offline");
            setToast("共有保存に失敗しました。通信を確認してください");
          }
        }
      });
    }, 260);
    return () => window.clearTimeout(timer);
    // サーバー反映関数は最新状態を直列に保存します。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, categories, csrfToken, currentUserId, members, schedules, serverAvailable]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const closeMenu = () => { setContextMenu(null); setCellContextMenu(null); };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, []);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((member) => {
      const inGroup = group === "すべてのグループ" || member.group === group;
      const matches = !q || `${member.name} ${member.group}`.toLowerCase().includes(q);
      return inGroup && matches;
    });
  }, [group, members, search]);

  const currentMember = members.find((member) => member.id === currentUserId) ?? members[0];
  const selectedSchedules = selectedScheduleIds.map((id) => schedules.find((item) => item.id === id)).filter((item): item is ScheduleItem => Boolean(item));
  const selectedSchedule = selectedSchedules.length === 1 ? selectedSchedules[0] : null;

  async function login(username: string, password: string) {
    if (!serverAvailable) throw new Error("内部サーバーへ接続できません");
    const payload = await groupWatcherApi.login(username, password);
    applyServerPayload(payload);
    setToast(`${payload.state.members.find((member) => member.id === payload.currentUserId)?.name ?? "ユーザー"}としてログインしました`);
  }

  async function logout() {
    if (serverAvailable && csrfToken) {
      try { await groupWatcherApi.logout(csrfToken); } catch { /* 画面側のログアウトは継続します。 */ }
    }
    setCurrentUserId(null);
    setCurrentUsername("");
    setCurrentRole("user");
    setAuthAccounts([]);
    setSection("schedule");
  }

  async function undoAudit(entry: AuditEntry) {
    if (!entry.canUndo || !serverAvailable) return;
    if (!window.confirm(`「${entry.summary}」を取り消しますか？`)) return;
    await saveQueueRef.current;
    try {
      const payload = await groupWatcherApi.undo(entry.id, versionRef.current, csrfToken);
      applyServerPayload(payload);
      setToast("操作を取り消して以前の状態に戻しました");
    } catch (error) {
      const payload = (error as { payload?: AuthenticatedBootstrapResponse }).payload;
      if (payload?.state) applyServerPayload(payload);
      setToast("取り消せませんでした。最新状態を確認してください");
    }
  }

  function openCreateSchedule(target?: Partial<CellTarget>) {
    if (!members.length) {
      setToast("先にユーザーを登録してください");
      setSection("members");
      return;
    }
    setScheduleEditor({
      mode: "create",
      memberId: target?.memberId ?? currentMember.id,
      date: target?.date ?? dateKey(calendarDate),
    });
  }

  function saveSchedule(event: FormEvent<HTMLFormElement>) {
    // 時間帯プリセットを実時刻へ変換し、新規作成と編集を同じ形式で保存します。
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    if (!title || !scheduleEditor) return;
    const startDate = String(form.get("date"));
    const endDate = String(form.get("endDate") || startDate);
    if (endDate < startDate) {
      setToast("終了日は開始日以降にしてください");
      return;
    }
    const timePreset = String(form.get("timePreset") ?? "custom") as NonNullable<ScheduleItem["timePreset"]>;
    const presetTimes = timePreset === "all-day" ? ["00:00", "23:59"] : timePreset === "morning" ? ["09:00", "12:00"] : timePreset === "afternoon" ? ["13:00", "17:00"] : [String(form.get("start")), String(form.get("end"))];
    if (startDate === endDate && presetTimes[1] <= presetTimes[0]) {
      setToast("終了時刻は開始時刻より後にしてください");
      return;
    }
    const nextItem: ScheduleItem = {
      id: scheduleEditor.mode === "edit" ? scheduleEditor.item.id : `s-${Date.now()}`,
      memberId: String(form.get("memberId")),
      date: startDate,
      endDate,
      start: presetTimes[0],
      end: presetTimes[1],
      timePreset,
      title,
      category: String(form.get("category")),
      memo: String(form.get("memo") ?? ""),
      private: form.get("private") === "on",
    };
    markMutation(scheduleEditor.mode === "edit" ? "予定編集" : "予定作成", `${nextItem.title}（${nextItem.date}〜${nextItem.endDate}）`);
    setSchedules((items) => scheduleEditor.mode === "edit" ? items.map((item) => item.id === nextItem.id ? nextItem : item) : [...items, nextItem]);
    setSelectedScheduleIds([nextItem.id]);
    setSelectedCell({ memberId: nextItem.memberId, date: nextItem.date });
    setScheduleEditor(null);
    setToast(scheduleEditor.mode === "edit" ? "予定を更新しました" : "予定を登録しました");
  }

  function actionScheduleIds(anchorId?: string) {
    if (!anchorId) return selectedScheduleIds;
    return selectedScheduleIds.includes(anchorId) ? selectedScheduleIds : [anchorId];
  }

  function schedulesByIds(ids: string[]) {
    return ids.map((id) => schedules.find((item) => item.id === id)).filter((item): item is ScheduleItem => Boolean(item));
  }

  function sortForClipboard(items: ScheduleItem[]) {
    return [...items].sort((a, b) => a.date.localeCompare(b.date) || members.findIndex((member) => member.id === a.memberId) - members.findIndex((member) => member.id === b.memberId) || a.start.localeCompare(b.start));
  }

  function deleteSchedules(ids: string[] = selectedScheduleIds, confirmDelete = true) {
    const targetItems = schedulesByIds([...new Set(ids)]);
    if (!targetItems.length) return;
    const message = targetItems.length === 1 ? `「${targetItems[0].title}」を削除しますか？` : `選択した${targetItems.length}件の予定を削除しますか？`;
    if (confirmDelete && !window.confirm(message)) return;
    const targetIds = new Set(targetItems.map((item) => item.id));
    markMutation("予定削除", targetItems.length === 1 ? `${targetItems[0].title}を削除` : `${targetItems.length}件の予定を一括削除`);
    setSchedules((items) => items.filter((item) => !targetIds.has(item.id)));
    setSelectedScheduleIds([]);
    if (scheduleEditor?.mode === "edit" && targetIds.has(scheduleEditor.item.id)) setScheduleEditor(null);
    if (clipboard?.mode === "cut" && clipboard.items.some((item) => targetIds.has(item.id))) setClipboard(null);
    setContextMenu(null);
    setToast(targetItems.length === 1 ? "予定を削除しました" : `${targetItems.length}件の予定を削除しました`);
  }

  function selectSchedule(item: ScheduleItem, additive = false) {
    setSelectedScheduleIds((ids) => additive ? (ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id]) : [item.id]);
    setSelectedCell({ memberId: item.memberId, date: item.date });
  }

  function selectCell(target: CellTarget) {
    setSelectedScheduleIds([]);
    setSelectedCell(target);
  }

  function copySchedules(ids: string[] = selectedScheduleIds) {
    const items = sortForClipboard(schedulesByIds(ids));
    if (!items.length) return;
    setClipboard({ mode: "copy", items: items.map((item) => ({ ...item })) });
    setContextMenu(null);
    setToast(`${items.length}件の予定をコピーしました。貼り付け先の日付を選択してください`);
  }

  function cutSchedules(ids: string[] = selectedScheduleIds) {
    const items = sortForClipboard(schedulesByIds(ids));
    if (!items.length) return;
    setClipboard({ mode: "cut", items: items.map((item) => ({ ...item })) });
    setSelectedScheduleIds(items.map((item) => item.id));
    setContextMenu(null);
    setToast(`${items.length}件の予定を切り取りました。貼り付け先の日付を選択してください`);
  }

  function pasteSchedule(target: CellTarget | null = selectedCell) {
    if (!clipboard) {
      setToast("コピーまたは切り取りした予定がありません");
      return;
    }
    if (!target) {
      setToast("貼り付け先の日付欄を選択してください");
      return;
    }
    const sourceItems = clipboard.items;
    if (!sourceItems.length) return;
    const anchor = sourceItems[0];
    const anchorMemberIndex = members.findIndex((member) => member.id === anchor.memberId);
    const targetMemberIndex = members.findIndex((member) => member.id === target.memberId);
    const transformed = sourceItems.map((item, index) => {
      const dateOffset = daysBetween(anchor.date, item.date);
      const nextDate = dateKey(addDays(new Date(`${target.date}T12:00:00`), dateOffset));
      const duration = Math.max(0, daysBetween(item.date, item.endDate || item.date));
      const sourceMemberIndex = members.findIndex((member) => member.id === item.memberId);
      const shiftedMemberIndex = anchorMemberIndex >= 0 && targetMemberIndex >= 0 && sourceMemberIndex >= 0 ? Math.max(0, Math.min(members.length - 1, targetMemberIndex + sourceMemberIndex - anchorMemberIndex)) : targetMemberIndex;
      return {
        ...item,
        id: clipboard.mode === "copy" ? `s-${Date.now()}-${index}` : item.id,
        memberId: members[shiftedMemberIndex]?.id ?? target.memberId,
        date: nextDate,
        endDate: dateKey(addDays(new Date(`${nextDate}T12:00:00`), duration)),
      };
    });
    if (clipboard.mode === "copy") {
      markMutation("予定貼り付け", `${transformed.length}件の予定を${target.date}からコピー`);
      setSchedules((items) => [...items, ...transformed]);
    } else {
      const moved = new Map(transformed.map((item) => [item.id, item]));
      markMutation("予定移動", `${transformed.length}件の予定を${target.date}から移動`);
      setSchedules((items) => items.map((item) => moved.get(item.id) ?? item));
      setClipboard(null);
    }
    setSelectedScheduleIds(transformed.map((item) => item.id));
    setSelectedCell(target);
    setToast(`${transformed.length}件の予定を貼り付けました`);
  }

  function moveSchedule(id: string, target: CellTarget) {
    const source = schedules.find((item) => item.id === id);
    if (!source) return;
    const duration = Math.max(0, daysBetween(source.date, source.endDate || source.date));
    markMutation("予定移動", `${source.title}を${target.date}へ移動`);
    setSchedules((items) => items.map((item) => item.id === id ? { ...item, memberId: target.memberId, date: target.date, endDate: dateKey(addDays(new Date(`${target.date}T12:00:00`), duration)) } : item));
    setSelectedScheduleIds([id]);
    setSelectedCell(target);
    setClipboard((value) => value?.mode === "cut" && value.items.some((item) => item.id === id) ? null : value);
    setToast("予定を移動しました");
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)) return;
      if (event.key === "Escape") {
        setScheduleEditor(null);
        setMemberEditor(null);
        setCategoryEditor(null);
        setContextMenu(null);
        setCellContextMenu(null);
        setSelectedScheduleIds([]);
        return;
      }
      if (section !== "schedule" || scheduleEditor) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && selectedScheduleIds.length) {
        event.preventDefault();
        copySchedules();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        event.preventDefault();
        pasteSchedule();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedScheduleIds.length) {
        event.preventDefault();
        deleteSchedules();
      } else if (event.key === "Enter" && selectedSchedule) {
        event.preventDefault();
        setScheduleEditor({ mode: "edit", item: selectedSchedule });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  // クリップボード操作関数は最新の予定一覧と選択状態を参照するため、関連状態を依存に含めています。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipboard, scheduleEditor, schedules, section, selectedCell, selectedSchedule, selectedScheduleIds]);

  function saveMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) return;
    const existing = memberEditor !== "new" ? memberEditor : null;
    const member: Member = {
      id: existing?.id ?? `m-${Date.now()}`,
      name,
      group: String(form.get("group")) as Member["group"],
      initials: String(form.get("initials") ?? name.slice(0, 1)).trim().slice(0, 2) || name.slice(0, 1),
      color: String(form.get("color")),
      extension: String(form.get("extension") ?? ""),
    };
    markMutation(existing ? "ユーザー編集" : "ユーザー追加", member.name);
    setMembers((items) => existing ? items.map((item) => item.id === member.id ? member : item) : [...items, member]);
    setMemberEditor(null);
    setToast(existing ? "ユーザー情報を更新しました" : "ユーザーを追加しました");
  }

  function deleteMember(member: Member) {
    if (member.id === currentUserId) {
      setToast("ログイン中のユーザーは削除できません");
      return;
    }
    if (authAccounts.some((account) => account.memberId === member.id)) {
      setToast("ログインアカウントがあるユーザーは削除できません");
      return;
    }
    const count = schedules.filter((item) => item.memberId === member.id).length;
    const detail = count ? `\nこのユーザーの予定 ${count}件も削除されます。` : "";
    if (!window.confirm(`「${member.name}」を削除しますか？${detail}`)) return;
    markMutation("ユーザー削除", `${member.name}を削除`);
    setMembers((items) => items.filter((item) => item.id !== member.id));
    setSchedules((items) => items.filter((item) => item.memberId !== member.id));
    if (selectedCell?.memberId === member.id) setSelectedCell(null);
    setToast("ユーザーを削除しました");
  }

  function moveMember(member: Member, direction: -1 | 1) {
    const index = members.findIndex((item) => item.id === member.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= members.length) return;
    markMutation("ユーザー表示順変更", `${member.name}の表示順を変更`);
    setMembers((items) => {
      const reordered = [...items];
      [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
      return reordered;
    });
    setToast(`${member.name}の表示順を変更しました`);
  }

  function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) return;
    const existing = categoryEditor !== "new" ? categoryEditor : null;
    if (categories.some((category) => category.name === name && category.id !== existing?.id)) {
      setToast("同じ名前の予定種別があります");
      return;
    }
    const category: ScheduleCategory = { id: existing?.id ?? `cat-${Date.now()}`, name, color: String(form.get("color")) };
    markMutation(existing ? "予定種別編集" : "予定種別追加", category.name);
    setCategories((items) => existing ? items.map((item) => item.id === category.id ? category : item) : [...items, category]);
    if (existing && existing.name !== name) {
      setSchedules((items) => items.map((item) => item.category === existing.name ? { ...item, category: name } : item));
    }
    setCategoryEditor(null);
    setToast(existing ? "予定種別を更新しました" : "予定種別を追加しました");
  }

  function deleteCategory(category: ScheduleCategory) {
    if (categories.length === 1) {
      setToast("予定種別は1つ以上必要です");
      return;
    }
    const usedCount = schedules.filter((item) => item.category === category.name).length;
    const fallback = categories.find((item) => item.id !== category.id)!;
    const detail = usedCount ? `\n使用中の予定 ${usedCount}件は「${fallback.name}」へ変更されます。` : "";
    if (!window.confirm(`予定種別「${category.name}」を削除しますか？${detail}`)) return;
    markMutation("予定種別削除", `${category.name}を削除`);
    setCategories((items) => items.filter((item) => item.id !== category.id));
    setSchedules((items) => items.map((item) => item.category === category.name ? { ...item, category: fallback.name } : item));
    setToast("予定種別を削除しました");
  }

  function moveCategory(category: ScheduleCategory, direction: -1 | 1) {
    const index = categories.findIndex((item) => item.id === category.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= categories.length) return;
    markMutation("予定種別表示順変更", `${category.name}の表示順を変更`);
    setCategories((items) => {
      const reordered = [...items];
      [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
      return reordered;
    });
    setToast(`${category.name}の表示順を変更しました`);
  }

  async function saveAuthAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountEditor || currentRole !== "admin") return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("passwordConfirmation") ?? "");
    if (password !== confirmation) {
      setToast("確認用パスワードが一致しません");
      return;
    }
    const existing = accountEditor === "new" ? null : accountEditor;
    try {
      const payload = await groupWatcherApi.saveAuthAccount({
        operation: existing ? "update" : "create",
        id: existing?.id,
        memberId: existing?.memberId ?? String(form.get("memberId") ?? ""),
        username: String(form.get("username") ?? "").trim(),
        role: String(form.get("role") ?? "user") as "admin" | "user",
        password,
      }, csrfToken);
      applyServerPayload(payload);
      setAccountEditor(null);
      setToast(existing ? "ログイン情報を更新しました" : "ログインアカウントを作成しました");
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : "ログイン情報を保存できませんでした");
    }
  }

  function navigateCalendar(direction: -1 | 1) {
    setCalendarDate((value) => view === "day" ? addDays(value, direction) : view === "week" ? addDays(value, direction * 7) : addMonths(value, direction));
  }

  function openContextMenu(event: React.MouseEvent, item: ScheduleItem) {
    event.preventDefault();
    event.stopPropagation();
    // 複数選択中の予定を右クリックした場合は、その選択全体を操作対象として維持します。
    if (!selectedScheduleIds.includes(item.id)) selectSchedule(item);
    setCellContextMenu(null);
    setContextMenu({ scheduleId: item.id, x: Math.min(event.clientX, window.innerWidth - 180), y: Math.min(event.clientY, window.innerHeight - 150) });
  }

  function openCellContextMenu(event: React.MouseEvent, target: CellTarget) {
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    event.stopPropagation();
    selectCell(target);
    setContextMenu(null);
    setCellContextMenu({ target, x: Math.min(event.clientX, window.innerWidth - 190), y: Math.min(event.clientY, window.innerHeight - 120) });
  }

  if (!authReady) return <div className="auth-screen"><Logo /><p>共有データを読み込んでいます…</p></div>;
  if (!currentUserId) return <LoginScreen serverAvailable={serverAvailable} setupRequired={setupRequired} onLogin={login} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <nav className="main-nav" aria-label="メインメニュー">
          <button className={section === "schedule" ? "active" : ""} onClick={() => setSection("schedule")}><SectionIcon symbol="▦" /><span>スケジュール</span></button>
          <button onClick={openRoomAvailability}><SectionIcon symbol="▤" /><span>試験室予約</span></button>
          <button className={section === "members" ? "active" : ""} onClick={() => setSection("members")}><SectionIcon symbol="◎" /><span>ユーザー・設定</span></button>
        </nav>

        <div className="sidebar-section">
          <p>表示グループ</p>
          {groups.slice(1).map((item) => (
            <button key={item} className={group === item ? "group-active" : ""} onClick={() => { setGroup(item); setSection("schedule"); }}>
              <span className={`group-pip group-${item}`} />{item}<small>{members.filter((member) => member.group === item).length}</small>
            </button>
          ))}
        </div>

        {currentMember ? (
          <div className="sidebar-user"><Avatar member={currentMember} small /><span><b>{currentMember.name}</b><small>{currentRole === "admin" ? "管理者" : "一般ユーザー"}・{currentUsername}</small></span><button aria-label="ログアウト" title="ログアウト" onClick={logout}>↪</button></div>
        ) : (
          <div className="sidebar-user sidebar-empty-user"><span>ユーザー未登録</span></div>
        )}
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><Logo /></div>
          <label className="global-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="予定・メンバーを検索" aria-label="予定・メンバーを検索" /><kbd>⌘ K</kbd></label>
          <div className="topbar-actions">
            {availabilityPublish && <span className={`publish-badge ${availabilityPublish.pending ? "pending" : "ok"}`} title={availabilityPublish.lastSuccessAt ? `最終送信: ${new Date(availabilityPublish.lastSuccessAt).toLocaleString("ja-JP")}` : "送信実績なし"}>{availabilityPublish.pending ? `△ 公開JSON再送待ち${availabilityPublish.consecutiveFailures ? ` (${availabilityPublish.consecutiveFailures})` : ""}` : "● 公開JSON送信済み"}</span>}
            <span className={`sync-badge ${syncStatus}`}>{syncStatus === "saved" ? "● 共有済み" : syncStatus === "saving" ? "○ 保存中" : "△ オフライン"}</span>
            <button className="primary-button" onClick={() => openCreateSchedule()}><span>＋</span> 予定を登録</button>
          </div>
        </header>

        {section === "schedule" && (
          <SchedulePage
            view={view}
            setView={setView}
            calendarDate={calendarDate}
            onPrevious={() => navigateCalendar(-1)}
            onNext={() => navigateCalendar(1)}
            onToday={() => setCalendarDate(dateAtNoon(new Date()))}
            group={group}
            setGroup={setGroup}
            members={filteredMembers}
            allMembers={members}
            schedules={schedules}
            categories={categories}
            selectedScheduleIds={selectedScheduleIds}
            cutScheduleIds={clipboard?.mode === "cut" ? clipboard.items.map((item) => item.id) : []}
            selectedCell={selectedCell}
            onSelectCell={selectCell}
            onSelectSchedule={selectSchedule}
            onEditSchedule={(item) => setScheduleEditor({ mode: "edit", item })}
            onCreateSchedule={openCreateSchedule}
            onMoveSchedule={moveSchedule}
            onContextMenu={openContextMenu}
            onCellContextMenu={openCellContextMenu}
          />
        )}
        {section === "members" && (
          <ManagementPage
            tab={managementTab}
            setTab={setManagementTab}
            members={members}
            categories={categories}
            schedules={schedules}
            onAddMember={() => setMemberEditor("new")}
            onEditMember={setMemberEditor}
            onDeleteMember={deleteMember}
            onMoveMember={moveMember}
            onAddCategory={() => setCategoryEditor("new")}
            onEditCategory={setCategoryEditor}
            onDeleteCategory={deleteCategory}
            onMoveCategory={moveCategory}
            auditLogs={auditLogs}
            onUndo={undoAudit}
            isAdmin={currentRole === "admin"}
            authAccounts={authAccounts}
            currentUsername={currentUsername}
            onAddAccount={() => setAccountEditor("new")}
            onEditAccount={setAccountEditor}
          />
        )}
      </main>

      <nav className="mobile-nav" aria-label="モバイルメニュー">
        <button className={section === "schedule" ? "active" : ""} onClick={() => setSection("schedule")}><SectionIcon symbol="▦" /><span>予定</span></button>
        <button className="mobile-add" onClick={() => openCreateSchedule()} aria-label="予定を登録">＋</button>
        <button onClick={openRoomAvailability}><SectionIcon symbol="▤" /><span>予約</span></button>
        <button className={section === "members" ? "active" : ""} onClick={() => setSection("members")}><SectionIcon symbol="◎" /><span>設定</span></button>
      </nav>

      {scheduleEditor && <ScheduleModal editor={scheduleEditor} members={members} categories={categories} onClose={() => setScheduleEditor(null)} onSubmit={saveSchedule} onDelete={scheduleEditor.mode === "edit" ? () => deleteSchedules([scheduleEditor.item.id]) : undefined} />}
      {memberEditor && <MemberModal member={memberEditor === "new" ? null : memberEditor} onClose={() => setMemberEditor(null)} onSubmit={saveMember} />}
      {categoryEditor && <CategoryModal category={categoryEditor === "new" ? null : categoryEditor} onClose={() => setCategoryEditor(null)} onSubmit={saveCategory} />}
      {accountEditor && <AuthAccountModal account={accountEditor === "new" ? null : accountEditor} accounts={authAccounts} members={members} onClose={() => setAccountEditor(null)} onSubmit={saveAuthAccount} />}
      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()} role="menu">
          <button role="menuitem" onClick={() => copySchedules(actionScheduleIds(contextMenu.scheduleId))}><span>□</span>コピー<kbd>Ctrl+C</kbd></button>
          <button role="menuitem" onClick={() => cutSchedules(actionScheduleIds(contextMenu.scheduleId))}><span>✂</span>切り取り</button>
          <hr />
          <button className="danger" role="menuitem" onClick={() => deleteSchedules(actionScheduleIds(contextMenu.scheduleId))}><span>×</span>削除<kbd>Delete</kbd></button>
        </div>
      )}
      {cellContextMenu && (
        <div className="context-menu cell-context-menu" style={{ left: cellContextMenu.x, top: cellContextMenu.y }} onPointerDown={(event) => event.stopPropagation()} role="menu">
          <button role="menuitem" onClick={() => { openCreateSchedule(cellContextMenu.target); setCellContextMenu(null); }}><span>＋</span>新規予定作成</button>
          <button role="menuitem" disabled={!clipboard} onClick={() => { pasteSchedule(cellContextMenu.target); setCellContextMenu(null); }}><span>□</span>貼り付け<kbd>Ctrl+V</kbd></button>
        </div>
      )}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </div>
  );
}

type CalendarInteractionProps = {
  members: Member[];
  schedules: ScheduleItem[];
  categories: ScheduleCategory[];
  selectedScheduleIds: string[];
  cutScheduleIds: string[];
  selectedCell: CellTarget | null;
  onSelectCell: (target: CellTarget) => void;
  onSelectSchedule: (item: ScheduleItem, additive?: boolean) => void;
  onEditSchedule: (item: ScheduleItem) => void;
  onCreateSchedule: (target: CellTarget) => void;
  onMoveSchedule: (id: string, target: CellTarget) => void;
  onContextMenu: (event: React.MouseEvent, item: ScheduleItem) => void;
  onCellContextMenu: (event: React.MouseEvent, target: CellTarget) => void;
};

function SchedulePage({ view, setView, calendarDate, onPrevious, onNext, onToday, group, setGroup, members, allMembers, schedules, categories, ...interactions }: CalendarInteractionProps & {
  view: CalendarView;
  setView: (view: CalendarView) => void;
  calendarDate: Date;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  group: string;
  setGroup: (group: string) => void;
  allMembers: Member[];
}) {
  return (
    <div className="page-layout schedule-page">
      <section className="content-column">
        <div className="page-heading">
          <div><span className="eyebrow">SCHEDULE</span><h1>みんなの予定</h1><p>{formatPeriod(calendarDate, view)} ・ <b>{members.length}名を表示中</b></p></div>
          <button className="compact-add" onClick={() => interactions.onCreateSchedule({ memberId: allMembers[0]?.id ?? "", date: dateKey(calendarDate) })}>＋ 予定を登録</button>
        </div>

        <div className="schedule-toolbar">
          <div className="date-navigation">
            <button aria-label="前の期間" onClick={onPrevious}>‹</button>
            <button className="today-button" onClick={onToday}>{view === "day" ? "今日" : view === "week" ? "今週" : "今月"}</button>
            <button aria-label="次の期間" onClick={onNext}>›</button>
            <strong>{formatPeriod(calendarDate, view)}</strong>
          </div>
          <div className="toolbar-right">
            <label className="group-select"><span className="filter-icon" aria-hidden="true">≡</span><select value={group} onChange={(event) => setGroup(event.target.value)} aria-label="表示グループ">{groups.map((item) => <option key={item}>{item}</option>)}</select></label>
            <div className="view-switch" aria-label="カレンダー表示">
              <button className={view === "day" ? "active" : ""} onClick={() => setView("day")}>日</button>
              <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>週</button>
              <button className={view === "month" ? "active" : ""} onClick={() => setView("month")}>月</button>
            </div>
          </div>
        </div>

        {members.length === 0 ? <EmptyState>条件に一致するメンバーはいません</EmptyState> : view === "week" ? <WeekGrid calendarDate={calendarDate} {...interactions} members={members} schedules={schedules} categories={categories} /> : view === "day" ? <DayView calendarDate={calendarDate} {...interactions} members={members} schedules={schedules} categories={categories} /> : <MonthView calendarDate={calendarDate} {...interactions} members={members} schedules={schedules} categories={categories} />}

        <div className="calendar-footer">
          {categories.map((category) => <span key={category.id}><i className="legend" style={{ background: category.color }} />{category.name}</span>)}
          <span><b>◆</b> メモあり</span><span><b>鍵</b> 非公開</span>
        </div>
        <div className="shortcut-guide"><b>操作:</b> <kbd>Shift</kbd>＋クリックで複数選択 ・ 日付／別予定を通常クリックまたは <kbd>Esc</kbd> で解除 ・ 日付欄をダブルクリックで登録 ・ 右クリックでコピー／切り取り／削除 ・ <kbd>Ctrl+C</kbd> <kbd>Ctrl+V</kbd> <kbd>Delete</kbd></div>
      </section>
    </div>
  );
}

function ScheduleEventButton({ item, categories, selected, cutting, compact = false, onSelect, onEdit, onContextMenu }: {
  item: ScheduleItem;
  categories: ScheduleCategory[];
  selected: boolean;
  cutting: boolean;
  compact?: boolean;
  onSelect: (item: ScheduleItem, additive?: boolean) => void;
  onEdit: (item: ScheduleItem) => void;
  onContextMenu: (event: React.MouseEvent, item: ScheduleItem) => void;
}) {
  return (
    <button
      className={`${compact ? "month-event" : "schedule-event"} ${selected ? "selected" : ""} ${cutting ? "cutting" : ""}`}
      style={categoryStyle(item.category, categories)}
      aria-pressed={selected}
      draggable
      onDragStart={(event) => { event.dataTransfer.setData("text/group-watcher-schedule", item.id); event.dataTransfer.setData("text/plain", item.id); event.dataTransfer.effectAllowed = "move"; if (!selected) onSelect(item); }}
      onClick={(event) => { event.stopPropagation(); onSelect(item, event.shiftKey); }}
      onDoubleClick={(event) => { event.stopPropagation(); onEdit(item); }}
      onContextMenu={(event) => onContextMenu(event, item)}
      title={`${item.timePreset === "all-day" ? "終日" : `${item.start}–${item.end}`} ${item.title}（ダブルクリックで編集）`}
    >
      {compact ? <><i />{scheduleTimeLabel(item)} {item.private ? "【非】" : ""}{item.title}</> : <><time>{scheduleTimeLabel(item)}{item.endDate && item.endDate !== item.date ? "・複数日" : ""}</time><strong>{item.private ? "【非】" : ""}{item.title}</strong>{item.memo && <span className="memo-mark">◆</span>}</>}
    </button>
  );
}

function DropCell({ target, selected, className, onSelectCell, onCreateSchedule, onMoveSchedule, onCellContextMenu, children }: {
  target: CellTarget;
  selected: boolean;
  className: string;
  onSelectCell: (target: CellTarget) => void;
  onCreateSchedule: (target: CellTarget) => void;
  onMoveSchedule: (id: string, target: CellTarget) => void;
  onCellContextMenu: (event: React.MouseEvent, target: CellTarget) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${className} ${selected ? "selected-cell" : ""}`}
      onClick={() => onSelectCell(target)}
      onDoubleClick={(event) => {
        if (!(event.target as HTMLElement).closest("button")) onCreateSchedule(target);
      }}
      onContextMenu={(event) => onCellContextMenu(event, target)}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
      onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("text/group-watcher-schedule") || event.dataTransfer.getData("text/plain"); if (id) onMoveSchedule(id, target); }}
    >{children}</div>
  );
}

function WeekGrid({ calendarDate, members, schedules, categories, selectedScheduleIds, cutScheduleIds, selectedCell, onSelectCell, onSelectSchedule, onEditSchedule, onCreateSchedule, onMoveSchedule, onContextMenu, onCellContextMenu }: CalendarInteractionProps & { calendarDate: Date }) {
  const dates = weekDates(calendarDate);
  const today = dateAtNoon(new Date());
  return (
    <div className="week-grid-wrap">
      <div className="week-grid seven-days">
        <div className="week-header-row">
          <div className="corner-cell"><span>メンバー</span><small>月曜始まり</small></div>
          {dates.map((date) => { const holiday = japaneseHolidays.find((item) => item.date === dateKey(date)); return <div className={`day-header ${sameDate(date, today) ? "is-today" : ""} ${date.getDay() === 0 || date.getDay() === 6 ? "weekend" : ""} ${holiday ? "holiday" : ""}`} key={dateKey(date)}><b>{weekdayNames[date.getDay()]}</b><span>{date.getDate()}</span>{holiday && <small>{holiday.name}</small>}</div>; })}
        </div>
        {members.map((member) => (
          <div className="member-schedule-row" key={member.id}>
            <div className="member-cell"><Avatar member={member} small /><span><b>{member.name}</b><small>{member.group}</small></span></div>
            {dates.map((date) => {
              const key = dateKey(date);
              const target = { memberId: member.id, date: key };
              const holiday = japaneseHolidays.some((item) => item.date === key);
              const items = schedules.filter((item) => item.memberId === member.id && scheduleOccursOn(item, key)).sort((a, b) => a.start.localeCompare(b.start));
              return (
                <DropCell key={key} target={target} selected={selectedCell?.memberId === member.id && selectedCell.date === key} className={`schedule-cell ${sameDate(date, today) ? "is-today" : ""} ${date.getDay() === 0 || date.getDay() === 6 ? "weekend" : ""} ${holiday ? "holiday" : ""}`} onSelectCell={onSelectCell} onCreateSchedule={onCreateSchedule} onMoveSchedule={onMoveSchedule} onCellContextMenu={onCellContextMenu}>
                  {items.map((item) => <ScheduleEventButton key={item.id} item={item} categories={categories} selected={selectedScheduleIds.includes(item.id)} cutting={cutScheduleIds.includes(item.id)} onSelect={onSelectSchedule} onEdit={onEditSchedule} onContextMenu={onContextMenu} />)}
                </DropCell>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayView({ calendarDate, members, schedules, categories, selectedScheduleIds, cutScheduleIds, selectedCell, onSelectCell, onSelectSchedule, onEditSchedule, onCreateSchedule, onMoveSchedule, onContextMenu, onCellContextMenu }: CalendarInteractionProps & { calendarDate: Date }) {
  const key = dateKey(calendarDate);
  const holiday = japaneseHolidays.find((item) => item.date === key);
  return (
    <div className="day-view">
      <div className={`day-view-heading ${holiday ? "holiday" : ""}`}><span>{formatLongDate(calendarDate)}</span>{holiday && <em>{holiday.name}</em>}<small>ダブルクリック／右クリックで予定登録</small></div>
      {members.map((member) => {
        const target = { memberId: member.id, date: key };
        const items = schedules.filter((item) => item.memberId === member.id && scheduleOccursOn(item, key)).sort((a, b) => a.start.localeCompare(b.start));
        return (
          <div className="day-member" key={member.id}>
            <div className="day-member-profile"><Avatar member={member} small /><span><b>{member.name}</b><small>{member.group}</small></span></div>
            <DropCell target={target} selected={selectedCell?.memberId === member.id && selectedCell.date === key} className={`day-events ${holiday ? "holiday" : ""}`} onSelectCell={onSelectCell} onCreateSchedule={onCreateSchedule} onMoveSchedule={onMoveSchedule} onCellContextMenu={onCellContextMenu}>
              {items.length ? items.map((item) => <ScheduleEventButton key={item.id} item={item} categories={categories} selected={selectedScheduleIds.includes(item.id)} cutting={cutScheduleIds.includes(item.id)} onSelect={onSelectSchedule} onEdit={onEditSchedule} onContextMenu={onContextMenu} />) : <span className="no-plan">予定はありません</span>}
            </DropCell>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({ calendarDate, members, schedules, categories, selectedScheduleIds, cutScheduleIds, selectedCell, onSelectCell, onSelectSchedule, onEditSchedule, onCreateSchedule, onMoveSchedule, onContextMenu, onCellContextMenu }: CalendarInteractionProps & { calendarDate: Date }) {
  const dates = monthGridDates(calendarDate);
  const today = dateAtNoon(new Date());
  const visibleMemberIds = new Set(members.map((member) => member.id));
  const fallbackMemberId = selectedCell?.memberId && members.some((member) => member.id === selectedCell.memberId) ? selectedCell.memberId : members[0]?.id ?? "";
  return (
    <div className="month-view">
      <div className="month-weekdays">{["月", "火", "水", "木", "金", "土", "日"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="month-days">
        {dates.map((date) => {
          const key = dateKey(date);
          const inMonth = date.getMonth() === calendarDate.getMonth();
          const target = { memberId: fallbackMemberId, date: key };
          const items = schedules.filter((item) => scheduleOccursOn(item, key) && visibleMemberIds.has(item.memberId)).sort((a, b) => a.start.localeCompare(b.start));
          const holiday = japaneseHolidays.find((item) => item.date === key);
          return (
            <DropCell key={key} target={target} selected={selectedCell?.date === key} className={`month-day ${!inMonth ? "outside" : ""} ${sameDate(date, today) ? "today" : ""} ${date.getDay() === 0 || date.getDay() === 6 ? "weekend" : ""} ${holiday ? "holiday" : ""}`} onSelectCell={onSelectCell} onCreateSchedule={onCreateSchedule} onMoveSchedule={onMoveSchedule} onCellContextMenu={onCellContextMenu}>
              <b>{date.getDate()}</b>
              {holiday && <small className="holiday-name">{holiday.name}</small>}
              {items.slice(0, 4).map((item) => <ScheduleEventButton compact key={item.id} item={item} categories={categories} selected={selectedScheduleIds.includes(item.id)} cutting={cutScheduleIds.includes(item.id)} onSelect={onSelectSchedule} onEdit={onEditSchedule} onContextMenu={onContextMenu} />)}
              {items.length > 4 && <span className="more-events">ほか {items.length - 4}件</span>}
            </DropCell>
          );
        })}
      </div>
    </div>
  );
}

function ManagementPage({ tab, setTab, members, categories, schedules, auditLogs, onUndo, onAddMember, onEditMember, onDeleteMember, onMoveMember, onAddCategory, onEditCategory, onDeleteCategory, onMoveCategory, isAdmin, authAccounts, currentUsername, onAddAccount, onEditAccount }: {
  tab: ManagementTab;
  setTab: (tab: ManagementTab) => void;
  members: Member[];
  categories: ScheduleCategory[];
  schedules: ScheduleItem[];
  auditLogs: AuditEntry[];
  onUndo: (entry: AuditEntry) => void;
  onAddMember: () => void;
  onEditMember: (member: Member) => void;
  onDeleteMember: (member: Member) => void;
  onMoveMember: (member: Member, direction: -1 | 1) => void;
  onAddCategory: () => void;
  onEditCategory: (category: ScheduleCategory) => void;
  onDeleteCategory: (category: ScheduleCategory) => void;
  onMoveCategory: (category: ScheduleCategory, direction: -1 | 1) => void;
  isAdmin: boolean;
  authAccounts: AuthAccount[];
  currentUsername: string;
  onAddAccount: () => void;
  onEditAccount: (account: AuthAccount) => void;
}) {
  const addAction = tab === "members" ? onAddMember : tab === "categories" ? onAddCategory : tab === "accounts" ? onAddAccount : null;
  return (
    <div className="standard-page management-page">
      <div className="page-heading"><div><span className="eyebrow">MANAGEMENT</span><h1>ユーザー・予定種別・ログイン管理</h1><p>表示ユーザー、予定種別、ログイン権限と操作履歴を管理します</p></div>{addAction && <button className="primary-button" onClick={addAction}>＋ {tab === "members" ? "ユーザーを追加" : tab === "categories" ? "予定種別を追加" : "ログインを追加"}</button>}</div>
      <div className="management-tabs"><button className={tab === "members" ? "active" : ""} onClick={() => setTab("members")}>ユーザー <span>{members.length}</span></button><button className={tab === "categories" ? "active" : ""} onClick={() => setTab("categories")}>予定種別 <span>{categories.length}</span></button>{isAdmin && <button className={tab === "accounts" ? "active" : ""} onClick={() => setTab("accounts")}>ログイン <span>{authAccounts.length}</span></button>}<button className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}>操作履歴 <span>{auditLogs.length}</span></button></div>
      {tab === "members" ? (
        <div className="members-table-wrap"><table className="members-table"><thead><tr><th>表示順</th><th>ユーザー</th><th>所属</th><th>内線</th><th>操作</th></tr></thead><tbody>{members.map((member, index) => <tr key={member.id}><td><div className="order-control"><b>{index + 1}</b><button type="button" aria-label={`${member.name}を上へ`} disabled={index === 0} onClick={() => onMoveMember(member, -1)}>↑</button><button type="button" aria-label={`${member.name}を下へ`} disabled={index === members.length - 1} onClick={() => onMoveMember(member, 1)}>↓</button></div></td><td><Avatar member={member} small /><b>{member.name}</b></td><td>{member.group}</td><td><span>{member.extension || "—"}</span></td><td className="table-actions"><button onClick={() => onEditMember(member)}>編集</button><button className="danger" onClick={() => onDeleteMember(member)}>削除</button></td></tr>)}</tbody></table></div>
      ) : tab === "categories" ? (
        <div className="category-management-list">{categories.map((category, index) => <article key={category.id}><div className="order-control category-order"><b>{index + 1}</b><button type="button" aria-label={`${category.name}を上へ`} disabled={index === 0} onClick={() => onMoveCategory(category, -1)}>↑</button><button type="button" aria-label={`${category.name}を下へ`} disabled={index === categories.length - 1} onClick={() => onMoveCategory(category, 1)}>↓</button></div><span className="category-swatch" style={{ background: category.color }} /><div><h2>{category.name}</h2><p>使用中の予定 {schedules.filter((item) => item.category === category.name).length}件</p></div><button onClick={() => onEditCategory(category)}>編集</button><button className="danger" onClick={() => onDeleteCategory(category)}>削除</button></article>)}</div>
      ) : tab === "accounts" && isAdmin ? (
        <div className="auth-account-panel"><p className="security-note">パスワードの現在値は安全上表示できません。必要な場合は「編集」から新しいパスワードへ再設定してください。</p><div className="members-table-wrap"><table className="members-table auth-accounts-table"><thead><tr><th>スケジューラーユーザー</th><th>ユーザーID</th><th>権限</th><th>最終ログイン</th><th>操作</th></tr></thead><tbody>{authAccounts.map((account) => { const member = members.find((item) => item.id === account.memberId); return <tr key={account.id}><td><b>{member?.name ?? "削除済みユーザー"}</b></td><td><code>{account.username}</code>{account.username === currentUsername && <small className="current-account-label">ログイン中</small>}</td><td><span className={`role-badge ${account.role}`}>{account.role === "admin" ? "管理者" : "一般ユーザー"}</span></td><td>{account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString("ja-JP") : "未ログイン"}</td><td className="table-actions"><button onClick={() => onEditAccount(account)}>編集</button></td></tr>; })}</tbody></table></div></div>
      ) : (
        <div className="audit-list">{auditLogs.length ? auditLogs.map((entry) => <article key={entry.id}><span className="audit-icon">↺</span><div><b>{entry.summary}</b><small>{entry.actorName} ・ {new Date(entry.createdAt).toLocaleString("ja-JP")}</small></div><em>{entry.action}</em>{entry.canUndo && <button onClick={() => onUndo(entry)}>取り消す</button>}</article>) : <EmptyState>操作履歴はまだありません</EmptyState>}</div>
      )}
    </div>
  );
}

function ModalShell({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><button onClick={onClose} aria-label="閉じる">×</button></header>{children}</section></div>;
}

function ScheduleModal({ editor, members, categories, onClose, onSubmit, onDelete }: { editor: EditorState; members: Member[]; categories: ScheduleCategory[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onDelete?: () => void }) {
  const item = editor.mode === "edit" ? editor.item : null;
  const initialPreset: NonNullable<ScheduleItem["timePreset"]> = item?.timePreset ?? (item?.start === "00:00" && item?.end === "23:59" ? "all-day" : item?.start === "09:00" && item?.end === "12:00" ? "morning" : item?.start === "13:00" && item?.end === "17:00" ? "afternoon" : "custom");
  const [timePreset, setTimePreset] = useState(initialPreset);
  const [startTime, setStartTime] = useState(item?.start ?? "13:00");
  const [endTime, setEndTime] = useState(item?.end ?? "14:00");

  function changeTimePreset(value: NonNullable<ScheduleItem["timePreset"]>) {
    setTimePreset(value);
    if (value === "all-day") { setStartTime("00:00"); setEndTime("23:59"); }
    if (value === "morning") { setStartTime("09:00"); setEndTime("12:00"); }
    if (value === "afternoon") { setStartTime("13:00"); setEndTime("17:00"); }
  }
  return (
    <ModalShell title={item ? "予定を編集" : "予定を登録"} eyebrow={item ? "EDIT SCHEDULE" : "NEW SCHEDULE"} onClose={onClose}>
      <form onSubmit={onSubmit} className="modal-form">
        <label className="field full"><span>件名</span><input name="title" autoFocus placeholder="例：プロジェクト定例会" defaultValue={item?.title ?? ""} required /></label>
        <label className="field full"><span>ユーザー</span><select name="memberId" defaultValue={item?.memberId ?? (editor.mode === "create" ? editor.memberId : members[0]?.id)}>{members.map((member) => <option value={member.id} key={member.id}>{member.name}（{member.group}）</option>)}</select><small className="field-note">誰の予定でも変更できます</small></label>
        <label className="field full"><span>予定種別</span><select name="category" defaultValue={item?.category ?? categories[0]?.name}>{categories.map((category) => <option key={category.id}>{category.name}</option>)}</select></label>
        <label className="field"><span>開始日</span><input name="date" type="date" defaultValue={item?.date ?? (editor.mode === "create" ? editor.date : "")} required /></label>
        <label className="field"><span>終了日</span><input name="endDate" type="date" defaultValue={item?.endDate ?? item?.date ?? (editor.mode === "create" ? editor.date : "")} required /></label>
        <label className="field full"><span>時間帯</span><select name="timePreset" value={timePreset} onChange={(event) => changeTimePreset(event.target.value as NonNullable<ScheduleItem["timePreset"]>)}><option value="custom">時間を指定</option><option value="all-day">終日</option><option value="morning">午前（9:00–12:00）</option><option value="afternoon">午後（13:00–17:00）</option></select><small className="field-note">午前・午後・終日を選ぶと時刻が自動入力されます</small></label>
        <label className="field"><span>開始</span><input name="start" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} readOnly={timePreset !== "custom"} required /></label>
        <label className="field"><span>終了</span><input name="end" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} readOnly={timePreset !== "custom"} required /></label>
        <label className="field full"><span>メモ</span><textarea name="memo" placeholder="場所、持ち物、共有事項など" rows={3} defaultValue={item?.memo ?? ""} /></label>
        <label className="check-field full"><input name="private" type="checkbox" defaultChecked={item?.private ?? false} /><span><b>非公開にする</b><small>他のメンバーには予定があることだけを表示します</small></span></label>
        <footer>{onDelete && <button type="button" className="secondary-button danger-button" onClick={onDelete}>削除</button>}<span className="footer-spacer" /><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button className="primary-button" type="submit">{item ? "変更を保存" : "予定を登録"}</button></footer>
      </form>
    </ModalShell>
  );
}

function MemberModal({ member, onClose, onSubmit }: { member: Member | null; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <ModalShell title={member ? "ユーザーを編集" : "ユーザーを追加"} eyebrow="USER MANAGEMENT" onClose={onClose}>
      <form onSubmit={onSubmit} className="modal-form">
        <label className="field full"><span>氏名</span><input name="name" autoFocus defaultValue={member?.name ?? ""} required /></label>
        <label className="field"><span>表示文字</span><input name="initials" maxLength={2} defaultValue={member?.initials ?? ""} placeholder="例：佐" /></label>
        <label className="field color-field"><span>表示色</span><input name="color" type="color" defaultValue={member?.color ?? "#268b7d"} /></label>
        <label className="field"><span>所属</span><select name="group" defaultValue={member?.group ?? "電気通信係"}>{groups.slice(1).map((groupName) => <option key={groupName}>{groupName}</option>)}</select></label>
        <label className="field"><span>内線</span><input name="extension" type="text" inputMode="tel" defaultValue={member?.extension ?? ""} /></label>
        <footer><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button className="primary-button" type="submit">{member ? "変更を保存" : "ユーザーを追加"}</button></footer>
      </form>
    </ModalShell>
  );
}

function CategoryModal({ category, onClose, onSubmit }: { category: ScheduleCategory | null; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <ModalShell title={category ? "予定種別を編集" : "予定種別を追加"} eyebrow="CATEGORY MANAGEMENT" onClose={onClose}>
      <form onSubmit={onSubmit} className="modal-form compact-form">
        <label className="field full"><span>予定種別名</span><input name="name" autoFocus defaultValue={category?.name ?? ""} placeholder="例：研修" required /></label>
        <label className="field color-field full"><span>表示色</span><input name="color" type="color" defaultValue={category?.color ?? "#5086bd"} /></label>
        <footer><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button className="primary-button" type="submit">{category ? "変更を保存" : "予定種別を追加"}</button></footer>
      </form>
    </ModalShell>
  );
}

function AuthAccountModal({ account, accounts, members, onClose, onSubmit }: { account: AuthAccount | null; accounts: AuthAccount[]; members: Member[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [password, setPassword] = useState("");
  const availableMembers = account ? members : members.filter((member) => !accounts.some((item) => item.memberId === member.id));
  const linkedMember = account ? members.find((member) => member.id === account.memberId) : null;
  return (
    <ModalShell title={account ? "ログイン情報を編集" : "ログインアカウントを追加"} eyebrow="AUTH ACCOUNT" onClose={onClose}>
      <form onSubmit={onSubmit} className="modal-form compact-form">
        {account ? <label className="field full"><span>スケジューラーユーザー</span><input value={linkedMember?.name ?? "削除済みユーザー"} readOnly /></label> : <label className="field full"><span>スケジューラーユーザー</span><select name="memberId" required defaultValue=""><option value="" disabled>ユーザーを選択</option>{availableMembers.map((member) => <option value={member.id} key={member.id}>{member.name}（{member.group}）</option>)}</select><small className="field-note">ログインアカウント未設定のユーザーだけを表示します</small></label>}
        <label className="field full"><span>ユーザーID</span><input name="username" autoFocus={!account} minLength={3} maxLength={64} pattern="[A-Za-z0-9][A-Za-z0-9._@-]{2,63}" autoCapitalize="none" autoComplete="off" defaultValue={account?.username ?? ""} required /><small className="field-note">3〜64文字の半角英数字と . _ @ - を使用できます</small></label>
        <label className="field full"><span>権限</span><select name="role" defaultValue={account?.role ?? "user"}><option value="user">一般ユーザー</option><option value="admin">管理者</option></select></label>
        <label className="field full"><span>{account ? "新しいパスワード（変更する場合のみ）" : "パスワード"}</span><input name="password" type="password" minLength={12} maxLength={256} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required={!account} /><small className="field-note">12文字以上。現在のパスワードは表示されません</small></label>
        <label className="field full"><span>パスワード（確認）</span><input name="passwordConfirmation" type="password" minLength={12} maxLength={256} autoComplete="new-password" required={Boolean(password)} /></label>
        <footer><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button className="primary-button" type="submit">{account ? "変更を保存" : "アカウントを作成"}</button></footer>
      </form>
    </ModalShell>
  );
}
