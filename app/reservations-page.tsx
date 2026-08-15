/**
 * 試験室3室の空き状況を、共有スケジュールから直近3か月分へ集計する公開画面です。
 */

import { useEffect, useMemo, useState } from "react";
import { groupWatcherApi, japaneseHolidays, type Member, type ScheduleItem } from "./lib/group-watcher-api";
import "./reservations.css";

const roomIds = ["m6", "m7", "m8"];
const fallbackRooms: Pick<Member, "id" | "name" | "initials">[] = [
  { id: "m6", name: "電波暗室", initials: "電波" },
  { id: "m7", name: "電磁波妨害評価装置(G-TEM)", initials: "G-TEM" },
  { id: "m8", name: "パルスサージシステム", initials: "サージ" },
];
const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, amount: number) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  result.setDate(result.getDate() + amount);
  return result;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
}

function daysBetween(from: string, to: string) {
  return Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000);
}

function occursOn(item: ScheduleItem, targetKey: string) {
  // メイン予定表と同じ規則で、複数日・繰り返し予定が対象日に該当するか判定します。
  const duration = Math.max(0, daysBetween(item.date, item.endDate || item.date));
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
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12).getDate();
    const occurrence = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(start.getDate(), last), 12);
    if (dateKey(occurrence) > repeatUntil) break;
    if (targetKey >= dateKey(occurrence) && targetKey <= dateKey(addDays(occurrence, duration))) return true;
  }
  return false;
}

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

type DayStatus = { morning: boolean; afternoon: boolean; maintenance: boolean };

function dayStatus(schedules: ScheduleItem[], roomId: string, key: string): DayStatus {
  // 機器利用・キャンセル待ちを午前／午後へ集計し、機器点検はメンテナンスとして優先します。
  const items = schedules.filter((item) => item.memberId === roomId && occursOn(item, key));
  if (items.some((item) => item.category === "機器点検")) return { morning: false, afternoon: false, maintenance: true };
  const bookings = items.filter((item) => item.category === "機器利用" || item.category === "キャンセル待ち");
  return {
    morning: bookings.some((item) => minutes(item.start) < 12 * 60 && minutes(item.end) > 9 * 60),
    afternoon: bookings.some((item) => minutes(item.start) < 17 * 60 && minutes(item.end) > 13 * 60),
    maintenance: false,
  };
}

function MonthCalendar({ month, roomId, schedules }: { month: Date; roomId: string; schedules: ScheduleItem[] }) {
  // 月初の曜日に合わせて空セルを補い、日曜始まりの7列カレンダーを構成します。
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12).getDate();
  const cells: Array<Date | null> = Array.from({ length: first.getDay() }, () => null);
  for (let day = 1; day <= lastDay; day += 1) cells.push(new Date(month.getFullYear(), month.getMonth(), day, 12));
  while (cells.length % 7) cells.push(null);

  const businessDays = cells.filter((date): date is Date => Boolean(date) && date!.getDay() !== 0 && date!.getDay() !== 6 && !japaneseHolidays.some((holiday) => holiday.date === dateKey(date!)));
  const fullyBooked = businessDays.length > 0 && businessDays.every((date) => {
    // 土日祝を除く全営業日が埋まった月だけ、キャンセル待ち表示を重ねます。
    const status = dayStatus(schedules, roomId, dateKey(date));
    return status.maintenance || (status.morning && status.afternoon);
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
          const status = dayStatus(schedules, roomId, key);
          const reserved = status.morning && status.afternoon;
          const marker = status.maintenance ? "ー" : reserved ? "" : status.morning ? "▼" : status.afternoon ? "▲" : "";
          const hideDate = status.maintenance || Boolean(marker);
          return (
            <span className={`reservation-day ${date.getDay() === 6 ? "saturday" : ""} ${date.getDay() === 0 || holiday ? "sunday holiday" : ""} ${reserved ? "reserved" : ""} ${status.maintenance ? "maintenance" : ""} ${hideDate ? "marker-only" : ""}`} key={key} title={holiday?.name ?? ""}>
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
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [rooms, setRooms] = useState<Pick<Member, "id" | "name" | "initials">[]>(fallbackRooms);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestedRoom = new URLSearchParams(window.location.search).get("room") || "m6";
  const roomId = roomIds.includes(requestedRoom) ? requestedRoom : "m6";
  const room = rooms.find((item) => item.id === roomId) ?? fallbackRooms.find((item) => item.id === roomId)!;
  const months = useMemo(() => Array.from({ length: 3 }, (_, index) => addMonths(new Date(), index)), []);

  useEffect(() => {
    document.title = `${room.name} 空き状況 | KPTC Scheduler`;
    groupWatcherApi.bootstrap().then((payload) => {
      setSchedules(payload.state.schedules);
      const dbRooms = payload.state.members.filter((member) => roomIds.includes(member.id));
      if (dbRooms.length === 3) setRooms(dbRooms.map((member) => {
        const display = fallbackRooms.find((item) => item.id === member.id);
        return { ...member, name: display?.name ?? member.name, initials: display?.initials ?? member.initials };
      }));
    }).catch(() => setError("予約データを取得できませんでした。時間をおいて再読み込みしてください。"))
      .finally(() => setLoading(false));
  }, [room.name]);

  const finalMonth = months[2];
  return (
    <main className="reservation-page">
      <section className="reservation-board">
        <header className="reservation-header">
          <span className="room-emblem">{room.initials}</span>
          <div><small>KPTC SCHEDULER / LAB AVAILABILITY</small><h1>{room.name} 空き状況</h1>{roomId === "m8" && <p className="equipment-note">(入力インパルス試験機、静電気試験機、サージイミュニティ試験機、FTB試験機、低周波EMC試験機)</p>}</div>
          <time>更新：{new Date().toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
        </header>

        <nav className="room-switch" aria-label="試験室の切り替え">
          {rooms.map((item) => <a className={item.id === roomId ? "active" : ""} href={`?room=${item.id}`} key={item.id}>{item.name}</a>)}
        </nav>

        <div className="reception-period">受付期間：{finalMonth.getFullYear()}年 {finalMonth.getMonth() + 1}月末まで</div>

        {loading ? <div className="reservation-message">GWの予約情報を読み込んでいます…</div> : error ? <div className="reservation-message error">{error}</div> : (
          <div className="reservation-months">{months.map((month) => <MonthCalendar month={month} roomId={roomId} schedules={schedules} key={`${month.getFullYear()}-${month.getMonth()}`} />)}</div>
        )}

        <div className="reservation-legend">
          <span><i className="legend-box full" />予約済み</span>
          <span><i className="legend-box open" />予約なし</span>
          <span><b className="up">▲</b>午前空きあり</span>
          <span><b className="down">▼</b>午後空きあり</span>
          <span><b>ー</b>メンテナンス</span>
        </div>

        <div className="reservation-contact"><strong>ご予約・お問い合わせ:xxx@yyy/075-xxx-xxxx</strong><small>ご利用の際には必ずメールか電話でお問い合わせをお願いします。</small></div>

        <footer>{/* 静的なSakura向けViteページのため、添付PNGを直接表示します。 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="./technology-center-logo-white.png" alt="技術センター" />
        </footer>
      </section>
    </main>
  );
}
