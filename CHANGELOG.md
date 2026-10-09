# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- One model and thinking menu. It sends `SET_CONFIG_OPTION` for the Agent's model or thinking option and changes the selection only after confirmation.
- Independent Agent connection tabs, overflow selection, per-Agent current Session controls, and read-only connection capability information.
- Complete Agent configuration editing with quoted arguments, environment variables, working-directory picking, correlated saves, and cancellable isolated connection tests.
- Agent-owned paginated session history; local chat transcript persistence and restoration are removed.

### Fixed

- Fork any completed response through session/fork with `_meta.upToMessageIndex`. Rewind the current Session through `_aharness/session/rewind` without creating a Session.
- Open Agent creation when none are configured, offer connect when none are initialized, start one Session after connect, and hide the composer when no Session exists.
- Fold Agent tabs that do not fit into an overflow menu, including one wide tab or an empty strip. Selected tabs use editor-tab chrome, and disconnect appears on hover. Connection information stays on the Session row.
- Select an open slash-command menu with the Up and Down keys, insert the highlighted command with Enter or Tab, and dismiss it with Escape.
- Clear unchanged prompt input on acceptance and preserve recalled drafts when an earlier request completes.
- Include shipped Preact components and TSX tests in ESLint checks.
- Render assistant Markdown with highlighted code, math formulas, tables and diagrams in the Preact UI.
- Open rendered file links with VS Code's native resource editor, including images and binary resources.
- Fence stale Agent/Session callbacks and settle pending prompts and approvals when their connection closes.
- Route real ACP permission requests to session approval and restore pending cards from runtime snapshots.
- Prevent partial Diff application; require complete contents, conflict checks, confirmation, and guarded editor edits.
- Preserve prompt drafts and attachments on failure and retain live output during snapshot refreshes.
- Create valid remote Fork sessions with independent history and retryable parent context.
- Retain per-Agent configuration drafts; reject unsupported WebSocket transport explicitly.
- Separate Agent selection, connection, and new chat; reset stale model choices and make `/clear` start a new chat.
- Show the selected Agent's remote history and respect multiline cursor navigation and Escape cancellation.

## [0.3.1] - 2026-09-29 - Milestone M4 (UI Layout Ergonomics, Multiline Auto-Grow & SVG Iconography)

### Added
- **Modern Unified Chat Input Card Layout**:
  - Reorganized input dock into a streamlined modern input card where the typing area sits prominently on top and toolbars sit comfortably on the bottom shelf.
  - Placed multimodal `[📎 Attach]` button on the far left of the bottom toolbar.
  - Integrated Model selector and Thinking effort selector dropdowns directly into the bottom toolbar with custom chevron indicators.
  - Positioned the dynamic Send/Stop toggle button on the far right of the bottom toolbar.
- **Multiline Auto-Growing Textarea**:
  - Smooth dynamic vertical expansion from 36px up to 240px as lines increase.
  - Preserved `Enter` to send and `Shift + Enter` for newlines.
  - Automatic scrollbar engagement beyond 240px, resetting to compact 36px upon sending.
- **Professional Themeable SVG Icon Library**:
  - Replaced childish emoji icons (`🔀`, `⚙`, `🕒`, `📎`, `🧠`, `⏹`, `⏎`, `🖼`, `✕`, `📋`, `📥`, `🔌`, `▾`, `▸`, `⚡`) with minimalist vector SVGs in `src/webview/components/icons.ts`.
  - Icons automatically inherit VS Code theme colors (`currentColor`) across all light, dark, and high-contrast themes.
  - Upgraded Header, ChatView, ThinkingBlock, McpInspector, and InputBox with crisp iconography.
- **Extension Brand Identity & High-Tech Icon**:
  - Designed glowing neural nexus / terminal bracket brand icon (`media/icon.svg` & `media/icon.png`).
  - Registered official extension icon in `package.json` for VS Code Extensions view and marketplace packaging.

## [0.3.0] - 2026-09-29 - Milestone M3 (Diff Review, Permissions, MCP Inspector, Skills & Chat Participant)

### Added
- **Interactive Line-Level Diff Viewer & VS Code Diff Editor Integration**:
  - `DiffViewerComponent` in Webview SPA rendering unified diffs with line-by-line syntax coloring, addition/deletion tallies (`+x / -y`), and action buttons.
  - Dual action modes: `[Accept All]` to immediately overwrite file on disk via `IWorkspacePort`, and `[Open in VS Code Diff Editor]` opening a native side-by-side comparison tab (`vscode.diff`).
- **Three-Tier Permission Policy Gate & Session Whitelisting**:
  - Fine-grained approval dialog for high-risk Agent tool calls (`run_command`, `write_file`) with three user options: `allow_once` (single execution), `always_allow_session` (session-level whitelist), and `deny` (with reason feedback).
  - Session-scoped whitelist automatically approves subsequent executions of trusted tools, preventing disruptive permission dialogs while maintaining high security.
