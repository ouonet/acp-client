# Plan: M2 Webview Cockpit & Visual Configuration UI

Reference: [docs/staging/specs/2026-09-29-acp-client.md](file:///Users/neo/workbench/test/ai/harness/acp-client/docs/staging/specs/2026-09-29-acp-client.md)
Milestone: M2 (see [docs/ROADMAP.md](file:///Users/neo/workbench/test/ai/harness/acp-client/docs/ROADMAP.md))

## Tasks

- [x] T1: VS Code Extension Scaffolding & Shared IPC Contract
  goal: Add `@types/vscode` (v^1.90.0) and bundling tools to devDependencies, implement `VsCodeWorkspaceAdapter` implementing `IWorkspacePort`, and define strict types for Webview-Extension unidirectional IPC protocol (`Action` and `StateSnapshot`/`Event`).
  files: package.json, src/shared/ipc-protocol.ts, src/vscode/ports/vscode-workspace-adapter.ts, test/vscode/ipc-protocol.test.ts
  acceptance: `npx vitest run test/vscode/ipc-protocol.test.ts` passes; type check passes with zero errors under strict mode.
  spec: docs/staging/specs/2026-09-29-acp-client.md#architecture

- [x] T2: Webview View Provider & Unidirectional IPC Bridge
  goal: Implement `AcpViewProvider` (`vscode.WebviewViewProvider`) managing Webview lifecycle, translating incoming UI Actions (SEND_PROMPT, CANCEL, FORK, etc.) to SessionHub/ProcessManager calls, and broadcasting state snapshots and events to Webview.
  files: src/vscode/acp-view-provider.ts, src/vscode/extension.ts, test/vscode/acp-view-provider.test.ts
  acceptance: `npx vitest run test/vscode/acp-view-provider.test.ts` passes with mocked Webview testing bidirectional message handling and state broadcasting.
  spec: docs/staging/specs/2026-09-29-acp-client.md#architecture

- [x] T3: Webview UI Shell, Modern Styling & Header Controls
  goal: Implement Webview HTML shell and CSS design system using native VS Code theme tokens (`--vscode-*`), top status header with live Agent indicator (●/⚪/🔴), Model selector, Thinking level selector, and Header Action buttons (`[🔀 Fork]`, `[⚙ Config]`, `[🕒 History]`).
  files: src/webview/index.html, src/webview/style.css, src/webview/components/header.ts, test/webview/header.test.ts
  acceptance: Header updates status indicator on process events, switches models and thinking levels, and toggles config/history drawers.
  spec: docs/staging/specs/2026-09-29-acp-client.md#1-主对话界面cockpit-wireframe

- [ ] T4: Streaming Chat View & Collapsible Thinking Block
  goal: Implement `ChatView` rendering user & assistant messages, incremental Markdown streaming, code syntax highlighting with line numbers, copy button, insert-at-cursor action, and collapsible `ThinkingBlock` (`[▾ Thinking (x.xs)]`).
  files: src/webview/components/chat-view.ts, src/webview/components/thinking-block.ts, test/webview/chat-view.test.ts
  acceptance: `npx vitest run test/webview/chat-view.test.ts` passes verifying markdown parsing, thinking block toggle, and tool call card rendering.
  spec: docs/staging/specs/2026-09-29-acp-client.md#uc-03-流式交互与精细消息渲染-fine-grained-stream--thinking-blocks

- [ ] T5: Ergonomic Input Box (Send/Stop Toggle, History Ring Buffer & Multimodal)
  goal: Implement `InputBox` component featuring a single dynamic Send/Stop toggle button, keyboard `↑`/`↓` prompt history recall from StorageManager, auto-growing textarea, and multimodal attachment support (paste image from clipboard, drag-drop, file attach).
  files: src/webview/components/input-box.ts, test/webview/input-box.test.ts
  acceptance: `npx vitest run test/webview/input-box.test.ts` passes verifying Send/Stop mode toggle on streaming state, history index cycling, and image base64 conversion.
  spec: docs/staging/specs/2026-09-29-acp-client.md#uc-06-输入框历史回溯与快捷操作-input-history-ring-buffer--ergonomics

- [ ] T6: Visual Agent Configuration & History Drawer with Forking
  goal: Implement `ConfigPanel` (with command/args/env editor and real-time Ping test probe with latency) and `HistoryDrawer` (search filter, date grouping, one-click session fork and delete).
  files: src/webview/components/config-panel.ts, src/webview/components/history-drawer.ts, test/webview/config-and-history.test.ts
  acceptance: Config panel sends ping test action and displays result dot/logs; history drawer triggers fork action with message index and renders lineage tree.
  spec: docs/staging/specs/2026-09-29-acp-client.md#uc-01-agent-视觉化配置与健康探测-visual-agent-configuration--health-probe

- [ ] T7: Webview Bundler & Full M2 End-to-End UI Verification
  goal: Setup esbuild bundling scripts for both extension host and webview app, run full test suite with 100% green coverage, and verify production build artifact packaging.
  files: scripts/build.mjs, package.json
  acceptance: `npm run build && npm test && npm run lint` succeeds with zero errors, producing deployable `dist/extension.js` and `dist/webview.js`.
  spec: docs/staging/specs/2026-09-29-acp-client.md#tests
