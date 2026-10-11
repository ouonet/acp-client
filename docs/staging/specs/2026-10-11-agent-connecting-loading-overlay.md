# Spec: Agent Connecting Loading Overlay in Conversation Viewport

## Problem
Currently, when connecting to an Agent or updating a session (via the welcome cockpit "Connect Agent" button or header bar tab), the UI only displays a plain, unstyled text line `Updating Agent / Session…` in the header bar. The conversation viewport (`.main-content` / `.chat-view`) remains completely static and active, lacking visual waiting feedback, which leads to confusion and potential duplicate clicks.

## Decisions

contract:
- Component: `src/webview/components/chat/chat-loading-overlay.tsx`
  - Props: `{ mode: "connecting" | "session" | "updating"; agentName?: string }`
  - Renders:
    - `.chat-loading-overlay` container with `role="status"` and `aria-live="polite"`
    - `.chat-loading-card` with an animated SVG spinner (`.chat-loading-spinner`)
    - Dynamic status title (e.g., "Connecting to Agent…" or "Initializing Session…")
    - Subtitle explaining the operation (e.g., "Establishing protocol communication with Agent process…")
- HeaderBar cleanup:
  - Remove the legacy plain text block `{currentPending && <div role="status" className="lifecycle-progress">Updating Agent / Session…</div>}` from `src/webview/components/header/header-bar.tsx`.
- Overlay placement:
  - Render inside `.main-content` (in `src/webview/components/app.tsx` or `src/webview/components/chat/chat-view.tsx`) as an absolute overlay layer covering the conversation area.

invariant:
- Absolute boundary: The loading overlay covers the `.main-content` area only, without obstructing the top header controls or tabs.
- Interaction safety: Pointer events inside the conversation area are intercepted (`pointer-events: auto` on overlay) while active to prevent redundant clicks.
- Architectural purity: `src/core/` remains 100% untouched; only UI layer (`src/webview/`) is modified.
- Theme fidelity: Uses CSS variables (`--bg-primary`, `--accent-color`, `--fg-primary`, `--fg-muted`, `--border-subtle`, `--card-bg`) supporting dark, light, and high-contrast themes.

convention:
- Functional Core, Imperative Shell.
- Preact + TypeScript + Vanilla CSS token system.
- Zero external UI libraries.

test:
- Vitest component test in `test/webview/chat-loading-overlay.test.tsx`:
  1. Displays loading overlay with spinner and title when `lifecyclePending` is active for the agent.
  2. Displays "Connecting to Agent…" when agent connection is not yet initialized.
  3. Displays "Initializing Session…" when agent is initialized but session is being created.
  4. Hides overlay when `lifecyclePending` clears and active session is ready.
  5. Verifies header bar no longer renders the bare text line `Updating Agent / Session…`.

deferred:
- Cancel button on the overlay for long-running connections (deferred to future lifecycle timeout feature).

## Working notes
- Approach 1: Inline spinner in the "Connect Agent" button. (Ruled out: does not solve user's request for full conversation area greying out).
- Approach 2 (Selected): Conversation area frosted glass dimming overlay (`backdrop-filter: blur(2px)`, background opacity, centered spinner card) + removing the raw header text line. Best user experience matching Zed / modern VS Code standards.
