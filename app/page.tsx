"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  demoMembers,
  demoMessages,
  demoSchedules,
  groups,
  type Member,
  type MessageItem,
  type PresenceState,
  type ScheduleItem,
} from "./lib/group-watcher-api";

type Section = "schedule" | "presence" | "messages" | "members";
type CalendarView = "day" | "week" | "month";

const weekDays = [
  { date: "2026-07-20", day: "20", weekday: "月" },
  { date: "2026-07-21", day: "21", weekday: "火" },
  { date: "2026-07-22", day: "22", weekday: "水" },
  { date: "2026-07-23", day: "23", weekday: "木" },
  { date: "2026-07-24", day: "24", weekday: "金" },
] as const;

const categoryLabels = ["会議", "訪問", "作業", "休暇", "その他"] as const;
const presenceOptions: PresenceState[] = ["在席", "外出", "会議中", "離席", "休暇"];

function SectionIcon({ symbol }: { symbol: string }) {
  return <span className="nav-symbol" aria-hidden="true">{symbol}</span>;
}

function Avatar({ member, small = false }: { member: Member; small?: boolean }) {
  return (
    <span
      className={`avatar ${small ? "avatar-small" : ""}`}
      style={{ "--avatar-color": member.color } as React.CSSProperties}
      aria-hidden="true"
    >
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

export default function Home() {
  const [section, setSection] = useState<Section>("schedule");
  const [view, setView] = useState<CalendarView>("week");
  const [group, setGroup] = useState<(typeof groups)[number]>("すべてのグループ");
  const [search, setSearch] = useState("");
  const [schedules, setSchedules] = useState<ScheduleItem[]>(demoSchedules);
  const [members, setMembers] = useState<Member[]>(demoMembers);
  const [messages, setMessages] = useState<MessageItem[]>(demoMessages);
  const [scheduleModal, setScheduleModal] = useState(false);
  const [messageModal, setMessageModal] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleItem | null>(null);
  const [toast, setToast] = useState("");
  const [selectedMessage, setSelectedMessage] = useState<MessageItem>(demoMessages[0]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setScheduleModal(false);
        setMessageModal(false);
        setSelectedSchedule(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((member) => {
      const inGroup = group === "すべてのグループ" || member.group === group;
      const matches = !q || `${member.name} ${member.group} ${member.destination ?? ""}`.toLowerCase().includes(q);
      return inGroup && matches;
    });
  }, [group, members, search]);

  const currentMember = members[0];
  const unreadCount = messages.filter((message) => message.unread).length;

  function navigate(next: Section) {
    setSection(next);
  }

  function addSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    if (!title) return;
    const item: ScheduleItem = {
      id: `s-${Date.now()}`,
      memberId: String(form.get("memberId")),
      date: String(form.get("date")),
      start: String(form.get("start")),
      end: String(form.get("end")),
      title,
      category: String(form.get("category")) as ScheduleItem["category"],
      memo: String(form.get("memo") ?? ""),
      private: form.get("private") === "on",
    };
    setSchedules((items) => [...items, item]);
    setScheduleModal(false);
    setToast("予定を登録しました");
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const subject = String(form.get("subject") ?? "").trim();
    if (!subject) return;
    const item: MessageItem = {
      id: `msg-${Date.now()}`,
      from: "佐藤 美咲",
      to: String(form.get("to")),
      subject,
      body: String(form.get("body") ?? ""),
      time: "たった今",
      kind: form.get("kind") === "memo" ? "memo" : "message",
    };
    setMessages((items) => [item, ...items]);
    setSelectedMessage(item);
    setMessageModal(false);
    setSection("messages");
    setToast(item.kind === "memo" ? "伝言メモを登録しました" : "メッセージを送信しました");
  }

  function updatePresence(memberId: string, presence: PresenceState) {
    setMembers((items) => items.map((member) => member.id === memberId ? { ...member, presence } : member));
    setToast("在席状況を更新しました");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <nav className="main-nav" aria-label="メインメニュー">
          <button className={section === "schedule" ? "active" : ""} onClick={() => navigate("schedule")}>
            <SectionIcon symbol="▦" /><span>スケジュール</span>
          </button>
          <button className={section === "presence" ? "active" : ""} onClick={() => navigate("presence")}>
            <SectionIcon symbol="⌖" /><span>行き先・在席</span>
          </button>
          <button className={section === "messages" ? "active" : ""} onClick={() => navigate("messages")}>
            <SectionIcon symbol="✉" /><span>メッセージ</span>{unreadCount > 0 && <em>{unreadCount}</em>}
          </button>
          <button className={section === "members" ? "active" : ""} onClick={() => navigate("members")}>
            <SectionIcon symbol="◎" /><span>メンバー</span>
          </button>
        </nav>

        <div className="sidebar-section">
          <p>表示グループ</p>
          {groups.slice(1).map((item) => (
            <button key={item} className={group === item ? "group-active" : ""} onClick={() => { setGroup(item); setSection("schedule"); }}>
              <span className={`group-pip group-${item}`} />{item}
              <small>{members.filter((member) => member.group === item).length}</small>
            </button>
          ))}
        </div>

        <div className="sidebar-user">
          <Avatar member={currentMember} small />
          <span><b>{currentMember.name}</b><small>{currentMember.group}・管理者</small></span>
          <button aria-label="アカウントメニュー">•••</button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><Logo /></div>
          <label className="global-search">
            <span aria-hidden="true">⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="予定・メンバーを検索" aria-label="予定・メンバーを検索" />
            <kbd>⌘ K</kbd>
          </label>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="ヘルプ">?</button>
            <button className="icon-button notification-button" aria-label={`通知 ${unreadCount}件`} onClick={() => setSection("messages")}>
              ♢{unreadCount > 0 && <i />}
            </button>
            <button className="primary-button" onClick={() => setScheduleModal(true)}><span>＋</span> 予定を登録</button>
          </div>
        </header>

        {section === "schedule" && (
          <SchedulePage
            view={view}
            setView={setView}
            group={group}
            setGroup={setGroup}
            members={filteredMembers}
            allMembers={members}
            schedules={schedules}
            setSelectedSchedule={setSelectedSchedule}
            openSchedule={() => setScheduleModal(true)}
            openMessages={() => setSection("messages")}
          />
        )}
        {section === "presence" && <PresencePage members={filteredMembers} updatePresence={updatePresence} openMessage={() => setMessageModal(true)} />}
        {section === "messages" && (
          <MessagesPage
            messages={messages}
            selectedMessage={selectedMessage}
            selectMessage={(message) => {
              setSelectedMessage(message);
              setMessages((items) => items.map((item) => item.id === message.id ? { ...item, unread: false } : item));
            }}
            openCompose={() => setMessageModal(true)}
          />
        )}
        {section === "members" && <MembersPage members={filteredMembers} openMessage={() => setMessageModal(true)} />}
      </main>

      <nav className="mobile-nav" aria-label="モバイルメニュー">
        <button className={section === "schedule" ? "active" : ""} onClick={() => setSection("schedule")}><SectionIcon symbol="▦" /><span>予定</span></button>
        <button className={section === "presence" ? "active" : ""} onClick={() => setSection("presence")}><SectionIcon symbol="⌖" /><span>行き先</span></button>
        <button className="mobile-add" onClick={() => setScheduleModal(true)} aria-label="予定を登録">＋</button>
        <button className={section === "messages" ? "active" : ""} onClick={() => setSection("messages")}><SectionIcon symbol="✉" /><span>伝言</span></button>
        <button className={section === "members" ? "active" : ""} onClick={() => setSection("members")}><SectionIcon symbol="◎" /><span>メンバー</span></button>
      </nav>

      {scheduleModal && <ScheduleModal members={members} onClose={() => setScheduleModal(false)} onSubmit={addSchedule} />}
      {messageModal && <MessageModal members={members} onClose={() => setMessageModal(false)} onSubmit={sendMessage} />}
      {selectedSchedule && <ScheduleDetail item={selectedSchedule} member={members.find((member) => member.id === selectedSchedule.memberId)} onClose={() => setSelectedSchedule(null)} />}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </div>
  );
}

function SchedulePage({
  view,
  setView,
  group,
  setGroup,
  members,
  allMembers,
  schedules,
  setSelectedSchedule,
  openSchedule,
  openMessages,
}: {
  view: CalendarView;
  setView: (view: CalendarView) => void;
  group: (typeof groups)[number];
  setGroup: (group: (typeof groups)[number]) => void;
  members: Member[];
  allMembers: Member[];
  schedules: ScheduleItem[];
  setSelectedSchedule: (item: ScheduleItem) => void;
  openSchedule: () => void;
  openMessages: () => void;
}) {
  return (
    <div className="page-layout schedule-page">
      <section className="content-column">
        <div className="page-heading">
          <div>
            <span className="eyebrow">SCHEDULE</span>
            <h1>みんなの予定</h1>
            <p>2026年7月 第4週 ・ <b>{members.length}名を表示中</b></p>
          </div>
          <button className="compact-add" onClick={openSchedule}>＋ 予定を登録</button>
        </div>

        <div className="schedule-toolbar">
          <div className="date-navigation">
            <button aria-label="前の期間">‹</button>
            <button className="today-button">今週</button>
            <button aria-label="次の期間">›</button>
            <strong>7月20日 — 7月24日</strong>
          </div>
          <div className="toolbar-right">
            <label className="group-select">
              <span className="filter-icon" aria-hidden="true">≡</span>
              <select value={group} onChange={(event) => setGroup(event.target.value as (typeof groups)[number])} aria-label="表示グループ">
                {groups.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <div className="view-switch" aria-label="カレンダー表示">
              <button className={view === "day" ? "active" : ""} onClick={() => setView("day")}>日</button>
              <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>週</button>
              <button className={view === "month" ? "active" : ""} onClick={() => setView("month")}>月</button>
            </div>
          </div>
        </div>

        {members.length === 0 ? (
          <EmptyState>条件に一致するメンバーはいません</EmptyState>
        ) : view === "week" ? (
          <WeekGrid members={members} schedules={schedules} onSelect={setSelectedSchedule} />
        ) : view === "day" ? (
          <DayView members={members} schedules={schedules} onSelect={setSelectedSchedule} />
        ) : (
          <MonthView schedules={schedules} members={allMembers} onSelect={setSelectedSchedule} />
        )}

        <div className="calendar-footer">
          <span><i className="legend meeting" />会議</span>
          <span><i className="legend visit" />訪問</span>
          <span><i className="legend work" />作業</span>
          <span><i className="legend vacation" />休暇</span>
          <span><b>◆</b> メモあり</span>
          <span><b>鍵</b> 非公開</span>
        </div>
      </section>

      <aside className="right-rail">
        <TodayCard members={allMembers} schedules={schedules} />
        <MemoCard openMessages={openMessages} />
      </aside>
    </div>
  );
}

function WeekGrid({ members, schedules, onSelect }: { members: Member[]; schedules: ScheduleItem[]; onSelect: (item: ScheduleItem) => void }) {
  return (
    <div className="week-grid-wrap">
      <div className="week-grid" style={{ "--member-count": members.length } as React.CSSProperties}>
        <div className="corner-cell"><span>メンバー</span><small>今週の予定</small></div>
        {weekDays.map((day) => <div className={`day-header ${day.date === "2026-07-24" ? "is-today" : ""}`} key={day.date}><b>{day.weekday}</b><span>{day.day}</span></div>)}
        {members.map((member) => (
          <div className="member-schedule-row" key={member.id}>
            <div className="member-cell">
              <Avatar member={member} small />
              <span><b>{member.name}</b><small><StatusDot status={member.presence} />{member.presence}</small></span>
            </div>
            {weekDays.map((day) => {
              const items = schedules.filter((item) => item.memberId === member.id && item.date === day.date);
              return (
                <div className={`schedule-cell ${day.date === "2026-07-24" ? "is-today" : ""}`} key={day.date}>
                  {items.map((item) => (
                    <button className={`schedule-event category-${item.category}`} key={item.id} onClick={() => onSelect(item)}>
                      <time>{item.start}</time>
                      <strong>{item.private ? "【非】" : ""}{item.title}</strong>
                      {item.memo && <span className="memo-mark">◆</span>}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayView({ members, schedules, onSelect }: { members: Member[]; schedules: ScheduleItem[]; onSelect: (item: ScheduleItem) => void }) {
  const daySchedules = schedules.filter((item) => item.date === "2026-07-24");
  return (
    <div className="day-view">
      <div className="day-view-heading"><span>7月24日（金）</span><small>赤口</small></div>
      {members.map((member) => {
        const items = daySchedules.filter((item) => item.memberId === member.id);
        return (
          <div className="day-member" key={member.id}>
            <div className="day-member-profile"><Avatar member={member} small /><span><b>{member.name}</b><small>{member.group}</small></span></div>
            <div className="day-events">
              {items.length ? items.map((item) => <button key={item.id} onClick={() => onSelect(item)} className={`day-event category-${item.category}`}><time>{item.start}–{item.end}</time><b>{item.title}</b><span>{item.memo || item.category}</span></button>) : <span className="no-plan">予定はありません</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({ schedules, members, onSelect }: { schedules: ScheduleItem[]; members: Member[]; onSelect: (item: ScheduleItem) => void }) {
  const days = Array.from({ length: 35 }, (_, index) => index - 2);
  return (
    <div className="month-view">
      <div className="month-weekdays">{["月", "火", "水", "木", "金", "土", "日"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="month-days">
        {days.map((day, index) => {
          const inMonth = day > 0 && day <= 31;
          const date = inMonth ? `2026-07-${String(day).padStart(2, "0")}` : "";
          const items = schedules.filter((item) => item.date === date).slice(0, 3);
          return (
            <div className={`${!inMonth ? "outside" : ""} ${day === 24 ? "today" : ""}`} key={index}>
              {inMonth && <b>{day}</b>}
              {items.map((item) => {
                const member = members.find((person) => person.id === item.memberId);
                return <button key={item.id} onClick={() => onSelect(item)}><i style={{ background: member?.color }} />{item.start} {item.title}</button>;
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TodayCard({ members, schedules }: { members: Member[]; schedules: ScheduleItem[] }) {
  const todayItems = schedules.filter((item) => item.date === "2026-07-24").slice(0, 3);
  return (
    <section className="rail-card today-card">
      <div className="rail-card-heading"><div><span className="eyebrow">TODAY</span><h2>今日のチーム</h2></div><span className="date-badge"><b>24</b>金</span></div>
      <div className="presence-summary">
        <div><b>{members.filter((member) => member.presence === "在席").length}</b><span>在席</span></div>
        <div><b>{members.filter((member) => ["外出", "会議中", "離席"].includes(member.presence)).length}</b><span>外出・離席</span></div>
        <div><b>{members.filter((member) => member.presence === "休暇").length}</b><span>休暇</span></div>
      </div>
      <div className="today-list">
        {todayItems.map((item) => {
          const member = members.find((person) => person.id === item.memberId)!;
          return <div key={item.id}><Avatar member={member} small /><span><b>{item.start} {item.title}</b><small>{member.name} ・ {item.end}まで</small></span></div>;
        })}
      </div>
    </section>
  );
}

function MemoCard({ openMessages }: { openMessages: () => void }) {
  return (
    <section className="rail-card memo-card">
      <div className="rail-card-heading"><div><span className="eyebrow">MEMO</span><h2>伝言メモ</h2></div><span className="unread-pill">未読 2</span></div>
      <button className="memo-item" onClick={openMessages}>
        <span className="memo-icon">電</span>
        <span><b>山田商事からお電話です</b><small>鈴木 健太 ・ 12:18</small></span>
      </button>
      <button className="memo-item" onClick={openMessages}>
        <span className="memo-icon memo-icon-blue">連</span>
        <span><b>メンテナンスのお知らせ</b><small>高橋 直子 ・ 10:42</small></span>
      </button>
      <button className="text-link" onClick={openMessages}>すべてのメッセージを見る <span>→</span></button>
    </section>
  );
}

function PresencePage({ members, updatePresence, openMessage }: { members: Member[]; updatePresence: (id: string, status: PresenceState) => void; openMessage: () => void }) {
  return (
    <div className="standard-page">
      <div className="page-heading"><div><span className="eyebrow">WHEREABOUTS</span><h1>行き先・在席状況</h1><p>メンバーの現在地と戻り予定を確認できます</p></div></div>
      <div className="summary-strip">
        {presenceOptions.slice(0, 4).map((status) => <div key={status}><StatusDot status={status} /><span>{status}</span><b>{members.filter((member) => member.presence === status).length}</b></div>)}
      </div>
      <div className="presence-grid">
        {members.map((member) => (
          <article className="presence-card" key={member.id}>
            <div className="presence-profile"><Avatar member={member} /><div><span>{member.group}</span><h2>{member.name}</h2></div></div>
            <label className={`presence-select presence-${member.presence}`}><StatusDot status={member.presence} /><select value={member.presence} onChange={(event) => updatePresence(member.id, event.target.value as PresenceState)}>{presenceOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
            <dl><div><dt>行き先</dt><dd>{member.destination ?? "—"}</dd></div><div><dt>戻り予定</dt><dd>{member.returnAt ?? "—"}</dd></div></dl>
            <button onClick={openMessage}>伝言を残す</button>
          </article>
        ))}
      </div>
    </div>
  );
}

function MessagesPage({ messages, selectedMessage, selectMessage, openCompose }: { messages: MessageItem[]; selectedMessage: MessageItem; selectMessage: (message: MessageItem) => void; openCompose: () => void }) {
  return (
    <div className="standard-page messages-page">
      <div className="page-heading"><div><span className="eyebrow">MESSAGES</span><h1>メッセージ・伝言</h1><p>グループや個人への連絡をまとめて確認</p></div><button className="primary-button" onClick={openCompose}>＋ 新規メッセージ</button></div>
      <div className="message-workspace">
        <aside className="message-list">
          <div className="message-filter"><button className="active">受信</button><button>送信済み</button></div>
          {messages.map((message) => (
            <button key={message.id} className={`${selectedMessage.id === message.id ? "active" : ""} ${message.unread ? "unread" : ""}`} onClick={() => selectMessage(message)}>
              <span className={`message-type ${message.kind}`}>{message.kind === "memo" ? "電" : "連"}</span>
              <span><b>{message.subject}</b><small>{message.from} → {message.to}</small><p>{message.body}</p></span>
              <time>{message.time}</time>
            </button>
          ))}
        </aside>
        <article className="message-detail">
          <div className="message-detail-top"><span className={`message-type large ${selectedMessage.kind}`}>{selectedMessage.kind === "memo" ? "電" : "連"}</span><div><small>{selectedMessage.kind === "memo" ? "伝言メモ" : "メッセージ"}</small><h2>{selectedMessage.subject}</h2></div><button aria-label="その他の操作">•••</button></div>
          <div className="message-meta"><span><b>差出人</b>{selectedMessage.from}</span><span><b>宛先</b>{selectedMessage.to}</span><time>{selectedMessage.time}</time></div>
          <p className="message-body">{selectedMessage.body}</p>
          <div className="message-actions"><button onClick={openCompose}>↩ 返信する</button><button>✓ 確認済みにする</button></div>
        </article>
      </div>
    </div>
  );
}

function MembersPage({ members, openMessage }: { members: Member[]; openMessage: () => void }) {
  return (
    <div className="standard-page">
      <div className="page-heading"><div><span className="eyebrow">MEMBERS</span><h1>メンバー一覧</h1><p>所属・連絡先・在席状況を確認</p></div><span className="count-badge">{members.length}名</span></div>
      <div className="members-table-wrap">
        <table className="members-table">
          <thead><tr><th>メンバー</th><th>所属</th><th>在席状況</th><th>行き先</th><th>連絡先</th><th /></tr></thead>
          <tbody>{members.map((member) => <tr key={member.id}><td><Avatar member={member} small /><b>{member.name}</b></td><td>{member.group}</td><td><span className={`table-status presence-${member.presence}`}><StatusDot status={member.presence} />{member.presence}</span></td><td>{member.destination ?? "—"}</td><td><span>{member.phone}</span><small>{member.email}</small></td><td><button onClick={openMessage}>伝言</button></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function ModalShell({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><button onClick={onClose} aria-label="閉じる">×</button></header>
        {children}
      </section>
    </div>
  );
}

function ScheduleModal({ members, onClose, onSubmit }: { members: Member[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <ModalShell title="予定を登録" eyebrow="NEW SCHEDULE" onClose={onClose}>
      <form onSubmit={onSubmit} className="modal-form">
        <label className="field full"><span>件名</span><input name="title" autoFocus placeholder="例：プロジェクト定例会" required /></label>
        <label className="field full"><span>メンバー</span><select name="memberId" defaultValue="m1">{members.map((member) => <option value={member.id} key={member.id}>{member.name}（{member.group}）</option>)}</select></label>
        <label className="field"><span>日付</span><input name="date" type="date" defaultValue="2026-07-24" required /></label>
        <label className="field"><span>種類</span><select name="category" defaultValue="会議">{categoryLabels.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label className="field"><span>開始</span><input name="start" type="time" defaultValue="13:00" required /></label>
        <label className="field"><span>終了</span><input name="end" type="time" defaultValue="14:00" required /></label>
        <label className="field full"><span>メモ</span><textarea name="memo" placeholder="場所、持ち物、共有事項など" rows={3} /></label>
        <label className="check-field full"><input name="private" type="checkbox" /><span><b>非公開にする</b><small>他のメンバーには予定があることだけを表示します</small></span></label>
        <footer><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button className="primary-button" type="submit">予定を登録</button></footer>
      </form>
    </ModalShell>
  );
}

function MessageModal({ members, onClose, onSubmit }: { members: Member[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <ModalShell title="メッセージを作成" eyebrow="NEW MESSAGE" onClose={onClose}>
      <form onSubmit={onSubmit} className="modal-form">
        <label className="field"><span>種類</span><select name="kind"><option value="message">メッセージ</option><option value="memo">伝言メモ</option></select></label>
        <label className="field"><span>宛先</span><select name="to"><option>全員</option><option>営業部</option><option>開発部</option><option>管理部</option>{members.map((member) => <option key={member.id}>{member.name}</option>)}</select></label>
        <label className="field full"><span>件名</span><input name="subject" autoFocus placeholder="連絡内容を入力" required /></label>
        <label className="field full"><span>本文</span><textarea name="body" rows={5} placeholder="メッセージを入力してください" /></label>
        <footer><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button className="primary-button" type="submit">送信する</button></footer>
      </form>
    </ModalShell>
  );
}

function ScheduleDetail({ item, member, onClose }: { item: ScheduleItem; member?: Member; onClose: () => void }) {
  return (
    <ModalShell title={item.private ? `【非公開】${item.title}` : item.title} eyebrow="SCHEDULE DETAIL" onClose={onClose}>
      <div className="schedule-detail">
        {member && <div className="detail-member"><Avatar member={member} /><span><b>{member.name}</b><small>{member.group}</small></span></div>}
        <dl><div><dt>日時</dt><dd>2026年7月{Number(item.date.slice(-2))}日　{item.start} — {item.end}</dd></div><div><dt>種類</dt><dd><span className={`detail-category category-${item.category}`}>{item.category}</span></dd></div><div><dt>メモ</dt><dd>{item.memo || "メモはありません"}</dd></div><div><dt>公開範囲</dt><dd>{item.private ? "本人のみ（非公開）" : "グループ全員"}</dd></div></dl>
        <footer><button className="secondary-button" onClick={onClose}>閉じる</button><button className="primary-button" onClick={onClose}>編集する</button></footer>
      </div>
    </ModalShell>
  );
}
