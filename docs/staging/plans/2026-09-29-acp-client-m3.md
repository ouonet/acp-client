# Plan: M3 Diff Review, Permission Gate, MCP & VS Code Ecosystem Integration

Reference: [docs/staging/specs/2026-09-29-acp-client.md](file:///Users/neo/workbench/test/ai/harness/acp-client/docs/staging/specs/2026-09-29-acp-client.md)
Milestone: M3 (see [docs/ROADMAP.md](file:///Users/neo/workbench/test/ai/harness/acp-client/docs/ROADMAP.md))

## Tasks

- [x] T1: Interactive Diff Viewer & Editor Dual-Mode Integration
  goal: Implement `DiffViewerComponent` in Webview for visual unified diff rendering (additions, deletions, line numbers) and dual-mode actions: `[Accept All]` to write to disk via `IWorkspacePort`, and `[Open in VS Code Diff Editor]` (`vscode.diff`).
  files: src/webview/components/diff-viewer.ts, src/vscode/ports/vscode-workspace-adapter.ts, src/shared/ipc-protocol.ts, test/webview/diff-viewer.test.ts, test/vscode/diff-integration.test.ts
  acceptance: `npx vitest run test/webview/diff-viewer.test.ts` passes; diff lines parsed accurately; VS Code diff action dispatches with correct URI pair.
  spec: docs/staging/specs/2026-09-29-acp-client.md#uc-05-交互式代码-diff-审查与写入-interactive-diff-review

- [x] T2: Three-Tier Permission Policy Gate & Session Whitelisting
  goal: Implement three-tier permission options (`allow_once`, `always_allow_session`, `deny`) in Session FSM and Webview UI. When `always_allow_session` is selected, subsequent tool requests for the same tool name in the session auto-approve without UI blocking.
  files: src/core/session/session.ts, src/webview/components/chat-view.ts, test/core/permission-policy.test.ts, test/webview/permission-gate.test.ts
  acceptance: `npx vitest run test/core/permission-policy.test.ts` passes; auto-approve skips prompt for whitelisted tools; deny passes rejection reason to Agent.
  spec: docs/staging/specs/2026-09-29-acp-client.md#uc-04-工具执行与安全权限拦截-tool-call--permission-gate

- [x] T3: Visual MCP Server & Tool Inspector Drawer
  goal: Implement `McpInspectorComponent` drawer and top context capsule `[ 🔌 x MCP (y Tools) ▾ ]`. Displays configured MCP servers (stdio/sse/websocket), connection status, latency, and exposed tool schemas with individual enable/disable toggles.
  files: src/webview/components/mcp-inspector.ts, src/shared/ipc-protocol.ts, test/webview/mcp-inspector.test.ts
  acceptance: `npx vitest run test/webview/mcp-inspector.test.ts` passes; tool schema parameters rendered; toggle states propagated to session options.
  spec: docs/staging/specs/2026-09-29-acp-client.md#uc-12-mcp-服务器与工具可视化透视-mcp-servers--tools-inspector

- [x] T4: Workspace Skill Discovery & Slash Command Autocomplete (`/`)
  goal: Implement `SkillDiscovery` scanning `.agents/skills/` and `.skills/` for `SKILL.md` YAML frontmatter, and implement interactive slash command menu (`/tdd`, `/review`, `/design`, `/clear`) in `InputBoxComponent`.
  files: src/core/skills/skill-discovery.ts, src/webview/components/input-box.ts, test/core/skill-discovery.test.ts, test/webview/slash-commands.test.ts
  acceptance: `npx vitest run test/core/skill-discovery.test.ts` passes; typing `/` opens popup; selecting skill populates prompt or context directive.
  spec: docs/staging/specs/2026-09-29-acp-client.md#uc-13-技能体系支持-skill-discovery-slash-invocation--mcp-bridge

- [ ] T5: VS Code Native Chat Participant Bridge (`@acp`)
  goal: Register VS Code Chat Participant `acpClient.acpParticipant` (`@acp`) allowing users to interact with ACP agents directly from the native VS Code Chat sidebar, streaming responses back via `vscode.ChatResponseStream`.
  files: src/vscode/chat-participant.ts, src/vscode/extension.ts, package.json, test/vscode/chat-participant.test.ts
  acceptance: `npx vitest run test/vscode/chat-participant.test.ts` passes; chat participant delegates to active SessionHub session and streams response.
  spec: docs/staging/specs/2026-09-29-acp-client.md#solution-matrix-for-m1-m3

- [ ] T6: Full Milestone M3 Bundling, Integration Suite & Production Verification
  goal: Bundle production assets, execute full test suite across all 18+ test suites, ensure zero lint errors, and document M3 in CHANGELOG.
  files: scripts/build.mjs, CHANGELOG.md, docs/ROADMAP.md
  acceptance: `npm run build && npm test && npm run lint` succeeds with 100% green coverage; production bundles verified.
  spec: docs/staging/specs/2026-09-29-acp-client.md#tests
