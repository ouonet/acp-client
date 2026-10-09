# Agent connection tabs

spec: docs/staging/specs/2026-10-09-agent-connection-tabs.md

- [x] T1: Pack agent tabs
  goal: Decide which connection indexes stay on the strip.
  files: src/webview/utils/pack-agent-tabs.ts, test/webview/pack-agent-tabs.test.ts
  acceptance: npm test -- test/webview/pack-agent-tabs.test.ts
  spec: docs/staging/specs/2026-10-09-agent-connection-tabs.md

- [x] T2: Render the strip and editor-tab chrome
  goal: Show the packed prefix as editor tabs and the suffix in the overflow menu.
  files: src/webview/components/header/header-bar.tsx, src/webview/styles/lifecycle.css, test/webview/lifecycle-interaction-regressions.test.tsx
  acceptance: npm test -- test/webview/lifecycle-interaction-regressions.test.tsx
  spec: docs/staging/specs/2026-10-09-agent-connection-tabs.md
