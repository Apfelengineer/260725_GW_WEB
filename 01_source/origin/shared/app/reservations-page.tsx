/**
 * 試験室3室の空き状況を、共有スケジュールから直近3か月分へ集計する公開画面です。
 */

import { useEffect, useMemo, useState } from "react";
import { japaneseHolidays } from "./lib/group-watcher-api";
import "./reservations.css";
import { japanToday, validatePublicAvailability, type PublicRoom, type PublicStatus } from "./lib/public-availability";

const defaultRooms: Array<PublicRoom & { description?: string }> = [
  { id: "m6", name: "電波暗室", image: "m6.png", description: "" },
  { id: "m7", name: "電磁波妨害評価装置(G-TEM)", image: "m7.png", description: "" },
  { id: "m8", name: "パルスサージシステム", image: "m8.png", description: "(入力インパルス試験機、静電気試験機、サージイミュニティ試験機、FTB試験機、低周波EMC試験機)" },
];
const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
}

function MonthCalendar({ month, availability }: { month: Date; availability: Record<string, PublicStatus> }) {
  // 月初の曜日に合わせて空セルを補い、日曜始まりの7列カレンダーを構成します。
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12).getDate();
  const cells: Array<Date | null> = Array.from({ length: first.getDay() }, () => null);
  for (let day = 1; day <= lastDay; day += 1) cells.push(new Date(month.getFullYear(), month.getMonth(), day, 12));
  while (cells.length % 7) cells.push(null);

  const businessDays = cells.filter((date): date is Date => Boolean(date) && date!.getDay() !== 0 && date!.getDay() !== 6 && !japaneseHolidays.some((holiday) => holiday.date === dateKey(date!)));
  const fullyBooked = businessDays.length > 0 && businessDays.every((date) => {
    // 土日祝を除く全営業日が埋まった月だけ、キャンセル待ち表示を重ねます。
    const status = availability[dateKey(date)];
    return status === "maintenance" || status === "reserved";
  });

  return (
    <article className={`reservation-month ${fullyBooked ? "sold-out-month" : ""}`}>
      <h2>{month.getFullYear()}年 {month.getMonth() + 1}月</h2>
      <div className="reservation-weekdays">{weekdays.map((day, index) => <b className={index === 0 ? "sunday" : index === 6 ? "saturday" : ""} key={day}>{day}</b>)}</div>
      <div className="reservation-days">
        {cells.map((date, index) => {
          if (!date) return <span className="empty-day" key={`empty-${index}`} />;
          const key = dateKey(date);
          const holiday = japaneseHolidays.find((item) => item.date === key);
          const status = availability[key];
          const reserved = status === "reserved";
          const statusMarker = status === "maintenance" ? "ー" : status === "morning_available" ? "▲" : status === "afternoon_available" ? "▼" : "";
          // 平日は記号を表示し、土日祝は予約状態にかかわらず日付だけを残します。
          const nonBusinessDay = date.getDay() === 0 || date.getDay() === 6 || Boolean(holiday);
          const marker = nonBusinessDay ? "" : statusMarker;
          const hideDate = !nonBusinessDay && (status === "maintenance" || Boolean(marker));
          return (
            <span className={`reservation-day ${date.getDay() === 6 ? "saturday" : ""} ${date.getDay() === 0 || holiday ? "sunday holiday" : ""} ${reserved ? "reserved" : ""} ${status === "maintenance" ? "maintenance" : ""} ${hideDate ? "marker-only" : ""}`} key={key} title={holiday?.name ?? ""}>
              {!hideDate && <b>{date.getDate()}</b>}
              <i>{marker}</i>
            </span>
          );
        })}
      </div>
      {fullyBooked && <div className="sold-out-overlay"><strong>予約済み</strong><span>（キャンセル待ち）</span></div>}
    </article>
  );
}

