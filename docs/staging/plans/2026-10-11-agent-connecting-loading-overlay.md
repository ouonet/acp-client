# Plan: Agent Connecting Loading Overlay in Conversation Viewport

Reference: docs/staging/specs/2026-10-11-agent-connecting-loading-overlay.md

- [x] T1: Write unit tests in `test/webview/chat-loading-overlay.test.tsx` validating overlay display during connecting/session pending states and removal of bare text line in header
  goal: Create failing tests defining expected loading overlay behavior and header cleanup
  files: test/webview/chat-loading-overlay.test.tsx
  acceptance: `npx vitest run test/webview/chat-loading-overlay.test.tsx` fails for the right reasons
  spec: docs/staging/specs/2026-10-11-agent-connecting-loading-overlay.md#test

- [x] T2: Implement `ChatLoadingOverlay` component and connect state in `src/webview/components/chat/` and `src/webview/components/app.tsx`
  goal: Render loading overlay with spinner, dynamic title and subtitle when agent or session is pending
  files: src/webview/components/chat/chat-loading-overlay.tsx, src/webview/components/app.tsx
  acceptance: Overlay renders when lifecycle pending is active in state
  spec: docs/staging/specs/2026-10-11-agent-connecting-loading-overlay.md#contract

- [x] T3: Remove legacy bare text `Updating Agent / Session…` in `src/webview/components/header/header-bar.tsx`
  goal: Clean up outdated plain text line from header bar
  files: src/webview/components/header/header-bar.tsx
  acceptance: Header bar no longer renders the `.lifecycle-progress` raw text element
  spec: docs/staging/specs/2026-10-11-agent-connecting-loading-overlay.md#contract

- [x] T4: Add styling for `.chat-loading-overlay`, `.chat-loading-card`, `.chat-loading-spinner` in `src/webview/styles/chat.css`
  goal: Provide beautiful glassmorphism backdrop, dimming effect, and smooth CSS spinner animation
  files: src/webview/styles/chat.css
  acceptance: Visual styles defined with CSS variables adhering to VS Code design system
  spec: docs/staging/specs/2026-10-11-agent-connecting-loading-overlay.md#invariant

- [x] T5: Run full test suite and build verification
  goal: Ensure all existing 462+ tests and new tests pass with zero regressions
  files: test/
  acceptance: `npm test` and `npm run build` pass 100%
  spec: docs/staging/specs/2026-10-11-agent-connecting-loading-overlay.md#test
