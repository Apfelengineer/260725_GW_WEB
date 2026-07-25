"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  groupWatcherApi,
  demoCategories,
  demoMembers,
  demoMessages,
  demoSchedules,
  groups,
  japaneseHolidays,
  type AuditEntry,
  type BootstrapResponse,
  type Member,
  type MessageItem,
  type PresenceState,
  type ScheduleCategory,
  type ScheduleItem,
  type SharedState,
} from "./lib/group-watcher-api";

type Section = "schedule" | "presence" | "messages" | "members";
type CalendarView = "day" | "week" | "month";
type EditorState = { mode: "create"; memberId: string; date: string } | { mode: "edit"; item: ScheduleItem };
type ClipboardState = { mode: "copy" | "cut"; item: ScheduleItem };
type CellTarget = { memberId: string; date: string };
type ContextMenuState = { scheduleId: string; x: number; y: number };
type CellContextMenuState = { target: CellTarget; x: number; y: number };
type ManagementTab = "members" | "categories" | "audit";

const weekdayNames = ["日", "月", "火", "水", "木", "金", "土"];
const presenceOptions: PresenceState[] = ["在席", "外出", "会議中", "離席", "休暇"];

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
  const endDate = item.endDate || item.date;
  const duration = Math.max(0, daysBetween(item.date, endDate));
  const offset = daysBetween(item.date, targetKey);
  if (offset < 0) return false;
  const repeat = item.repeat ?? "none";
  if (repeat === "none") return offset <= duration;
  const repeatUntil = item.repeatUntil || item.date;
  if (targetKey > dateKey(addDays(new Date(`${repeatUntil}T12:00:00`), duration))) return false;
  if (repeat === "daily") return true;
  if (repeat === "weekly") return offset % 7 <= duration;
  const start = new Date(`${item.date}T12:00:00`);
  const target = new Date(`${targetKey}T12:00:00`);
  for (let cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12); cursor <= target; cursor = addMonths(cursor, 1)) {
    const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12).getDate();
    const occurrence = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(start.getDate(), lastDay), 12);
    if (dateKey(occurrence) > repeatUntil) break;
    if (targetKey >= dateKey(occurrence) && targetKey <= dateKey(addDays(occurrence, duration))) return true;
  }
  return false;
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

function StatusDot({ status }: { status: PresenceState }) {
  return <span className={`status-dot status-${status}`} aria-hidden="true" />;
}

