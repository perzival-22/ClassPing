import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * Flat ESLint config.
 *
 * The project previously ran `next lint` with no config file at all, so the
 * script exited clean without checking a single rule. This wires up Next's
 * recommended rules for real, via the ESLint CLI — `next lint` itself is
 * deprecated in Next 15 and gone in 16.
 *
 * eslint-config-next exports flat-config arrays directly, so they're spread
 * here rather than bridged through @eslint/eslintrc's FlatCompat (which
 * throws on this plugin set).
 */
const config = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "next-env.d.ts",
      // Untracked local helpers (gitignored) — not part of the app.
      "scripts/**",
      // Plain browser script, not part of the TS build.
      "public/sw.js",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Avatars are user-supplied data: URIs, which next/image can't optimize.
      "@next/next/no-img-element": "off",
    },
  },
];

export default config;