- **Visual MCP Server & Tool Inspector Drawer**:
  - `McpInspectorComponent` sliding drawer accessible via top context capsule `[ 🔌 x MCP (y Tools) ▾ ]`.
  - Comprehensive inspection of configured MCP servers, connection latency, transport protocol, and discovered tool schemas with parameter signatures.
  - Per-tool enable/disable toggle switches that dynamically filter tools exposed to the Agent session.
- **Workspace Skill Discovery & Slash Command Autocomplete (`/`)**:
  - `SkillDiscovery` scanning `.agents/skills/` and `.skills/` for `SKILL.md` with YAML frontmatter or title headers.
  - Floating slash commands menu popup in `InputBoxComponent` triggering on `/` with keyboard navigation (`↑`/`↓`/`Enter`/`Tab`/`Esc`) and instant search filtering.
  - Built-in slash commands (`/clear`, `/tdd`, `/review`, `/design`, `/plan`) and auto-injected workspace skills.
- **VS Code Native Chat Participant Bridge (`@acp`)**:
  - Registered `@acp` in native VS Code Chat sidebar (`contributes.chatParticipants`).
  - Seamless delegation to `SessionHub` with real-time response chunk streaming via `vscode.ChatResponseStream`.
  - Slash command sub-handlers for `/clear` (new session) and `/fork` (branching current active session).

## [0.2.0] - 2026-09-29 - Milestone M2 (Webview Cockpit & Visual Configuration UI)

### Added
- **VS Code Extension Integration & Type-Safe IPC**: `VsCodeWorkspaceAdapter` implementing `IWorkspacePort`, and unidirectional IPC bridge in `AcpViewProvider` (`WebviewAction` <-> `ExtensionMessage`, `WebviewStateSnapshot`).
- **VS Code Native Modern Styling**: Webview UI system consuming `--vscode-*` CSS design tokens, smooth glassmorphism transitions, responsive layout, and dark/light theme adaptability.
- **Top Status Header**: Live Agent status indicator (● Running / ⚪ Stopped / 🔴 Error), active model badge, thinking effort badge, and drawer action toggles (`[🔀 Fork]`, `[⚙ Config]`, `[🕒 History]`).
- **Fine-Grained Chat Stream & Thinking**: Incremental markdown streaming renderer, syntax-highlighted code blocks with line numbers, copy button, insert-to-cursor action, and collapsible `ThinkingBlock` (`[▾ Thinking (x.xs)]`).
- **Ergonomic Dynamic Send/Stop Toggle Button**: Space-saving unified input button that automatically switches from `[⏎ Send]` to `[⏹ Stop]` (with pulsating alert animation) when streaming or waiting for approval, directly dispatching session cancellation.
- **Terminal-Style Prompt History Recall (↑ / ↓)**: Arrow key navigation through StorageManager prompt history ring buffer, retaining temporary uncommitted drafts when navigating past recent items.
- **Multimodal Content Block Attachments**: Clipboard image paste (`Cmd+V` / `Ctrl+V`), drag-and-drop, and file upload with base64 data URL conversion and preview chips.
- **Visual Agent Configuration Drawer & Ping Probe**: Real-time Agent process health diagnostics (`[⚡ Test Connection (Ping)]` with latency display), transport settings, command arguments editor, and dynamic environment variables table.
- **Visual Session History Drawer & Branch Lineage**: Session search filtering, recency grouping, one-click session switching, deletion, and branch lineage visualization.
- **Production Bundler**: `esbuild` dual pipeline for extension host (`dist/extension.js`) and webview SPA client (`dist/webview.js`) with static asset distribution.

## [0.1.0] - 2026-09-29 - Milestone M1 (Headless Core ACP Engine)

### Added
- **Core Domain & Ports**: Clean Architecture ports (`IProcessPort`, `ITransportPort`, `IWorkspacePort`, `IStoragePort`), typed error hierarchy (`ProcessError`, `ProtocolError`, `SessionError`, `StorageError`), and session data models.
- **Atomic Storage**: `StorageManager` with `.tmp` -> rename atomic writes, corrupted file recovery, and deduplicating prompt history ring buffer (max 100 entries).
- **Process Supervision**: `ProcessManager` with zombie-free lifecycle management (`SIGTERM` -> 5000ms `SIGKILL` timeout escalation), status event streaming, and process auto-restart.
- **ACP SDK Integration**: `AcpClientAdapter` wrapping `@agentclientprotocol/sdk` (v1.5.1) client fluent API over child process stdio with capability negotiation (v1 and draft v2), multimodal block support (`image`, `audio`), tool call permission dispatch, and workspace FS integration.
- **Multi-Session Hub & Forking Engine**: `Session` explicit finite state machine (`idle | streaming | waiting_approval | error`), `SessionHub` with concurrent session scheduling, crash cascade isolation, and immutable session forking (`forkSession`) with lineage tracking.
- **End-to-End Headless Suite**: Comprehensive integration test suite verifying full multi-turn ACP conversation, thinking blocks, diffs, approvals, forking, and crash recovery. Zero VS Code Electron dependencies in core.
