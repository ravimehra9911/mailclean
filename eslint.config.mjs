import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "dist-desktop/**", "marketing/**", ".data/**", "next-env.d.ts"],
  },
  {
    rules: {
      // Destructuring is used to drop fields (e.g. tokens) before sending a row to the browser.
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true, argsIgnorePattern: "^_" }],
      // "/" is rewritten by src/middleware.ts (website on Vercel, dashboard in the desktop app), and
      // /api/connect/* are API redirects, so these links are meant to be full page loads.
      "@next/next/no-html-link-for-pages": "off",
      // Images are small static files; next/image optimization isn't used in the standalone desktop server.
      "@next/next/no-img-element": "off",
    },
  },
  {
    // Electron main process and Node build scripts are CommonJS.
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];

export default eslintConfig;
