# Technical Specification

## purpose

- ACP Client is a VS Code extension that connects to Agent Client Protocol agents.
- The extension provides chat, simultaneous Agent connections, one current Session per Agent, session forking, permissions, file operations, and agent process controls.

## user

- VS Code users interacting with ACP-compatible autonomous agents.
- Developers embedding the headless core in tests or other adapters.

## use-case

- Open the ACP chat view and send text or multimodal prompts.
- Create, switch, restore, delete, and fork sessions.
- Stream assistant text, thinking, tool calls, and tool results.
- Approve or deny agent permission requests.
- Configure, test, restart, and stop ACP agents.
- Review and apply file changes through VS Code commands.
- Use the `@acp` VS Code Chat Participant.

## architecture

- `src/core/` contains protocol, process, storage, session, types, errors, and ports.
- `src/vscode/` contains the extension host, webview provider, chat participant, and VS Code adapters.
- `src/webview/` contains the browser-side single-page UI and components.
- `src/shared/ipc-protocol.ts` defines Webview-to-extension actions and extension-to-Webview messages.
- Core dependencies point toward ports; VS Code APIs are used in outer adapters.
- `SessionHub` owns independently closable Agent runtimes, qualified Session identities, adapters, generation/revision fences, and process crash propagation.
- `ProcessManager` supervises child processes and emits status/log events.
- `AcpClientAdapter` maps ACP SDK requests and notifications onto session operations.
- `StorageManager` persists agent configurations and input prompt history. Session transcripts and deleted-session IDs are no longer persisted or restored locally.

## stack

- TypeScript 5.7 with strict compiler settings and CommonJS output.
- Node.js 20 or newer.
- VS Code API 1.90 or newer.
- `@agentclientprotocol/sdk` for ACP JSON-RPC/NDJSON communication.
- Vitest 3 with Node environment, Happy DOM dependency, and a VS Code test mock alias.
- esbuild builds extension-host and webview bundles through `scripts/build.mjs`.
- ESLint 9 with TypeScript ESLint; Prettier 3 is the formatter.
- Preact renders the webview UI. Assistant Markdown uses markdown-it with task lists and TeX math plugins, highlight.js for language-aware code, KaTeX for formulas, and Mermaid for diagrams.
- KaTeX CSS and font assets are bundled into `dist/webview.css` and `dist/fonts/`; Markdown/code/math rendering requires no CDN.

## entry

- Package activation entry is `dist/extension.js`.
- Extension host source entry is `src/vscode/extension.ts`.
- Public core export entry is `src/index.ts`.
- Webview source entry is `src/webview/main.tsx`.
- VS Code activation occurs on `onView:acpClient.chatView`.

## contract

