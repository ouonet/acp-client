# Plan: M4 UI Layout Ergonomics, Multiline Auto-Grow & Professional SVG Iconography

Reference: [docs/staging/specs/2026-09-29-ui-layout-and-icons.md](file:///Users/neo/workbench/test/ai/harness/acp-client/docs/staging/specs/2026-09-29-ui-layout-and-icons.md)
Milestone: M4 (see [docs/ROADMAP.md](file:///Users/neo/workbench/test/ai/harness/acp-client/docs/ROADMAP.md))

## Tasks

- [x] T1: InputBox Layout Reorganization & Multiline Auto-Grow
  goal: Reorganize InputBox layout with textarea on top and toolbar on bottom; place Attach button on the far left, Model and Thinking selectors next to it, and the dynamic Send/Stop button on the far right. Enhance auto-growing height up to 240px.
  files: src/webview/components/input-box.ts, src/webview/style.css, test/webview/input-box.test.ts
  acceptance: `npx vitest run test/webview/input-box.test.ts` passes; DOM elements correctly positioned; textarea auto-adjusts height on multiline input.
  spec: docs/staging/specs/2026-09-29-ui-layout-and-icons.md#decisions

- [x] T2: Professional SVG Iconography Migration Across Webview Components
  goal: Replace all remaining emoji characters in Header, ThinkingBlock, ChatView code actions, McpInspector, and InputBox with themeable SVG vector icons from `src/webview/components/icons.ts`.
  files: src/webview/components/icons.ts, src/webview/components/header.ts, src/webview/components/thinking-block.ts, src/webview/components/chat-view.ts, src/webview/components/mcp-inspector.ts, src/webview/style.css
  acceptance: `npx vitest run test/webview/` passes; all components display crisp SVG icons with no remaining emojis.
  spec: docs/staging/specs/2026-09-29-ui-layout-and-icons.md#decisions

- [x] T3: Extension Branding Icon & Full Suite Production Verification
  goal: Finalize extension brand icon (`media/icon.svg` & `media/icon.png`), verify `package.json` manifest registration, execute full production build, run all test suites, and ensure zero lint warnings.
  files: media/icon.svg, media/icon.png, package.json
  acceptance: `npm run build:prod && npm test && npm run lint` passes 100% clean.
  spec: docs/staging/specs/2026-09-29-ui-layout-and-icons.md#decisions