function Logo() {
  return (
    <div className="brand-lockup" aria-label="Group Watcher">
      <span className="brand-mark"><span>G</span></span>
      <span className="brand-copy"><b>Group Watcher</b><small>チームの今を、ひと目で。</small></span>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty-state"><span aria-hidden="true">○</span><p>{children}</p></div>;
}

function LoginScreen({ members, serverAvailable, onLogin }: { members: Member[]; serverAvailable: boolean; onLogin: (memberId: string) => Promise<void> }) {
  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  return (
    <main className="auth-screen">
      <section className="login-card">
        <Logo />
        <div><span className="eyebrow">TEAM SIGN IN</span><h1>利用者を選択してログイン</h1><p>変更内容は共有保存され、操作履歴に利用者名が記録されます。</p></div>
        <label className="field"><span>利用者</span><select value={memberId} onChange={(event) => setMemberId(event.target.value)}>{members.map((member) => <option key={member.id} value={member.id}>{member.name}（{member.group}）</option>)}</select></label>
        <button className="primary-button" disabled={!memberId || submitting} onClick={async () => { setSubmitting(true); await onLogin(memberId); setSubmitting(false); }}>{submitting ? "ログイン中…" : "ログイン"}</button>
        <small>{serverAvailable ? "デモ認証：パスワードはAPI仕様確定後に接続します" : "共有サーバーへ接続できないため、端末内デモとして起動します"}</small>
      </section>
    </main>
  );
}

export default function Home() {
  const [section, setSection] = useState<Section>("schedule");
  const [view, setView] = useState<CalendarView>("week");
  const [calendarDate, setCalendarDate] = useState(() => new Date(2026, 6, 24, 12));
  const [group, setGroup] = useState<string>("すべてのグループ");
  const [search, setSearch] = useState("");
  const [schedules, setSchedules] = useState<ScheduleItem[]>(demoSchedules);
  const [members, setMembers] = useState<Member[]>(demoMembers);
  const [categories, setCategories] = useState<ScheduleCategory[]>(demoCategories);
  const [messages, setMessages] = useState<MessageItem[]>(demoMessages);
  const [scheduleEditor, setScheduleEditor] = useState<EditorState | null>(null);
  const [messageModal, setMessageModal] = useState(false);
  const [memberEditor, setMemberEditor] = useState<Member | "new" | null>(null);
  const [categoryEditor, setCategoryEditor] = useState<ScheduleCategory | "new" | null>(null);
  const [managementTab, setManagementTab] = useState<ManagementTab>("members");
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<CellTarget | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [cellContextMenu, setCellContextMenu] = useState<CellContextMenuState | null>(null);
  const [toast, setToast] = useState("");
  const [selectedMessage, setSelectedMessage] = useState<MessageItem>(demoMessages[0]);
  const [authReady, setAuthReady] = useState(false);
  const [serverAvailable, setServerAvailable] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [syncStatus, setSyncStatus] = useState<"saved" | "saving" | "offline">("saving");
  const versionRef = useRef(0);
  const lastSyncedRef = useRef("");
  const mutationRef = useRef({ action: "更新", summary: "共有データを更新" });
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const shownRemindersRef = useRef(new Set<string>());

  function applySharedState(state: SharedState) {
    setMembers(state.members);
    setSchedules(state.schedules);
    setCategories(state.categories);
    setMessages(state.messages);
    setSelectedMessage((current) => state.messages.find((item) => item.id === current?.id) ?? state.messages[0] ?? current);
  }

  function applyServerPayload(payload: BootstrapResponse) {
    lastSyncedRef.current = JSON.stringify(payload.state);
    versionRef.current = payload.version;
    setCsrfToken(payload.csrfToken);
    setCurrentUserId(payload.currentUserId);
    setAuditLogs(payload.audit);
    applySharedState(payload.state);
    setSyncStatus("saved");
  }

  function markMutation(action: string, summary: string) {
    mutationRef.current = { action, summary };
  }

  useEffect(() => {
    let active = true;
    groupWatcherApi.bootstrap().then((payload) => {
      if (!active) return;
      applyServerPayload(payload);
      setAuthReady(true);
    }).catch(() => {
      if (!active) return;
      lastSyncedRef.current = JSON.stringify({ members: demoMembers, schedules: demoSchedules, categories: demoCategories, messages: demoMessages });
      setServerAvailable(false);
      setSyncStatus("offline");
      setAuthReady(true);
    });
    return () => { active = false; };
    // 初回だけ共有データとログイン状態を取得します。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authReady || !serverAvailable || !currentUserId || !csrfToken) return;
    const state: SharedState = { members, schedules, categories, messages };
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
          const conflict = (error as { status?: number; payload?: BootstrapResponse }).status === 409;
          const payload = (error as { payload?: BootstrapResponse }).payload;
          if (conflict && payload?.state) {
            applyServerPayload(payload);
            setToast("他の利用者の更新を反映しました。もう一度操作してください");
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
  }, [authReady, categories, csrfToken, currentUserId, members, messages, schedules, serverAvailable]);

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
      const matches = !q || `${member.name} ${member.group} ${member.destination ?? ""}`.toLowerCase().includes(q);
      return inGroup && matches;
    });
  }, [group, members, search]);

  const currentMember = members.find((member) => member.id === currentUserId) ?? members[0];
  const unreadCount = messages.filter((message) => message.unread).length;
  const selectedSchedule = schedules.find((item) => item.id === selectedScheduleId) ?? null;

  async function login(memberId: string) {
    if (!serverAvailable) {
      setCurrentUserId(memberId);
      setToast("オフラインのデモモードでログインしました");
      return;
    }
    try {
      const payload = await groupWatcherApi.login(memberId);
      applyServerPayload(payload);
      setToast(`${payload.state.members.find((member) => member.id === memberId)?.name ?? "ユーザー"}としてログインしました`);
    } catch {
      setToast("ログインできませんでした");
    }
  }

  async function logout() {
    if (serverAvailable && csrfToken) {
      try { await groupWatcherApi.logout(csrfToken); } catch { /* 画面側のログアウトは継続します。 */ }
    }
    setCurrentUserId(null);
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
      const payload = (error as { payload?: BootstrapResponse }).payload;
      if (payload?.state) applyServerPayload(payload);
      setToast("取り消せませんでした。最新状態を確認してください");
    }
  }

  useEffect(() => {
    if (!currentUserId) return;
    const checkReminders = () => {
      const now = new Date();
      schedules.forEach((item) => {
        if (!item.reminderMinutes) return;
        const [hour, minute] = item.start.split(":").map(Number);
        const lookAheadDays = Math.max(1, Math.ceil(item.reminderMinutes / 1440));
        for (let dayOffset = 0; dayOffset <= lookAheadDays; dayOffset += 1) {
          const occurrenceDate = addDays(now, dayOffset);
          const occurrenceKey = dateKey(occurrenceDate);
          if (!scheduleOccursOn(item, occurrenceKey)) continue;
          const startsAt = new Date(occurrenceDate.getFullYear(), occurrenceDate.getMonth(), occurrenceDate.getDate(), hour, minute);
          const reminderAt = startsAt.getTime() - item.reminderMinutes * 60000;
          const key = `${item.id}-${occurrenceKey}`;
          if (now.getTime() >= reminderAt && now.getTime() < reminderAt + 60000 && !shownRemindersRef.current.has(key)) {
            shownRemindersRef.current.add(key);
            setToast(`リマインダー：${occurrenceKey} ${item.start} ${item.title}`);
          }
        }
      });
    };
    checkReminders();
    const timer = window.setInterval(checkReminders, 30000);
    return () => window.clearInterval(timer);
  }, [currentUserId, schedules]);

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
    const nextItem: ScheduleItem = {
      id: scheduleEditor.mode === "edit" ? scheduleEditor.item.id : `s-${Date.now()}`,
      memberId: String(form.get("memberId")),
      date: startDate,
      endDate,
      start: String(form.get("start")),
      end: String(form.get("end")),
      title,
      category: String(form.get("category")),
      memo: String(form.get("memo") ?? ""),
      private: form.get("private") === "on",
      repeat: String(form.get("repeat") ?? "none") as ScheduleItem["repeat"],
      repeatUntil: String(form.get("repeatUntil") || endDate),
      reminderMinutes: Number(form.get("reminderMinutes") ?? 0) || undefined,
    };
    markMutation(scheduleEditor.mode === "edit" ? "予定編集" : "予定作成", `${nextItem.title}（${nextItem.date}〜${nextItem.endDate}）`);
    setSchedules((items) => scheduleEditor.mode === "edit" ? items.map((item) => item.id === nextItem.id ? nextItem : item) : [...items, nextItem]);
    setSelectedScheduleId(nextItem.id);
    setSelectedCell({ memberId: nextItem.memberId, date: nextItem.date });
    setScheduleEditor(null);
    setToast(scheduleEditor.mode === "edit" ? "予定を更新しました" : "予定を登録しました");
  }

  function deleteSchedule(id: string, confirmDelete = true) {
    const item = schedules.find((schedule) => schedule.id === id);
    if (!item) return;
    if (confirmDelete && !window.confirm(`「${item.title}」を削除しますか？`)) return;
    markMutation("予定削除", `${item.title}を削除`);
    setSchedules((items) => items.filter((schedule) => schedule.id !== id));
    if (selectedScheduleId === id) setSelectedScheduleId(null);
    if (scheduleEditor?.mode === "edit" && scheduleEditor.item.id === id) setScheduleEditor(null);
    if (clipboard?.item.id === id) setClipboard(null);
    setContextMenu(null);
    setToast("予定を削除しました");
  }

  function selectSchedule(item: ScheduleItem) {
    setSelectedScheduleId(item.id);
    setSelectedCell({ memberId: item.memberId, date: item.date });
  }

  function copySchedule(id: string) {
    const item = schedules.find((schedule) => schedule.id === id);
    if (!item) return;
    setClipboard({ mode: "copy", item: { ...item } });
    setContextMenu(null);
    setToast("予定をコピーしました。貼り付け先の日付を選択してください");
  }

  function cutSchedule(id: string) {
    const item = schedules.find((schedule) => schedule.id === id);
    if (!item) return;
    setClipboard({ mode: "cut", item: { ...item } });
    setSelectedScheduleId(id);
    setContextMenu(null);
    setToast("予定を切り取りました。貼り付け先の日付を選択してください");
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
    if (clipboard.mode === "copy") {
      const duration = Math.max(0, daysBetween(clipboard.item.date, clipboard.item.endDate || clipboard.item.date));
      const nextItem = { ...clipboard.item, id: `s-${Date.now()}`, memberId: target.memberId, date: target.date, endDate: dateKey(addDays(new Date(`${target.date}T12:00:00`), duration)) };
      markMutation("予定貼り付け", `${nextItem.title}を${target.date}へコピー`);
      setSchedules((items) => [...items, nextItem]);
      setSelectedScheduleId(nextItem.id);
    } else {
      const duration = Math.max(0, daysBetween(clipboard.item.date, clipboard.item.endDate || clipboard.item.date));
      markMutation("予定移動", `${clipboard.item.title}を${target.date}へ移動`);
      setSchedules((items) => items.map((item) => item.id === clipboard.item.id ? { ...item, memberId: target.memberId, date: target.date, endDate: dateKey(addDays(new Date(`${target.date}T12:00:00`), duration)) } : item));
      setSelectedScheduleId(clipboard.item.id);
      setClipboard(null);
    }
    setSelectedCell(target);
    setToast("予定を貼り付けました");
  }

  function moveSchedule(id: string, target: CellTarget) {
    const source = schedules.find((item) => item.id === id);
    if (!source) return;
    const duration = Math.max(0, daysBetween(source.date, source.endDate || source.date));
    markMutation("予定移動", `${source.title}を${target.date}へ移動`);
    setSchedules((items) => items.map((item) => item.id === id ? { ...item, memberId: target.memberId, date: target.date, endDate: dateKey(addDays(new Date(`${target.date}T12:00:00`), duration)) } : item));
    setSelectedScheduleId(id);
    setSelectedCell(target);
    setClipboard((value) => value?.mode === "cut" && value.item.id === id ? null : value);
    setToast("予定を移動しました");
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)) return;
      if (event.key === "Escape") {
        setScheduleEditor(null);
        setMessageModal(false);
        setMemberEditor(null);
        setCategoryEditor(null);
        setContextMenu(null);
        setSelectedScheduleId(null);
        return;
      }
      if (section !== "schedule" || scheduleEditor) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && selectedScheduleId) {
        event.preventDefault();
        copySchedule(selectedScheduleId);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        event.preventDefault();
        pasteSchedule();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedScheduleId) {
        event.preventDefault();
        deleteSchedule(selectedScheduleId);
      } else if (event.key === "Enter" && selectedSchedule) {
        event.preventDefault();
        setScheduleEditor({ mode: "edit", item: selectedSchedule });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  // クリップボード操作関数は最新の予定一覧と選択状態を参照するため、関連状態を依存に含めています。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipboard, scheduleEditor, schedules, section, selectedCell, selectedSchedule, selectedScheduleId]);

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const subject = String(form.get("subject") ?? "").trim();
    if (!subject) return;
    const item: MessageItem = {
      id: `msg-${Date.now()}`,
      from: currentMember?.name ?? "未登録ユーザー",
      to: String(form.get("to")),
      subject,
      body: String(form.get("body") ?? ""),
      time: "たった今",
      kind: form.get("kind") === "memo" ? "memo" : "message",
    };
    markMutation(item.kind === "memo" ? "伝言登録" : "メッセージ送信", item.subject);
    setMessages((items) => [item, ...items]);
    setSelectedMessage(item);
    setMessageModal(false);
    setSection("messages");
    setToast(item.kind === "memo" ? "伝言メモを登録しました" : "メッセージを送信しました");
  }

  function updatePresence(memberId: string, presence: PresenceState) {
    const member = members.find((item) => item.id === memberId);
    markMutation("在席更新", `${member?.name ?? "ユーザー"}を「${presence}」へ変更`);
    setMembers((items) => items.map((member) => member.id === memberId ? { ...member, presence } : member));
    setToast("在席状況を更新しました");
  }

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
      presence: String(form.get("presence")) as PresenceState,
      destination: String(form.get("destination") ?? ""),
      returnAt: String(form.get("returnAt") ?? ""),
      phone: String(form.get("phone") ?? ""),
      email: String(form.get("email") ?? ""),
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
    const count = schedules.filter((item) => item.memberId === member.id).length;
    const detail = count ? `\nこのユーザーの予定 ${count}件も削除されます。` : "";
    if (!window.confirm(`「${member.name}」を削除しますか？${detail}`)) return;
    markMutation("ユーザー削除", `${member.name}を削除`);
    setMembers((items) => items.filter((item) => item.id !== member.id));
    setSchedules((items) => items.filter((item) => item.memberId !== member.id));
    if (selectedCell?.memberId === member.id) setSelectedCell(null);
    setToast("ユーザーを削除しました");
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

  function navigateCalendar(direction: -1 | 1) {
    setCalendarDate((value) => view === "day" ? addDays(value, direction) : view === "week" ? addDays(value, direction * 7) : addMonths(value, direction));
  }

  function openContextMenu(event: React.MouseEvent, item: ScheduleItem) {
    event.preventDefault();
    event.stopPropagation();
    selectSchedule(item);
    setCellContextMenu(null);
    setContextMenu({ scheduleId: item.id, x: Math.min(event.clientX, window.innerWidth - 180), y: Math.min(event.clientY, window.innerHeight - 150) });
  }

  function openCellContextMenu(event: React.MouseEvent, target: CellTarget) {
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedCell(target);
    setContextMenu(null);
    setCellContextMenu({ target, x: Math.min(event.clientX, window.innerWidth - 190), y: Math.min(event.clientY, window.innerHeight - 120) });
  }

  if (!authReady) return <div className="auth-screen"><Logo /><p>共有データを読み込んでいます…</p></div>;
  if (!currentUserId) return <LoginScreen members={members} serverAvailable={serverAvailable} onLogin={login} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <nav className="main-nav" aria-label="メインメニュー">
          <button className={section === "schedule" ? "active" : ""} onClick={() => setSection("schedule")}><SectionIcon symbol="▦" /><span>スケジュール</span></button>
          <button className={section === "presence" ? "active" : ""} onClick={() => setSection("presence")}><SectionIcon symbol="⌖" /><span>行き先・在席</span></button>
          <button className={section === "messages" ? "active" : ""} onClick={() => setSection("messages")}><SectionIcon symbol="✉" /><span>メッセージ</span>{unreadCount > 0 && <em>{unreadCount}</em>}</button>
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
          <div className="sidebar-user"><Avatar member={currentMember} small /><span><b>{currentMember.name}</b><small>{currentMember.group}・共同編集</small></span><button aria-label="ログアウト" title="ログアウト" onClick={logout}>↪</button></div>
        ) : (
          <div className="sidebar-user sidebar-empty-user"><span>ユーザー未登録</span></div>
        )}
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><Logo /></div>
          <label className="global-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="予定・メンバーを検索" aria-label="予定・メンバーを検索" /><kbd>⌘ K</kbd></label>
          <div className="topbar-actions">
            <span className={`sync-badge ${syncStatus}`}>{syncStatus === "saved" ? "● 共有済み" : syncStatus === "saving" ? "○ 保存中" : "△ オフライン"}</span>
            <button className="icon-button notification-button" aria-label={`通知 ${unreadCount}件`} onClick={() => setSection("messages")}>♢{unreadCount > 0 && <i />}</button>
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
            selectedScheduleId={selectedScheduleId}
            cutScheduleId={clipboard?.mode === "cut" ? clipboard.item.id : null}
            selectedCell={selectedCell}
            onSelectCell={setSelectedCell}
            onSelectSchedule={selectSchedule}
            onEditSchedule={(item) => setScheduleEditor({ mode: "edit", item })}
            onCreateSchedule={openCreateSchedule}
            onMoveSchedule={moveSchedule}
            onContextMenu={openContextMenu}
            onCellContextMenu={openCellContextMenu}
            openMessages={() => setSection("messages")}
          />
        )}
        {section === "presence" && <PresencePage members={filteredMembers} updatePresence={updatePresence} openMessage={() => setMessageModal(true)} />}
        {section === "messages" && <MessagesPage messages={messages} selectedMessage={selectedMessage} selectMessage={(message) => { setSelectedMessage(message); if (message.unread) markMutation("既読", `${message.subject}を確認`); setMessages((items) => items.map((item) => item.id === message.id ? { ...item, unread: false } : item)); }} openCompose={() => setMessageModal(true)} />}
        {section === "members" && (
          <ManagementPage
            tab={managementTab}
            setTab={setManagementTab}
            members={filteredMembers}
            categories={categories}
            schedules={schedules}
            onAddMember={() => setMemberEditor("new")}
            onEditMember={setMemberEditor}
            onDeleteMember={deleteMember}
            onAddCategory={() => setCategoryEditor("new")}
            onEditCategory={setCategoryEditor}
            onDeleteCategory={deleteCategory}
            auditLogs={auditLogs}
            onUndo={undoAudit}
          />
        )}
      </main>

      <nav className="mobile-nav" aria-label="モバイルメニュー">
        <button className={section === "schedule" ? "active" : ""} onClick={() => setSection("schedule")}><SectionIcon symbol="▦" /><span>予定</span></button>
        <button className={section === "presence" ? "active" : ""} onClick={() => setSection("presence")}><SectionIcon symbol="⌖" /><span>行き先</span></button>
        <button className="mobile-add" onClick={() => openCreateSchedule()} aria-label="予定を登録">＋</button>
        <button className={section === "messages" ? "active" : ""} onClick={() => setSection("messages")}><SectionIcon symbol="✉" /><span>伝言</span></button>
        <button className={section === "members" ? "active" : ""} onClick={() => setSection("members")}><SectionIcon symbol="◎" /><span>設定</span></button>
      </nav>

      {scheduleEditor && <ScheduleModal editor={scheduleEditor} members={members} categories={categories} onClose={() => setScheduleEditor(null)} onSubmit={saveSchedule} onDelete={scheduleEditor.mode === "edit" ? () => deleteSchedule(scheduleEditor.item.id) : undefined} />}
      {messageModal && <MessageModal members={members} onClose={() => setMessageModal(false)} onSubmit={sendMessage} />}
      {memberEditor && <MemberModal member={memberEditor === "new" ? null : memberEditor} onClose={() => setMemberEditor(null)} onSubmit={saveMember} />}
      {categoryEditor && <CategoryModal category={categoryEditor === "new" ? null : categoryEditor} onClose={() => setCategoryEditor(null)} onSubmit={saveCategory} />}
      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()} role="menu">
          <button role="menuitem" onClick={() => copySchedule(contextMenu.scheduleId)}><span>□</span>コピー<kbd>Ctrl+C</kbd></button>
          <button role="menuitem" onClick={() => cutSchedule(contextMenu.scheduleId)}><span>✂</span>切り取り</button>
          <hr />
          <button className="danger" role="menuitem" onClick={() => deleteSchedule(contextMenu.scheduleId)}><span>×</span>削除<kbd>Delete</kbd></button>
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
  selectedScheduleId: string | null;
  cutScheduleId: string | null;
  selectedCell: CellTarget | null;
  onSelectCell: (target: CellTarget) => void;
  onSelectSchedule: (item: ScheduleItem) => void;
  onEditSchedule: (item: ScheduleItem) => void;
  onCreateSchedule: (target: CellTarget) => void;
  onMoveSchedule: (id: string, target: CellTarget) => void;
  onContextMenu: (event: React.MouseEvent, item: ScheduleItem) => void;
  onCellContextMenu: (event: React.MouseEvent, target: CellTarget) => void;
};

