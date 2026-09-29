# Spec: Agent Connection Controls & Per-Message History Forking

milestone: M4.1

## Decisions

contract: HeaderComponent & UI Controls
- Remove `[Fork]` button (`data-action="fork"`) from top header (`HeaderComponent`).
- Add Agent Selector dropdown (`select.header-agent-select`) and prominent Connect / Disconnect button (`button.btn-header-connect`) in `HeaderComponent`:
  - When disconnected / stopped: displays `[⚡ Connect]` button. Clicking triggers connection / session creation with selected agent.
  - When running: displays glowing status indicator + `[⏹ Disconnect]` button.
  - Dropdown allows switching configured agents or selecting `+ New Agent...` (opens config drawer).

contract: ChatViewComponent Per-Message Forking & Empty State
- Per-message Fork button:
  - Inside each user message row (`.message-row.user`), render a `.user-message-toolbar` containing:
    - `button.btn-msg-fork`: `${ICONS.fork} <span>Fork</span>`
    - `button.btn-msg-copy`: `${ICONS.copy}`
  - Clicking `btn-msg-fork` dispatches `FORK_SESSION` action with `{ sourceSessionId, options: { upToMessageIndex } }`, branching the conversation cleanly from that specific turn.
- Welcome / Empty State Cockpit:
  - When chat messages are empty or when no agent is connected, render `.agent-welcome-card` in `.chat-scroll-area`:
    - Shows high-tech icon (`${ICONS.bolt}`), title "Connect an ACP Agent", agent dropdown selector, and primary `[⚡ Connect Agent]` button (`.btn-welcome-connect`).
    - Also includes `[⚙ Configure Agents]` button (`.btn-welcome-config`) opening the config drawer.

invariant:
- Single Send/Stop toggle button contract (`.btn-toggle-action`) in input dock is preserved.
- Backend session hub message-level branching logic (`upToMessageIndex`) is leveraged without breaking existing sessions.
- 100% headless core (`src/core/`) remains untouched and framework-free.

test:
- `npx vitest run test/webview/header.test.ts`
- `npx vitest run test/webview/chat-view.test.ts`
- `npx vitest run test/webview/`
- Full test suite `npm test` and `npm run lint`

convention:
- CSS variables from VS Code theme.
- SVG icons from `src/webview/components/icons.ts`.
