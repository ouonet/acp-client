# Plan: Agent Connection Controls & Per-Message History Forking

Reference: [docs/staging/specs/2026-09-29-agent-connection-and-message-fork.md](file:///Users/neo/workbench/test/ai/harness/acp-client/docs/staging/specs/2026-09-29-agent-connection-and-message-fork.md)

## Tasks

- [x] T1: Move Fork Action to User Message Toolbar in ChatView
  goal: Remove Fork button from HeaderComponent; add `.user-message-toolbar` to each user message row in `ChatViewComponent` with `[Fork]` and `[Copy]` buttons; dispatch `FORK_SESSION` with `upToMessageIndex`.
  files: src/webview/components/header.ts, src/webview/components/chat-view.ts, src/webview/main.ts, src/webview/style.css, test/webview/header.test.ts, test/webview/chat-view.test.ts
  acceptance: `npx vitest run test/webview/header.test.ts` and `npx vitest run test/webview/chat-view.test.ts` pass; clicking user message Fork triggers `FORK_SESSION` with correct message index.
  spec: docs/staging/specs/2026-09-29-agent-connection-and-message-fork.md#decisions

- [x] T2: Interactive Agent Connection Controls in Header and Welcome Card
  goal: Add Agent selector dropdown and Connect/Disconnect button to `HeaderComponent`; render interactive Agent Connection Welcome Card in `ChatViewComponent` when chat is empty or disconnected.
  files: src/webview/components/header.ts, src/webview/components/chat-view.ts, src/webview/main.ts, src/webview/style.css, test/webview/header.test.ts
  acceptance: `npx vitest run test/webview/` passes; Connect button dispatches session creation / connection to selected agent; UI reflects connecting / running / stopped states.
  spec: docs/staging/specs/2026-09-29-agent-connection-and-message-fork.md#decisions

- [x] T3: Full Regression Verification & VSIX Packaging
  goal: Run full test suite across core, vscode, and webview layers, verify zero lint errors, and rebuild extension & package VSIX.
  files: scripts/build.mjs, CHANGELOG.md
  acceptance: `npm run build:prod && npm test && npm run lint` passes 100% green; `make link-vscode` succeeds.
  spec: docs/staging/specs/2026-09-29-agent-connection-and-message-fork.md#decisions
