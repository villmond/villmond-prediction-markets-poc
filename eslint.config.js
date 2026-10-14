import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/dev-dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/coverage/**",
      "client/public/config.yaml",
      "eslint.config.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ["nostr/tsconfig.eslint.json", "contracts/tsconfig.json", "client/tsconfig.json", "features/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["client/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "warn",
      // These hooks deliberately hold an external resource (a relay WebSocket
      // pool / subscription handle) in state — React's own docs classify this
      // as a valid effect use case ("Connecting to an external system"), but
      // this newer rule flags the setState call that stores the handle.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // o1js requires every @method handler to be declared `async`, even when
    // its body has no `await` — that's the framework's contract, not a bug.
    files: ["contracts/src/**/*.ts"],
    rules: {
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    // node:test/Cucumber's describe/it/Given/When/Then register async
    // callbacks; the runner (not our code) drives them, and test mocks for
    // fetch's Response.json() must stay `async` to match the real interface
    // even when a given mock body has nothing to await.
    files: ["**/*.test.ts", "features/step_definitions/**/*.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
);
