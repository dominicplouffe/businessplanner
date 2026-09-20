import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * Next 16 ships eslint-config-next as native flat config, so no FlatCompat
 * bridge is needed (and the bridge fails on this version).
 */
const config = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "*.tmp.mjs",
      // Its own CDK project, with its own tsconfig and dependency tree.
      "infra/**",
    ],
  },
];

export default config;