- `IProcessPort` exposes start, stop, restart, status, status listeners, optional log listeners, and disposal.
- `ITransportPort` exposes send, message subscription, and close. No adapter implements it.
- `IStoragePort` exposes input prompt history and agent configuration persistence.
- `IWorkspacePort` exposes file reads, file writes, command execution, optional guarded editor edits, and optional file operations.
- `ISession` exposes prompt, cancel, configuration, permission response, events, serialization, and adapter attachment.
- Session status values are `idle`, `streaming`, `waiting_approval`, and `error`.
- The composer has one model/thinking menu. Parsing keeps options whose category, id, or name is a model or a thinking/reasoning level, and stores that option id plus its select values. A click sends `SET_CONFIG_OPTION` with the id and value. The menu disables while pending and does not change the selection locally. Session snapshots and `config_option_update` replace the lists. A correlated failure is shown and the previous selection remains. Choosing a level closes the menu and focuses its trigger. Choosing a model leaves the menu open. Levels render when a model is selected, or when no models were advertised. The menu does not request options on hover.
- Attached Sessions can retry a failed turn from `error`, including after switching models. Webview prompt admission and its post-persistence revalidation allow `idle` and `error`, while Core prevents concurrent prompts. Detached Sessions must be reloaded before sending.
- Process status values are `stopped`, `starting`, `running`, `restarting`, and `error`.
- `isWebviewAction` validates known action types and checks payloads for prompts, connection, permissions, and file application.
- Webview state includes runtime pending approval snapshots; session and process changes use typed events.
- Assistant Markdown supports headings, nested/ordered/task lists, tables, blockquotes, links, images, inline/fenced code, and inline/display math using `$...$`, `$$...$$`, `\\(...\\)`, or `\\[...\\]`. Unclosed streaming fences remain readable; unknown code languages fall back to escaped text.
- Markdown preserves code indentation and blank lines, escapes raw HTML, rejects executable link schemes, and renders KaTeX with trust disabled. Wide tables, code, and display formulas scroll inside the message.
- File links use `OPEN_FILE` actions with line metadata. The VS Code bridge opens resources with `vscode.open`, allowing the configured editor/viewer to handle images and other binary files; text line ranges are passed as editor selection options.
- The Preact Markdown body handles code/diagram copying and file links through `OPEN_FILE` actions with line metadata. Completed Mermaid fences render with strict security; incomplete or invalid diagrams retain their source. PlantUML uses its external SVG service with UTF-8, raw DEFLATE compression, and PlantUML's custom URL-safe encoding. Preview images and SVG links share the compressed URL; uncompressed hexadecimal URLs are avoided because long diagrams can exceed server request-line limits.
- Matching prompt acceptance clears unchanged submitted text and attachments. Rejection before acceptance retains input; stale outcomes and completion preserve newer drafts, including recalled history.
- The prompt textarea grows up to 240px and then scrolls vertically. Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Ctrl+Y invoke the focused browser editor's native undo/redo history inside the Webview. Composition keys pass through without invoking editing shortcuts. Cmd/Ctrl+V pastes clipboard images as attachments and leaves a text-only paste unchanged.
- A draft that starts with `/` and contains no space opens the slash menu. Up and Down move the highlighted command without changing the draft. Enter and Tab insert `/{name} ` and do not send. Escape dismisses the menu until the draft changes; arrow keys then navigate prompt history again.
- Slash entries are the Session's advertised commands plus skills discovered from the active configuration directory.
- Image attachments are a name list above the prompt. Each row can be removed. Clicking a name opens the image; clicking the backdrop or pressing Escape closes it. The row does not render the image.
- Interaction contracts and failure handling are defined in [Interaction reliability](specs/interaction-reliability.md).
- Agent ownership, navigation, history and configuration contracts are defined in [Agent and Session lifecycle](specs/agent-session-lifecycle.md).
- Copy, fork, and rewind contracts are defined in [Conversation message actions](specs/user-message-actions.md).
- Agent configuration contains command, arguments, environment, transport, enabled state, and optional working directory/model settings.
- Session data contains identifiers, metadata, status, message history, optional fork ancestry, and the working directory used by the ACP session.
- Assistant messages retain ordered thinking turns, each with its own tool calls, followed by separate final output. Legacy flat thinking and tool fields remain readable.
- The shipped Preact conversation uses accent-tinted user cards with Copy and Rewind / Undo in a horizontal overlay at the right vertical midpoint, visible on mouse hover. Controls reserve no space or minimum card size. Assistant rows show the Agent name, the response time in local 24-hour `HH:mm:ss` format, Copy all and Fork together in a wrapping footer after execution content and final output. The model name is omitted. The time uses the message's existing completion timestamp, falling back to its legacy timestamp or start time when needed; missing or invalid timestamps are not displayed.
- Rewind keeps the current Session. Its boundary is the index before the selected user message. Confirmed rewind drops that message and everything after it. An untouched composer receives the prompt back and does not send it. A newer draft is kept. Fork includes the selected assistant response, excludes later turns, and leaves the source Session unchanged. Execution summaries, reasoning turns, and individual calls collapse independently. Tool calls are direct children of their reasoning turn; an expanded turn shows every call in order. Empty reasoning remains a visible unavailable turn.
- Each reasoning turn shows its call count followed by thinking and elapsed time. Folded thinking uses one line with ellipsis; expanded thinking shows its full text in the same header, preserves newlines and wraps long content, with no duplicate Thinking section.
- Execution summaries show Working/Worked, measured elapsed time, turn count and call count. The execution clock stops at first final output or prompt completion, while active tool durations refresh. Tool rows show input/result previews, full escaped details on expansion, and pending/running/failed/denied labels; completed labels are omitted. Partial diffs remain preview-only, with Apply and Open diff available only when both complete file snapshots exist.
- Stream projection preserves Core turn indices and timestamps, applies late tool updates to their original turn, and retains newer details through stale snapshots. Initial snapshots arriving before the Preact store subscription are reconciled when it subscribes. Conversation and subscription regressions are covered in `test/webview/conversation-contract.test.tsx`, `execution-projection-regressions.test.tsx`, and `store-subscription-regression.test.tsx`.
- New, restored, and forked sessions retain their working directory so relative file links resolve against the active session.

## flow

