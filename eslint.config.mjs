import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // OMO working directory (gitignored, not source code):
    ".omo/**",
    // Scripts directory (build/migration scripts, not application code):
    "scripts/**",
    // Obsidian docs tooling (external, not application code):
    "obsidian-docs/**",
  ]),
]);

export default eslintConfig;
