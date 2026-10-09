# Agent and Session lifecycle

## Ownership

- A connection owns its process, ACP adapter, capabilities, generation and one current Session.
- The selected Agent determines the displayed Session; other connections continue independently.
- Session identity is `(agentId, sessionId)`. Runtime revision distinguishes repeated attachment of the same identity.
- Explicit connection actions select their Agent at invocation. Background history operations preserve selection.
- Multi-live-Session tabs and nonstandard concurrency capability/configuration are deferred.

## Navigation

- The first row shows connection tabs, connect, and Agent Settings.
- A connection tab uses square editor-tab chrome and VS Code tab colors.
- The strip background is `--vscode-editorGroupHeader-tabsBackground`. The header background stays unchanged.
- The selected tab uses the active background, foreground, and top border.
- The top border uses `tab.activeBorderTop`, then the focus border.
- Disconnect sits inside the tab and appears on hover or keyboard focus.
- The close slot stays reserved, so revealing it does not resize the tab.
- `packAgentTabs` keeps a fitting prefix on the strip and folds the suffix into the menu.
- Widths come from off-flow copies. The strip does not scroll.
- Unmeasured layout shows every tab and hides the menu.
- A budget that fits no tab leaves the strip empty and lists every connection.
- Selection stays in connection order. The selected agent is not pulled onto the strip.
- A menu row selects with the name and status, and disconnects with a visible button.
- Arrow keys move among strip tabs and stop at the ends.
- Home and End select the first and last strip tabs.
- Focus moves to the overflow summary when the focused tab leaves the strip.
- Config-panel tabs, connection information, the connect menu, and Agent Settings stay unchanged.
- Connection information shows reported identity, version, protocol and Session/prompt/MCP capabilities.
- The second row exposes the selected Agent's current Session, status, one read-only connection-information control for that Agent, new, history and close controls.
- Busy current Sessions cannot be replaced by new, load or fork operations.
- Drafts and attachments are retained by qualified Agent/Session identity.
- Configuration, history and connection information use a full-viewport modal overlay outside header/chat stacking contexts. Background controls are inert; Tab stays inside, Escape/backdrop/close dismiss, and prior focus is restored.
- Header menus close after selection, on outside click and on Escape. An all-disabled configuration list still offers configuration access.
- After a snapshot, entering zero configurations opens the configuration drawer once. Dismissing it stays dismissed until a configuration exists and is removed.
- An uninitialized selected Agent offers connect. An initialized selected Agent with no current Session starts one Session for that generation in this mount.
- The automatic Session waits while any lifecycle request is pending. It does not repeat a generation already started or bound to its Session.
- The composer mounts only while a current Session exists.
- Lifecycle controls and prompt input share per-Agent pending request state. Rapid repeated lifecycle clicks are fenced; snapshots and unrelated acknowledgements cannot release a pending request. Independent Agents remain independently actionable.

## Remote history

- History requests call the owning Agent's advertised `session/list` capability.
- Pagination preserves opaque cursors and request correlation.
- History uses compact two-line rows with truncated titles and directories; full values remain available through tooltips.
- Search matches title, Session ID and working directory independently, ignoring case.
- Copy Session ID and Delete are visible sibling controls; they never trigger opening the row.
- Copy writes the exact ID to the browser clipboard and reports success or retryable failure without changing the current Session.
- Loading requires advertised `loadSession` support; replay is staged until successful completion.
- The history drawer remains open while a load is pending, prevents repeated selection, and closes on its matching successful acknowledgement. Failure stays visible with the history retained for retry.
- Remote Session records have no standard runtime status. Current attached Sessions may show this client's in-memory status.
- Deletion requires advertised `sessionCapabilities.delete`, an initialized Agent and an idle lifecycle; streaming or waiting-approval Sessions block deletion.
- Delete requires inline confirmation naming the target. Cancel sends no request; pending deletion prevents repeated or conflicting operations for that Agent.
- Matching successful deletion removes the row, invalidates old list requests and refreshes page one, preserving search and keeping history open.
- Deletion failure retains the row/runtime for explicit retry; refresh failures after successful deletion are reported separately.
- The drawer can reopen during lifecycle work for viewing and copying. Opening/deleting Sessions remains disabled until the pending operation settles.
- Drawer epochs and connection generations fence late receipts. Old requests cannot modify another Agent's or reopened drawer's history.
- An obsolete history-operation generation releases only its own pending lock without assuming remote deletion succeeded.
- Transcript persistence, restoration and deleted-ID tombstones are absent from the storage port.
- Configuration persistence and separate input prompt history remain available.

## Closure and asynchronous work

- Closing a connection preempts pending initialization, creation, loading, prompts and approval waits.
- Generation and runtime revision fences reject stale operations and suppress late state updates.
- Replacement detaches the old runtime before starting the remote request. Failure preserves its detached transcript with prompts disabled.
- Closing a Session performs bounded remote cancel/close cleanup and releases its local runtime.
- Cleanup failures remain visible in connection information.
- Process disposal sends SIGTERM, waits up to 5000 ms, then escalates to SIGKILL.
- Extension deactivation awaits test-process cleanup and disposes the Session hub and process manager.

## Configuration

- Editable fields include name, executable, quoted arguments, working directory, environment and enabled state.
- Pure argument parsing preserves quoted spaces. The executable runs directly without a command shell.
- Optional existing configuration fields survive form serialization.
- Saves and deletes serialize through configuration revision checks; stale requests cannot resurrect deleted configurations.
- Connected or connecting configurations cannot be deleted. Saves affect the next connection.
- Directory picker results apply only to their originating draft and unchanged working-directory revision.
- WebSocket configurations remain representable but launching, testing and saving unsupported transport rejects explicitly.
- Activation preserves existing configurations and intentionally empty configurations after first initialization.

## Isolated connection tests

- Tests use unsaved draft values and an independently owned temporary process.
- Request/config/draft correlation prevents results from attaching to another form.
- Initialization has a 10000 ms deadline; cancellation and disposal fence late success.
- Adapter closure and SIGTERM/SIGKILL cleanup occur on success, failure, timeout and cancellation.
- Test output is bounded, and results settle after process cleanup.
