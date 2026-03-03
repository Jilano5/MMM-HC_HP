/* eslint-env node */
"use strict";

module.exports = {
  root: true,
  env: {
    node: true,
    es6: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
  },
  rules: {
    "no-console": "error",
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    semi: ["error", "always"],
    quotes: ["error", "double"],
    eqeqeq: ["error", "always"],
    "prefer-const": "warn",
  },
  overrides: [
    {
      // node_helper.js uses CommonJS; Log is not available server-side → use console
      files: ["node_helper.js"],
      env: { node: true, browser: false },
      parserOptions: { ecmaVersion: 2020, sourceType: "commonjs" },
      rules: { "no-console": "off" },
    },
    {
      // MMM-OffPeakHours-France.js runs in the MagicMirror browser context (globals: Module, Log)
      files: ["MMM-OffPeakHours-France.js"],
      env: { node: false, browser: true },
      globals: {
        Module: "readonly",
        Log: "readonly",
        moment: "readonly",
      },
      parserOptions: { ecmaVersion: 2020, sourceType: "script" },
    },
  ],
};
