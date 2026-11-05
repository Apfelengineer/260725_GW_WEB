export type PublicStatus = "morning_available" | "afternoon_available" | "reserved" | "maintenance";
export type PublicRoom = { id: string; name: string; image: string; description: string };
export type PublicAvailability = {
  schemaVersion: 2;
  sourceVersion: number;
  updatedAt: string;
  rangeStart: string;
  rangeEnd: string;
  rooms: PublicRoom[];
  availability: Record<string, Record<string, PublicStatus>>;
};

export function japanToday(now = Date.now()): Date {
  const shifted = new Date(now + 9 * 60 * 60 * 1000);
  return new Date(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 12);
}

export function validatePublicAvailability(value: unknown): PublicAvailability {
  if (!value || typeof value !== "object") throw new Error("公開データの形式が不正です");
  const payload = value as PublicAvailability;
  const keys = ["schemaVersion", "sourceVersion", "updatedAt", "rangeStart", "rangeEnd", "rooms", "availability"];
  if (Object.keys(payload).length !== keys.length || keys.some(key => !(key in payload)) || payload.schemaVersion !== 2 || !Number.isInteger(payload.sourceVersion) || payload.sourceVersion < 1) throw new Error("公開データの項目が不正です");
  if (typeof payload.updatedAt !== "string" || !Number.isFinite(Date.parse(payload.updatedAt)) || Date.parse(payload.updatedAt) > Date.now() + 300000) throw new Error("公開データの更新日時が不正です");
  const dateValid = (date: unknown): date is string => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  if (!dateValid(payload.rangeStart) || !dateValid(payload.rangeEnd) || payload.rangeStart > payload.rangeEnd || (Date.parse(payload.rangeEnd) - Date.parse(payload.rangeStart)) / 86400000 > 92) throw new Error("公開データの表示期間が不正です");
  if (!Array.isArray(payload.rooms) || payload.rooms.length < 1 || payload.rooms.length > 32 || !payload.availability || typeof payload.availability !== "object" || Array.isArray(payload.availability)) throw new Error("試験室の構成が不正です");
  const ids = new Set<string>();
  const states: string[] = ["morning_available", "afternoon_available", "reserved", "maintenance"];
  for (const room of payload.rooms) {
    if (!room || Object.keys(room).sort().join(",") !== "description,id,image,name" || typeof room.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(room.id) || ids.has(room.id) || typeof room.name !== "string" || !room.name.trim() || typeof room.description !== "string" || typeof room.image !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}\.png$/.test(room.image)) throw new Error("試験室情報が不正です");
    ids.add(room.id);
    const days = payload.availability[room.id];
    if (!days || typeof days !== "object" || (Array.isArray(days) && days.length !== 0)) throw new Error("空き状況が不正です");
    for (const [day, state] of Object.entries(days)) {
      if (!dateValid(day) || day < payload.rangeStart || day > payload.rangeEnd || !states.includes(state)) throw new Error("空き状況の日付・状態が不正です");
    }
  }
  if (Object.keys(payload.availability).length !== ids.size || Object.keys(payload.availability).some(id => !ids.has(id))) throw new Error("試験室の構成が不正です");
  return payload;
}