- `activate` creates output, storage, process, workspace, session, view, and chat adapters.
- A session request obtains or creates an ACP adapter, starts an agent process, initializes ACP, then calls `session.new`.
- A prompt changes the session to `streaming`, appends user and assistant placeholder messages, and calls ACP `session.prompt`.
- ACP `session/update` notifications mutate the session stream and emit session events to the UI.
- ACP permission requests register pending approval before broadcasting; offered option identifiers drive UI replies.
- Process errors cascade to sessions belonging to the failed agent and reject pending prompt or approval promises.
- Session history is requested explicitly through the selected Agent's `session/list`, with opaque pagination cursors, and restored through advertised `session/load` support.
- Opening remote history loads the existing Session ID. Subsequent prompts continue that Session; history transcripts do not become composer drafts.
- Remote history has no standard running/idle field. Only this client's attached current Session may be annotated with its in-memory status.
- Deletion requires advertised Agent delete support; failure retains the current runtime. No local tombstones or transcript files are written.
- Agent tabs select independent connections. The overflow menu appears only when more than one connected Agent does not fit, with one select entry per Agent. The second row manages that Agent's current Session and opens its connection information. Multi-live-Session tabs and concurrency configuration are deferred.
- After a snapshot, a transition to zero Agent configurations opens the configuration drawer and closes history. Dismissing it leaves it closed until a configuration exists and is later removed.
- An uninitialized selected Agent offers connect. An initialized selected Agent with no current Session starts one Session for that generation in this mount.
- The automatic Session waits while any lifecycle request is pending. It does not repeat a generation already started or bound to its Session.
- The composer mounts only while a current Session exists.
- Read-only connection information shows Agent identity, protocol version and reported capabilities separately from launch configuration. Session capability presentation includes both top-level `loadSession` and the nested lifecycle declaration. Prompt content distinguishes baseline text/resource links from optional Agent declarations.
- Client capability information comes from the successful initialize handshake snapshot propagated through `AgentConnectionSummary`, with the raw Client declaration available for inspection. Filesystem support follows installed read/write callbacks and explicit disabling; terminal support remains false until the full ACP terminal lifecycle is implemented. The Client no longer advertises the Agent-only `session.loadSession` field. Missing Client snapshots are shown as unavailable.
- Opt-in live handshake acceptance uses `ACP_LIVE_CAPABILITIES=1 npx vitest run test/integration/live-capabilities.test.ts` with local `opencode acp` and `uv run --directory /Users/neo/workbench/test/ai/harness/aharness aharness acp serve`; it verifies protocol declarations and connection snapshot propagation without creating sessions or sending prompts.
- Configuration edits apply on the next connection. Connected or connecting configurations cannot be deleted. Isolated connection tests are cancellable and always reap their temporary process.
- `deactivate` disposes the chat participant, view provider, session hub, and process manager.

## invariant

- `src/core/` does not import the VS Code API or webview UI libraries.
- Agent process shutdown attempts SIGTERM and escalates to SIGKILL after 5000 ms by default.
- Active sessions cannot start a prompt unless status is `idle` or `error`.
- Permission responses require `waiting_approval` and the matching pending request ID.
- Forked sessions use an Agent-issued session ID, parent metadata, and deep-cloned history.
- A same-Agent fork calls session/fork, opens the returned Session ID, and keeps messages through the clicked response. The click index is `_meta.upToMessageIndex`. Fork is offered only after a completed assistant response. Agents without fork, and forks onto another Agent, still use session/new.
- Rewind keeps the current Session ID. acp-client calls `_aharness/session/rewind` with `upToMessageIndex` set to the message before the selected user prompt, then truncates local history through that index.
- The first Agent history page supplements an omitted attached current fork using its acknowledged Agent-issued ID, respecting cwd and excluding pagination duplicates. Closing or detaching removes this runtime-only supplement.
- JSON persistence uses a sibling temporary file followed by rename.
- Prompt history is trimmed to the configured maximum of 100 entries by default and omits consecutive duplicates.
- Session and process listeners are disposable and are cleared during disposal.

## constraint

- Agent communication currently uses child-process stdio in the extension activation path.
- `AgentConfig` retains WebSocket transport for stored configuration compatibility; save, test, connect, restart, and creation explicitly reject it.
- VS Code APIs are unavailable to core unit tests; tests use ports, mocks, and a VS Code module alias.
- The extension requires a configured ACP-compatible agent command to create a working session.
- The production Webview mounts `src/webview/main.tsx`. Legacy DOM chat, header, input, diff, and MCP inspector modules are not that entry. `icons.ts` is shared.
- Webview scripts are enabled only for the registered ACP webview and its local extension resource roots.
- Existing legacy transcript files are not automatically deleted, read, or used to populate history.

## convention

- Run `npm test` for Vitest tests, `npm run build` for typecheck and bundling, `npm run lint` for ESLint, and `npm run format` for Prettier.
- ESLint checks both `.ts` and `.tsx` files under `src/` and `test/`. Tooling regressions verify TSX parsing and active TypeScript rules.
- Source and tests use TypeScript; public boundaries use explicit interfaces and type imports.
- Domain failures use `ProcessError`, `ProtocolError`, `SessionError`, or `StorageError` where applicable.
- Listener callbacks are isolated with try/catch so callback failures do not break managers.
- External file and command paths are passed to adapters; core code depends on ports rather than VS Code APIs.
- The webview communicates through structured actions and extension messages rather than direct extension internals.
- Process environment inherits the host environment and adds configured agent variables.
- A first-run empty configuration receives the aharness default. Later activation preserves existing configurations and intentional deletion of all configurations.
