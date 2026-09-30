# Spec: UI Layout Ergonomics, Multiline Input, and Professional SVG Iconography

milestone: M4 (see docs/ROADMAP.md)

## Decisions

contract: InputBoxComponent DOM & UI Layout
- Unified card layout for input dock:
  - Top: `.attachment-previews` and `.input-box-wrapper` containing auto-growing `<textarea class="prompt-input">`.
  - Bottom: `.input-toolbar` with:
    - `.toolbar-left`: Attach button (`.btn-attach`), Model selector (`select.model-select`), Thinking selector (`select.thinking-select`).
    - `.toolbar-right`: Dynamic Send/Stop button (`button.btn-toggle-action`).
- Multiline input & auto-grow:
  - `<textarea>` automatically adjusts height on `input` event from 36px up to 240px; scrollbar appears if > 240px.
  - Enter sends message; Shift+Enter creates a new line without sending.
  - Reset height back to 36px after message submission or clear.
- Professional SVG Iconography:
  - Eliminate childish emojis (`🔀`, `⚙`, `🕒`, `📎`, `🧠`, `⏹`, `⏎`, `🖼`, `✕`, `📋`, `📥`, `🔌`, `▾`, `▸`, `⚡`).
  - Introduce `src/webview/components/icons.ts` providing themeable SVG vector icons using `currentColor`.
  - Header, input dock, thinking block, code blocks, diff viewer, and MCP inspector updated with crisp SVGs.
- Extension Brand Identity:
  - `media/icon.svg` vector design + `media/icon.png` 512x512 high-resolution icon, both with transparent backgrounds (no filled backdrop).
  - Regenerate the marketplace PNG from the SVG with `rsvg-convert --format png --width 512 --height 512 --output media/icon.png media/icon.svg`.
  - Registered in `package.json` under `"icon": "media/icon.png"`.

invariant:
- Single Send/Stop toggle button contract (`.btn-toggle-action`) is preserved.
- Disabled state and placeholders for model/thinking selectors (`-- No Model --` / `Thinking: --`) remain strictly intact when disconnected.
- 100% headless core (`src/core/`) remains untouched and framework-free.
- All existing webview and core test suites must pass without regression.

test:
- `npx vitest run test/webview/input-box.test.ts`
- `npx vitest run test/webview/main-app.test.ts`
- `npm test` (all 100+ tests green)
- `npm run lint` (0 errors, 0 warnings)
- `npm run build:prod`

convention:
- Semantic CSS tokens using VS Code CSS theme variables (`--fg-muted`, `--accent-color`, `--border-subtle`).
- SVG icons sized at 13-16px, `stroke="currentColor"` or `fill="currentColor"`.

deferred:
- User-customizable keyboard shortcut bindings for Send/Newline.

## Working notes
- Checked existing tests in `test/webview/input-box.test.ts`: requires `.btn-toggle-action` with class `send`/`stop`, text containing 'Send'/'Stop', `.attachment-previews`, `select.model-select`, `select.thinking-select`, and `textarea.prompt-input`.
- Current layout had top-bar above input. Moving toolbar below input matches ChatGPT / Claude / Zed / Cursor modern chat layout where typing is primary and settings/actions sit on the bottom shelf.