function SchedulePage({ view, setView, calendarDate, onPrevious, onNext, onToday, group, setGroup, members, allMembers, schedules, categories, openMessages, ...interactions }: CalendarInteractionProps & {
  view: CalendarView;
  setView: (view: CalendarView) => void;
  calendarDate: Date;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  group: string;
  setGroup: (group: string) => void;
  allMembers: Member[];
  openMessages: () => void;
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
        <div className="shortcut-guide"><b>操作:</b> 日付欄をダブルクリックで登録 ・ 予定をドラッグして移動 ・ 右クリックでコピー／切り取り／削除 ・ <kbd>Ctrl+C</kbd> <kbd>Ctrl+V</kbd> <kbd>Delete</kbd></div>
      </section>
      <aside className="right-rail"><TodayCard members={allMembers} schedules={schedules} /><MemoCard openMessages={openMessages} /></aside>
    </div>
  );
}

function ScheduleEventButton({ item, categories, selected, cutting, compact = false, onSelect, onEdit, onContextMenu }: {
  item: ScheduleItem;
  categories: ScheduleCategory[];
  selected: boolean;
  cutting: boolean;
  compact?: boolean;
  onSelect: (item: ScheduleItem) => void;
  onEdit: (item: ScheduleItem) => void;
  onContextMenu: (event: React.MouseEvent, item: ScheduleItem) => void;
}) {
  return (
    <button
      className={`${compact ? "month-event" : "schedule-event"} ${selected ? "selected" : ""} ${cutting ? "cutting" : ""}`}
      style={categoryStyle(item.category, categories)}
      draggable
      onDragStart={(event) => { event.dataTransfer.setData("text/group-watcher-schedule", item.id); event.dataTransfer.setData("text/plain", item.id); event.dataTransfer.effectAllowed = "move"; onSelect(item); }}
      onClick={(event) => { event.stopPropagation(); onSelect(item); }}
      onDoubleClick={(event) => { event.stopPropagation(); onEdit(item); }}
      onContextMenu={(event) => onContextMenu(event, item)}
      title={`${item.start}–${item.end} ${item.title}（ダブルクリックで編集）`}
    >
      {compact ? <><i />{item.start} {item.repeat && item.repeat !== "none" ? "↻ " : ""}{item.private ? "【非】" : ""}{item.title}</> : <><time>{item.start}{item.endDate && item.endDate !== item.date ? "・複数日" : ""}</time><strong>{item.repeat && item.repeat !== "none" ? "↻ " : ""}{item.reminderMinutes ? "♢ " : ""}{item.private ? "【非】" : ""}{item.title}</strong>{item.memo && <span className="memo-mark">◆</span>}</>}
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

function WeekGrid({ calendarDate, members, schedules, categories, selectedScheduleId, cutScheduleId, selectedCell, onSelectCell, onSelectSchedule, onEditSchedule, onCreateSchedule, onMoveSchedule, onContextMenu, onCellContextMenu }: CalendarInteractionProps & { calendarDate: Date }) {
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
            <div className="member-cell"><Avatar member={member} small /><span><b>{member.name}</b><small><StatusDot status={member.presence} />{member.presence}</small></span></div>
            {dates.map((date) => {
              const key = dateKey(date);
              const target = { memberId: member.id, date: key };
              const items = schedules.filter((item) => item.memberId === member.id && scheduleOccursOn(item, key)).sort((a, b) => a.start.localeCompare(b.start));
              return (
                <DropCell key={key} target={target} selected={selectedCell?.memberId === member.id && selectedCell.date === key} className={`schedule-cell ${sameDate(date, today) ? "is-today" : ""} ${date.getDay() === 0 || date.getDay() === 6 ? "weekend" : ""}`} onSelectCell={onSelectCell} onCreateSchedule={onCreateSchedule} onMoveSchedule={onMoveSchedule} onCellContextMenu={onCellContextMenu}>
                  {items.map((item) => <ScheduleEventButton key={item.id} item={item} categories={categories} selected={selectedScheduleId === item.id} cutting={cutScheduleId === item.id} onSelect={onSelectSchedule} onEdit={onEditSchedule} onContextMenu={onContextMenu} />)}
                </DropCell>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayView({ calendarDate, members, schedules, categories, selectedScheduleId, cutScheduleId, selectedCell, onSelectCell, onSelectSchedule, onEditSchedule, onCreateSchedule, onMoveSchedule, onContextMenu, onCellContextMenu }: CalendarInteractionProps & { calendarDate: Date }) {
  const key = dateKey(calendarDate);
  const holiday = japaneseHolidays.find((item) => item.date === key);
  return (
    <div className="day-view">
      <div className="day-view-heading"><span>{formatLongDate(calendarDate)}</span>{holiday && <em>{holiday.name}</em>}<small>ダブルクリック／右クリックで予定登録</small></div>
      {members.map((member) => {
        const target = { memberId: member.id, date: key };
        const items = schedules.filter((item) => item.memberId === member.id && scheduleOccursOn(item, key)).sort((a, b) => a.start.localeCompare(b.start));
        return (
          <div className="day-member" key={member.id}>
            <div className="day-member-profile"><Avatar member={member} small /><span><b>{member.name}</b><small>{member.group}</small></span></div>
            <DropCell target={target} selected={selectedCell?.memberId === member.id && selectedCell.date === key} className="day-events" onSelectCell={onSelectCell} onCreateSchedule={onCreateSchedule} onMoveSchedule={onMoveSchedule} onCellContextMenu={onCellContextMenu}>
              {items.length ? items.map((item) => <ScheduleEventButton key={item.id} item={item} categories={categories} selected={selectedScheduleId === item.id} cutting={cutScheduleId === item.id} onSelect={onSelectSchedule} onEdit={onEditSchedule} onContextMenu={onContextMenu} />) : <span className="no-plan">予定はありません</span>}
            </DropCell>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({ calendarDate, members, schedules, categories, selectedScheduleId, cutScheduleId, selectedCell, onSelectCell, onSelectSchedule, onEditSchedule, onCreateSchedule, onMoveSchedule, onContextMenu, onCellContextMenu }: CalendarInteractionProps & { calendarDate: Date }) {
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
              {items.slice(0, 4).map((item) => <ScheduleEventButton compact key={item.id} item={item} categories={categories} selected={selectedScheduleId === item.id} cutting={cutScheduleId === item.id} onSelect={onSelectSchedule} onEdit={onEditSchedule} onContextMenu={onContextMenu} />)}
              {items.length > 4 && <span className="more-events">ほか {items.length - 4}件</span>}
            </DropCell>
          );
        })}
      </div>
    </div>
  );
}

function TodayCard({ members, schedules }: { members: Member[]; schedules: ScheduleItem[] }) {
  const today = dateAtNoon(new Date());
  const todayItems = schedules.filter((item) => scheduleOccursOn(item, dateKey(today))).slice(0, 3);
  return (
    <section className="rail-card today-card">
      <div className="rail-card-heading"><div><span className="eyebrow">TODAY</span><h2>今日のチーム</h2></div><span className="date-badge"><b>{today.getDate()}</b>{weekdayNames[today.getDay()]}</span></div>
      <div className="presence-summary"><div><b>{members.filter((member) => member.presence === "在席").length}</b><span>在席</span></div><div><b>{members.filter((member) => ["外出", "会議中", "離席"].includes(member.presence)).length}</b><span>外出・離席</span></div><div><b>{members.filter((member) => member.presence === "休暇").length}</b><span>休暇</span></div></div>
      <div className="today-list">
        {todayItems.length ? todayItems.map((item) => { const member = members.find((person) => person.id === item.memberId); return member ? <div key={item.id}><Avatar member={member} small /><span><b>{item.start} {item.title}</b><small>{member.name} ・ {item.end}まで</small></span></div> : null; }) : <span className="rail-empty">今日の予定はありません</span>}
      </div>
    </section>
  );
}

function MemoCard({ openMessages }: { openMessages: () => void }) {
  return (
    <section className="rail-card memo-card">
      <div className="rail-card-heading"><div><span className="eyebrow">MEMO</span><h2>伝言メモ</h2></div><span className="unread-pill">未読 2</span></div>
      <button className="memo-item" onClick={openMessages}><span className="memo-icon">電</span><span><b>山田商事からお電話です</b><small>鈴木 健太 ・ 12:18</small></span></button>
      <button className="memo-item" onClick={openMessages}><span className="memo-icon memo-icon-blue">連</span><span><b>メンテナンスのお知らせ</b><small>高橋 直子 ・ 10:42</small></span></button>
      <button className="text-link" onClick={openMessages}>すべてのメッセージを見る <span>→</span></button>
    </section>
  );
}

function PresencePage({ members, updatePresence, openMessage }: { members: Member[]; updatePresence: (id: string, status: PresenceState) => void; openMessage: () => void }) {
  return (
    <div className="standard-page">
      <div className="page-heading"><div><span className="eyebrow">WHEREABOUTS</span><h1>行き先・在席状況</h1><p>メンバーの現在地と戻り予定を確認できます</p></div></div>
      <div className="summary-strip">{presenceOptions.slice(0, 4).map((status) => <div key={status}><StatusDot status={status} /><span>{status}</span><b>{members.filter((member) => member.presence === status).length}</b></div>)}</div>
      <div className="presence-grid">{members.map((member) => <article className="presence-card" key={member.id}><div className="presence-profile"><Avatar member={member} /><div><span>{member.group}</span><h2>{member.name}</h2></div></div><label className={`presence-select presence-${member.presence}`}><StatusDot status={member.presence} /><select value={member.presence} onChange={(event) => updatePresence(member.id, event.target.value as PresenceState)}>{presenceOptions.map((status) => <option key={status}>{status}</option>)}</select></label><dl><div><dt>行き先</dt><dd>{member.destination || "—"}</dd></div><div><dt>戻り予定</dt><dd>{member.returnAt || "—"}</dd></div></dl><button onClick={openMessage}>伝言を残す</button></article>)}</div>
    </div>
  );
}

function MessagesPage({ messages, selectedMessage, selectMessage, openCompose }: { messages: MessageItem[]; selectedMessage: MessageItem; selectMessage: (message: MessageItem) => void; openCompose: () => void }) {
  return (
    <div className="standard-page messages-page">
      <div className="page-heading"><div><span className="eyebrow">MESSAGES</span><h1>メッセージ・伝言</h1><p>グループや個人への連絡をまとめて確認</p></div><button className="primary-button" onClick={openCompose}>＋ 新規メッセージ</button></div>
      <div className="message-workspace"><aside className="message-list"><div className="message-filter"><button className="active">受信</button><button>送信済み</button></div>{messages.map((message) => <button key={message.id} className={`${selectedMessage.id === message.id ? "active" : ""} ${message.unread ? "unread" : ""}`} onClick={() => selectMessage(message)}><span className={`message-type ${message.kind}`}>{message.kind === "memo" ? "電" : "連"}</span><span><b>{message.subject}</b><small>{message.from} → {message.to}</small><p>{message.body}</p></span><time>{message.time}</time></button>)}</aside><article className="message-detail"><div className="message-detail-top"><span className={`message-type large ${selectedMessage.kind}`}>{selectedMessage.kind === "memo" ? "電" : "連"}</span><div><small>{selectedMessage.kind === "memo" ? "伝言メモ" : "メッセージ"}</small><h2>{selectedMessage.subject}</h2></div><button aria-label="その他の操作">•••</button></div><div className="message-meta"><span><b>差出人</b>{selectedMessage.from}</span><span><b>宛先</b>{selectedMessage.to}</span><time>{selectedMessage.time}</time></div><p className="message-body">{selectedMessage.body}</p><div className="message-actions"><button onClick={openCompose}>↩ 返信する</button><button>✓ 確認済みにする</button></div></article></div>
    </div>
  );
}

function ManagementPage({ tab, setTab, members, categories, schedules, auditLogs, onUndo, onAddMember, onEditMember, onDeleteMember, onAddCategory, onEditCategory, onDeleteCategory }: {
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
  onAddCategory: () => void;
  onEditCategory: (category: ScheduleCategory) => void;
  onDeleteCategory: (category: ScheduleCategory) => void;
}) {
  return (
    <div className="standard-page management-page">
      <div className="page-heading"><div><span className="eyebrow">MANAGEMENT</span><h1>ユーザー・予定種別・操作履歴</h1><p>共同編集の変更者を確認し、必要に応じて変更を取り消せます</p></div>{tab !== "audit" && <button className="primary-button" onClick={tab === "members" ? onAddMember : onAddCategory}>＋ {tab === "members" ? "ユーザーを追加" : "予定種別を追加"}</button>}</div>
      <div className="management-tabs"><button className={tab === "members" ? "active" : ""} onClick={() => setTab("members")}>ユーザー <span>{members.length}</span></button><button className={tab === "categories" ? "active" : ""} onClick={() => setTab("categories")}>予定種別 <span>{categories.length}</span></button><button className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}>操作履歴 <span>{auditLogs.length}</span></button></div>
      {tab === "members" ? (
        <div className="members-table-wrap"><table className="members-table"><thead><tr><th>ユーザー</th><th>所属</th><th>在席状況</th><th>行き先</th><th>連絡先</th><th>操作</th></tr></thead><tbody>{members.map((member) => <tr key={member.id}><td><Avatar member={member} small /><b>{member.name}</b></td><td>{member.group}</td><td><span className={`table-status presence-${member.presence}`}><StatusDot status={member.presence} />{member.presence}</span></td><td>{member.destination || "—"}</td><td><span>{member.phone || "—"}</span><small>{member.email}</small></td><td className="table-actions"><button onClick={() => onEditMember(member)}>編集</button><button className="danger" onClick={() => onDeleteMember(member)}>削除</button></td></tr>)}</tbody></table></div>
      ) : tab === "categories" ? (
        <div className="category-management-list">{categories.map((category) => <article key={category.id}><span className="category-swatch" style={{ background: category.color }} /><div><h2>{category.name}</h2><p>使用中の予定 {schedules.filter((item) => item.category === category.name).length}件</p></div><button onClick={() => onEditCategory(category)}>編集</button><button className="danger" onClick={() => onDeleteCategory(category)}>削除</button></article>)}</div>
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
  return (
    <ModalShell title={item ? "予定を編集" : "予定を登録"} eyebrow={item ? "EDIT SCHEDULE" : "NEW SCHEDULE"} onClose={onClose}>
      <form onSubmit={onSubmit} className="modal-form">
        <label className="field full"><span>件名</span><input name="title" autoFocus placeholder="例：プロジェクト定例会" defaultValue={item?.title ?? ""} required /></label>
        <label className="field full"><span>ユーザー</span><select name="memberId" defaultValue={item?.memberId ?? (editor.mode === "create" ? editor.memberId : members[0]?.id)}>{members.map((member) => <option value={member.id} key={member.id}>{member.name}（{member.group}）</option>)}</select><small className="field-note">誰の予定でも変更できます</small></label>
        <label className="field"><span>開始日</span><input name="date" type="date" defaultValue={item?.date ?? (editor.mode === "create" ? editor.date : "")} required /></label>
        <label className="field"><span>終了日</span><input name="endDate" type="date" defaultValue={item?.endDate ?? item?.date ?? (editor.mode === "create" ? editor.date : "")} required /></label>
        <label className="field"><span>予定種別</span><select name="category" defaultValue={item?.category ?? categories[0]?.name}>{categories.map((category) => <option key={category.id}>{category.name}</option>)}</select></label>
        <label className="field"><span>繰り返し</span><select name="repeat" defaultValue={item?.repeat ?? "none"}><option value="none">繰り返さない</option><option value="daily">毎日</option><option value="weekly">毎週</option><option value="monthly">毎月</option></select></label>
        <label className="field"><span>開始</span><input name="start" type="time" defaultValue={item?.start ?? "13:00"} required /></label>
        <label className="field"><span>終了</span><input name="end" type="time" defaultValue={item?.end ?? "14:00"} required /></label>
        <label className="field"><span>繰り返し終了日</span><input name="repeatUntil" type="date" defaultValue={item?.repeatUntil ?? item?.endDate ?? item?.date ?? (editor.mode === "create" ? editor.date : "")} /></label>
        <label className="field"><span>リマインダー</span><select name="reminderMinutes" defaultValue={item?.reminderMinutes ?? 0}><option value="0">なし</option><option value="5">5分前</option><option value="10">10分前</option><option value="15">15分前</option><option value="30">30分前</option><option value="60">1時間前</option><option value="1440">1日前</option></select></label>
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
        <label className="field"><span>所属</span><select name="group" defaultValue={member?.group ?? "営業部"}>{groups.slice(1).map((groupName) => <option key={groupName}>{groupName}</option>)}</select></label>
        <label className="field"><span>在席状況</span><select name="presence" defaultValue={member?.presence ?? "在席"}>{presenceOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label className="field full"><span>行き先</span><input name="destination" defaultValue={member?.destination ?? ""} /></label>
        <label className="field"><span>戻り予定</span><input name="returnAt" type="time" defaultValue={member?.returnAt ?? ""} /></label>
        <label className="field"><span>電話番号</span><input name="phone" type="tel" defaultValue={member?.phone ?? ""} /></label>
        <label className="field full"><span>メールアドレス</span><input name="email" type="email" defaultValue={member?.email ?? ""} /></label>
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

function MessageModal({ members, onClose, onSubmit }: { members: Member[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <ModalShell title="メッセージを作成" eyebrow="NEW MESSAGE" onClose={onClose}><form onSubmit={onSubmit} className="modal-form"><label className="field"><span>種類</span><select name="kind"><option value="message">メッセージ</option><option value="memo">伝言メモ</option></select></label><label className="field"><span>宛先</span><select name="to"><option>全員</option>{groups.slice(1).map((groupName) => <option key={groupName}>{groupName}</option>)}{members.map((member) => <option key={member.id}>{member.name}</option>)}</select></label><label className="field full"><span>件名</span><input name="subject" autoFocus placeholder="連絡内容を入力" required /></label><label className="field full"><span>本文</span><textarea name="body" rows={5} placeholder="メッセージを入力してください" /></label><footer><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button className="primary-button" type="submit">送信する</button></footer></form></ModalShell>;
}
