import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Two rules report true defects but their fix is bigger than a patch, so
      // they stay loud without blocking the tree:
      // - no-explicit-any: the client is typed with the generated Database
      //   shape, but 134 sites still say `any`; the fix is a typed read
      //   helper, not 134 annotations
      //   (issue #73; the drafting notes are in tasks/issue-typed-supabase-client.md).
      // - set-state-in-effect: every page fetches on mount and sets state in
      //   that effect; the idiom needs a data layer, not a per-file workaround.
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
);
