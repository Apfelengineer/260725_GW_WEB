export type PresenceState = "在席" | "外出" | "会議中" | "休暇" | "離席";

export type Member = {
  id: string;
  name: string;
  group: "営業部" | "開発部" | "管理部";
  initials: string;
  color: string;
  presence: PresenceState;
  destination?: string;
  returnAt?: string;
  phone: string;
  email: string;
};

export type ScheduleItem = {
  id: string;
  memberId: string;
  date: string;
  start: string;
  end: string;
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

export type MessageItem = {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  time: string;
  unread?: boolean;
  kind: "message" | "memo";
};

export const groups = ["すべてのグループ", "営業部", "開発部", "管理部"] as const;

export const demoCategories: ScheduleCategory[] = [
  { id: "cat-meeting", name: "会議", color: "#5086bd" },
  { id: "cat-visit", name: "訪問", color: "#e87556" },
  { id: "cat-work", name: "作業", color: "#209885" },
  { id: "cat-vacation", name: "休暇", color: "#9a83c8" },
  { id: "cat-other", name: "その他", color: "#d09839" },
];

export const demoMembers: Member[] = [
  {
    id: "m1",
    name: "佐藤 美咲",
    group: "営業部",
    initials: "佐",
    color: "#e96f51",
    presence: "外出",
    destination: "丸の内・山田商事",
    returnAt: "16:30",
    phone: "03-1234-5678",
    email: "misaki.sato@example.jp",
  },
  {
    id: "m2",
    name: "鈴木 健太",
    group: "営業部",
    initials: "鈴",
    color: "#3c82c8",
    presence: "在席",
    destination: "本社 3F",
    phone: "03-1234-5681",
    email: "kenta.suzuki@example.jp",
  },
  {
    id: "m3",
    name: "高橋 直子",
    group: "開発部",
    initials: "高",
    color: "#8a67c8",
    presence: "会議中",
    destination: "第2会議室",
    returnAt: "14:00",
    phone: "03-1234-5686",
    email: "naoko.takahashi@example.jp",
  },
  {
    id: "m4",
    name: "田中 悠真",
    group: "開発部",
    initials: "田",
    color: "#268b7d",
    presence: "離席",
    destination: "休憩中",
    returnAt: "13:30",
    phone: "03-1234-5688",
    email: "yuma.tanaka@example.jp",
  },
  {
    id: "m5",
    name: "伊藤 由紀",
    group: "管理部",
    initials: "伊",
    color: "#d18b2f",
    presence: "休暇",
    destination: "終日休暇",
    phone: "03-1234-5692",
    email: "yuki.ito@example.jp",
  },
];

export const demoSchedules: ScheduleItem[] = [
  { id: "s1", memberId: "m1", date: "2026-07-20", start: "09:30", end: "10:30", title: "営業定例", category: "会議", memo: "週次の案件レビュー" },
  { id: "s2", memberId: "m1", date: "2026-07-21", start: "13:00", end: "15:00", title: "山田商事 訪問", category: "訪問" },
  { id: "s3", memberId: "m1", date: "2026-07-23", start: "11:00", end: "12:00", title: "提案書レビュー", category: "作業" },
  { id: "s4", memberId: "m2", date: "2026-07-20", start: "10:00", end: "11:00", title: "新規案件MTG", category: "会議" },
  { id: "s5", memberId: "m2", date: "2026-07-22", start: "14:30", end: "16:30", title: "江東物流 訪問", category: "訪問", memo: "見積書を持参" },
  { id: "s6", memberId: "m2", date: "2026-07-24", start: "09:00", end: "11:30", title: "月次レポート", category: "作業" },
  { id: "s7", memberId: "m3", date: "2026-07-20", start: "13:00", end: "14:00", title: "開発スプリント計画", category: "会議" },
  { id: "s8", memberId: "m3", date: "2026-07-21", start: "10:00", end: "12:00", title: "API設計", category: "作業", memo: "認証方式を確定" },
  { id: "s9", memberId: "m3", date: "2026-07-23", start: "15:00", end: "16:00", title: "リリース判定", category: "会議", private: true },
  { id: "s10", memberId: "m4", date: "2026-07-21", start: "09:30", end: "11:30", title: "画面実装", category: "作業" },
  { id: "s11", memberId: "m4", date: "2026-07-22", start: "13:30", end: "14:30", title: "コードレビュー", category: "会議" },
  { id: "s12", memberId: "m4", date: "2026-07-24", start: "10:00", end: "12:00", title: "データ移行検証", category: "作業" },
  { id: "s13", memberId: "m5", date: "2026-07-21", start: "09:00", end: "18:00", title: "有給休暇", category: "休暇", private: true },
  { id: "s14", memberId: "m5", date: "2026-07-23", start: "10:00", end: "11:00", title: "採用面談", category: "会議" },
];

export const demoMessages: MessageItem[] = [
  {
    id: "msg1",
    from: "鈴木 健太",
    to: "自分",
    subject: "山田商事からお電話です",
    body: "折り返しをご希望です。16時頃までご在席とのことでした。",
    time: "12:18",
    unread: true,
    kind: "memo",
  },
  {
    id: "msg2",
    from: "高橋 直子",
    to: "営業部",
    subject: "メンテナンスのお知らせ",
    body: "本日18:30から約30分、検証環境の更新を行います。",
    time: "10:42",
    unread: true,
    kind: "message",
  },
  {
    id: "msg3",
    from: "伊藤 由紀",
    to: "全員",
    subject: "来週の全社会議について",
    body: "資料は前日までに共有フォルダへ格納してください。",
    time: "昨日",
    kind: "message",
  },
];

/**
 * API 接続の差し替え口です。
 * 実API受領後は、UIを変更せずこのオブジェクトの実装を HTTP 通信へ置き換えます。
 */
export const groupWatcherApi = {
  async getMembers() {
    return demoMembers;
  },
  async getSchedules() {
    return demoSchedules;
  },
  async getMessages() {
    return demoMessages;
  },
};