export default function ReservationsPage() {
  const [rooms, setRooms] = useState(defaultRooms);
  const [availability, setAvailability] = useState<Record<string, Record<string, PublicStatus>>>({});
  const [updatedAt, setUpdatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [range, setRange] = useState({ start: "", end: "" });
  const [now, setNow] = useState(Date.now);
  const [failedImageRoomId, setFailedImageRoomId] = useState("");
  const requestedRoom = new URLSearchParams(window.location.search).get("room") || "m6";
  const room = rooms.find((item) => item.id === requestedRoom) ?? rooms[0] ?? defaultRooms[0];
  const roomId = room.id;
  const months = useMemo(() => Array.from({ length: 3 }, (_, index) => addMonths(japanToday(now), index)), [now]);
  const imageVersion = useMemo(() => Date.now(), []);

  useEffect(() => {
    document.title = `${room.name} 空き状況 | KPTC Scheduler`;
  }, [room.name]);

  useEffect(() => {
    let active = true;
    let loaded = false;
    let refreshing = false;
    const controller = new AbortController();
    async function refresh() {
      if (refreshing) return;
      refreshing = true;
      try {
        const response = await fetch("./data/public-availability.json", { cache: "no-store", credentials: "omit", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("公開JSONを取得できません");
        const text = await response.text();
        if (text.length > 131072) throw new Error("公開JSONが大きすぎます");
        const payload = validatePublicAvailability(JSON.parse(text));
        if (!active) return;
        loaded = true;
        setAvailability(payload.availability);
        setRooms(payload.rooms);
        setUpdatedAt(payload.updatedAt);
        setRange({ start: payload.rangeStart, end: payload.rangeEnd });
        setError("");
        setRefreshFailed(false);
      } catch {
        if (!active) return;
        if (!loaded) setError("空き情報を準備中、または取得できません。時間をおいて再読み込みしてください。");
        setRefreshFailed(true);
      } finally { refreshing = false; if (active) { setLoading(false); setNow(Date.now()); } }
    }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, []);

  const finalMonth = months[2];
  const finalDay = new Date(finalMonth.getFullYear(), finalMonth.getMonth() + 1, 0, 12);
  const periodMissing = Boolean(updatedAt) && (range.start > dateKey(months[0]) || range.end < dateKey(finalDay));
  const stale = Boolean(updatedAt) && now - Date.parse(updatedAt) > 1800000;
  return (
    <main className="reservation-page">
      <section className="reservation-board">
        <header className="reservation-header">
          <span className="room-emblem">{failedImageRoomId === roomId ? <b className="room-image-fallback">{room.name.slice(0, 2)}</b> : <img key={roomId} src={`./${room.image}?v=${imageVersion}`} alt={`${room.name}の設備写真`} onError={() => setFailedImageRoomId(roomId)} />}</span>
          <div><h1>{room.name} 空き状況</h1>{room.description && <p className="equipment-note">{room.description}</p>}</div>
          <time>更新：{updatedAt ? new Date(updatedAt).toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</time>
        </header>

        <nav className="room-switch" aria-label="試験室の切り替え">
          {rooms.map((item) => <a className={item.id === roomId ? "active" : ""} href={`?room=${item.id}`} key={item.id}>{item.name}</a>)}
        </nav>

        <div className="reception-period">受付期間：{finalMonth.getFullYear()}年 {finalMonth.getMonth() + 1}月末まで</div>

        {!loading && !error && (stale || refreshFailed) && <div className="reservation-message warning" role="status">更新が遅れています。表示は最後に取得できた情報です。最新状況はお問い合わせください。</div>}
        {loading ? <div className="reservation-message">公開用の空き情報を読み込んでいます…</div> : error || periodMissing ? <div className="reservation-message error">{error || "当月を含む3か月分の情報を準備しています。最新状況はお問い合わせください。"}</div> : (
          <div className="reservation-months">{months.map((month) => <MonthCalendar month={month} availability={availability[roomId] ?? {}} key={`${month.getFullYear()}-${month.getMonth()}`} />)}</div>
        )}

        <div className="reservation-legend">
          <span><i className="legend-box full" />予約済み</span>
          <span><i className="legend-box open" />予約なし</span>
          <span><b className="up">▲</b>午前空きあり</span>
          <span><b className="down">▼</b>午後空きあり</span>
          <span><b>ー</b>メンテナンス</span>
        </div>

        <div className="reservation-contact"><strong>ご予約・お問い合わせ:denki@kptc.jp/075-315-8634</strong><small>ご利用の際には必ずメールか電話でお問い合わせをお願いします。</small></div>

        <footer>{/* 添付のロゴ画像を公開画面のフッターへ表示します。 */}
          <img src="./technology-center-logo-white.png" alt="技術センター" />
        </footer>
      </section>
    </main>
  );
}
