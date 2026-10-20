import type { AuthenticatedBootstrapResponse, SharedState, SharedStateDelta } from "./group-watcher-api";

export type SyncStatus = "saved" | "saving" | "offline";
export type Mutation = { action: string; summary: string; successMessage?: string };

// オブジェクトの項目順だけの違いは無視し、配列の表示順は変更として扱います。
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

export function stateDelta(base: SharedState, next: SharedState): SharedStateDelta {
  const previous = new Map(base.schedules.map(item => [item.id, item]));
  const current = new Set(next.schedules.map(item => item.id));
  return {
    scheduleUpserts: next.schedules.filter(item => !equal(previous.get(item.id), item)),
    scheduleDeleteIds: base.schedules.filter(item => !current.has(item.id)).map(item => item.id),
    ...(!equal(base.members, next.members) ? { members: next.members } : {}),
    ...(!equal(base.categories, next.categories) ? { categories: next.categories } : {}),
  };
}

export function hasChanges(delta: SharedStateDelta): boolean {
  return delta.scheduleUpserts.length > 0 || delta.scheduleDeleteIds.length > 0 || delta.members !== undefined || delta.categories !== undefined;
}

// 通信中に追加・編集・削除された分だけを応答へ重ね、未保存の操作を消さないようにします。
export function applyDelta(base: SharedState, delta: SharedStateDelta): SharedState {
  const schedules = new Map(base.schedules.map(item => [item.id, item]));
  for (const id of delta.scheduleDeleteIds) schedules.delete(id);
  for (const item of delta.scheduleUpserts) schedules.set(item.id, item);
  return { members: delta.members ?? base.members, categories: delta.categories ?? base.categories, schedules: [...schedules.values()] };
}

type Options = {
  save: (delta: SharedStateDelta, payload: AuthenticatedBootstrapResponse, mutation: Mutation) => Promise<AuthenticatedBootstrapResponse>;
  bootstrap: () => Promise<AuthenticatedBootstrapResponse>;
  onApply: (payload: AuthenticatedBootstrapResponse, visible: SharedState) => void;
  onStatus: (status: SyncStatus) => void;
  onSaved: (mutation: Mutation) => void;
  onError: (message: string) => void;
  delay?: number;
};

/** 保存と管理操作を同じ待機列で実行し、実行時点の版番号・CSRFを必ず使用します。 */
export class SchedulerSync {
  private options: Options;
  private payload: AuthenticatedBootstrapResponse | null = null;
  private local: SharedState | null = null;
  private mutation: Mutation = { action: "更新", summary: "共有データを更新" };
  private queue: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private failed = false;
  private writing = false;

  constructor(options: Options) { this.options = options; }

  initialize(payload: AuthenticatedBootstrapResponse): void {
    this.payload = payload;
    this.local = payload.state;
    this.failed = false;
    this.options.onApply(payload, payload.state);
    this.options.onStatus("saved");
  }

  get dirty(): boolean {
    return this.payload !== null && this.local !== null && hasChanges(stateDelta(this.payload.state, this.local));
  }

  get pending(): boolean { return this.dirty || this.writing; }

  update(state: SharedState, mutation: Mutation): void {
    if (!this.payload || !this.local || equal(state, this.local)) return;
    this.local = state;
    this.mutation = mutation;
    this.cancelTimer();
    if (this.failed) return;
    this.options.onStatus(this.pending ? "saving" : "saved");
    if (this.dirty) this.timer = setTimeout(() => { void this.enqueue(() => this.flush()).catch(() => {}); }, this.options.delay ?? 260);
  }

  cancelTimer(): void { clearTimeout(this.timer); this.timer = undefined; }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation);
    // 失敗を次の操作へ持ち越して待機列全体を停止させないようにします。
    this.queue = next.catch(() => {});
    return next;
  }

  private accept(payload: AuthenticatedBootstrapResponse, sent: SharedState): void {
    const pending = stateDelta(sent, this.local!);
    this.payload = payload;
    this.local = applyDelta(payload.state, pending);
    this.options.onApply(payload, this.local);
  }

  private fail(error: unknown): never {
    const failure = error as { status?: number; payload?: AuthenticatedBootstrapResponse; message?: string };
    if (failure.payload?.state && this.payload && this.local) {
      // 他の利用者との競合でも手元の変更を保持し、再試行は利用者に委ねます。
      const pending = stateDelta(this.payload.state, this.local);
      this.payload = failure.payload;
      this.local = applyDelta(failure.payload.state, pending);
      this.options.onApply(failure.payload, this.local);
    }
    this.failed = true;
    this.cancelTimer();
    this.options.onStatus("offline");
    this.options.onError(failure.status === 409 ? "他の利用者による更新がありました。未保存の変更は保持しています。「再試行」で保存してください。" : `${failure.message || "共有保存に失敗しました"}。未保存の変更は保持しています。`);
    throw error;
  }

  private async flush(): Promise<void> {
    if (this.failed) throw new Error("未保存の変更があります。「再試行」で接続と保存を確認してください");
    let saved: Mutation | undefined;
    while (this.payload && this.local && this.dirty) {
      const sent = this.local;
      const delta = stateDelta(this.payload.state, sent);
      const mutation = this.mutation;
      this.options.onStatus("saving");
      this.writing = true;
      try {
        const payload = await this.options.save(delta, this.payload, mutation);
        this.accept(payload, sent);
        saved = mutation;
      } catch (error) { this.fail(error); }
      finally { this.writing = false; }
    }
    this.options.onStatus("saved");
    if (saved) this.options.onSaved(saved);
  }

  command(request: (payload: AuthenticatedBootstrapResponse) => Promise<AuthenticatedBootstrapResponse>): Promise<void> {
    this.cancelTimer();
    return this.enqueue(async () => {
      await this.flush();
      if (!this.payload || !this.local) throw new Error("共有データを取得できません");
      const sent = this.local;
      try {
        const payload = await request(this.payload);
        this.accept(payload, sent);
      } catch (error) {
        const failure = error as { status?: number };
        if (failure.status === 403 || failure.status === 409) this.fail(error);
        throw error;
      }
      // モード切替中の編集も、新しいCSRFトークンで保存します。
      await this.flush();
    });
  }

  retry(): Promise<void> {
    this.cancelTimer();
    return this.enqueue(async () => {
      this.options.onStatus("saving");
      try {
        const fresh = await this.options.bootstrap();
        const pending = this.payload && this.local ? stateDelta(this.payload.state, this.local) : null;
        this.payload = fresh;
        this.local = pending ? applyDelta(fresh.state, pending) : fresh.state;
        this.failed = false;
        this.options.onApply(fresh, this.local);
      } catch (error) { this.fail(error); }
      await this.flush();
    });
  }
}
