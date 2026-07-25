/** Cloudflare D1バインディングから型付きDrizzleクライアントを生成します。 */

import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  // DB未設定のまま処理を続けず、設定方法が分かるエラーを早い段階で返します。
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}
