/** Next.js／TypeScript向けの静的解析規則と生成物の除外設定です。 */

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // eslint-config-nextの既定除外を明示し、生成物を解析対象から外します。
  globalIgnores([
    // Next.jsが自動生成するディレクトリと型定義です。
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
