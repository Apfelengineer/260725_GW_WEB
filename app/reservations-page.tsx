/**
 * 試験室3室の空き状況を、共有スケジュールから直近3か月分へ集計する公開画面です。
 */

import { useEffect, useMemo, useState } from "react";
import { japaneseHolidays } from "./lib/group-watcher-api";
import "./reservations.css";

const roomIds = ["m6", "m7", "m8"];
type PublicRoom = { id: string; name: string; initials: string };
type PublicStatus = "morning_available" | "afternoon_available" | "reserved" | "maintenance";
type PublicAvailabilityResponse = {
  schemaVersion: number;
  updatedAt: string;
  rangeStart: string;
  rangeEnd: string;
  availability: Record<string, Record<string, PublicStatus>>;
};

const rooms: PublicRoom[] = [
  { id: "m6", name: "電波暗室", initials: "電波" },
  { id: "m7", name: "電磁波妨害評価装置(G-TEM)", initials: "G-TEM" },
  { id: "m8", name: "パルスサージシステム", initials: "サージ" },
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
          const marker = status === "maintenance" ? "ー" : status === "morning_available" ? "▲" : status === "afternoon_available" ? "▼" : "";
          const hideDate = status === "maintenance" || Boolean(marker);
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
  const [availability, setAvailability] = useState<Record<string, Record<string, PublicStatus>>>({});
  const [updatedAt, setUpdatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestedRoom = new URLSearchParams(window.location.search).get("room") || "m6";
  const roomId = roomIds.includes(requestedRoom) ? requestedRoom : "m6";
  const room = rooms.find((item) => item.id === roomId)!;
  const months = useMemo(() => Array.from({ length: 3 }, (_, index) => addMonths(new Date(), index)), []);

  useEffect(() => {
    document.title = `${room.name} 空き状況 | KPTC Scheduler`;
    fetch("./public-availability.php", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        const payload = await response.json() as PublicAvailabilityResponse | { error?: string };
        if (!response.ok || !("availability" in payload)) throw new Error("error" in payload ? payload.error : "公開用データを取得できません");
        setAvailability(payload.availability);
        setUpdatedAt(payload.updatedAt);
      })
      .catch(() => setError("空き情報を取得できませんでした。時間をおいて再読み込みしてください。"))
      .finally(() => setLoading(false));
  }, [room.name]);

  const finalMonth = months[2];
  return (
    <main className="reservation-page">
      <section className="reservation-board">
        <header className="reservation-header">
          <span className="room-emblem">{room.initials}</span>
          <div><h1>{room.name} 空き状況</h1>{roomId === "m8" && <p className="equipment-note">(入力インパルス試験機、静電気試験機、サージイミュニティ試験機、FTB試験機、低周波EMC試験機)</p>}</div>
          <time>更新：{updatedAt ? new Date(updatedAt).toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</time>
        </header>

        <nav className="room-switch" aria-label="試験室の切り替え">
          {rooms.map((item) => <a className={item.id === roomId ? "active" : ""} href={`?room=${item.id}`} key={item.id}>{item.name}</a>)}
        </nav>

        <div className="reception-period">受付期間：{finalMonth.getFullYear()}年 {finalMonth.getMonth() + 1}月末まで</div>

        {loading ? <div className="reservation-message">公開用の空き情報を読み込んでいます…</div> : error ? <div className="reservation-message error">{error}</div> : (
          <div className="reservation-months">{months.map((month) => <MonthCalendar month={month} availability={availability[roomId] ?? {}} key={`${month.getFullYear()}-${month.getMonth()}`} />)}</div>
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
