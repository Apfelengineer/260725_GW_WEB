/** DrizzleのSQLiteスキーマとマイグレーション出力先を定義します。 */

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "sqlite",
});
