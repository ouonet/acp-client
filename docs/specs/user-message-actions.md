# Conversation message actions

- User cards use an accent-tinted background and subtle inset outline that remain distinct in light and dark themes.
- Copy and Rewind / Undo float in one horizontal row at the card's right vertical midpoint, visible only during mouse hover. The toolbar overlays content without reserved padding, minimum card height or changes to text wrapping; leaving hides it even if focus remains.
- Copy preserves the original prompt text and line breaks.
- Agent/model/timestamp metadata and Copy all share a footer after the full assistant response and execution content. Copy and Fork sit together in the footer action group; the row wraps on narrow screens.
- A same-Agent Fork at the final response uses native ACP session/fork when advertised, even with an explicit message boundary. Earlier boundaries retain the isolated new-Session/context fallback.
- The first Agent history page includes the attached, acknowledged current Fork if remote listing omits it before its first prompt. It respects the workspace filter, adds no duplicate or pagination entry, and removes the supplement when the child closes or detaches. Fallback context reaches the Agent on the next successful prompt; this supplement does not persist transcripts.
- Fork creates and activates an Agent-issued Session containing history through the selected assistant response, excluding later messages.
- Rewind keeps the current Session ID. The boundary is the index before the selected user message. Core calls `_aharness/session/rewind`, then keeps messages through that boundary. The selected user message and later turns leave the Session. Workspace files are not written.
- Text and image prompts can be rewound. Any other block disables Rewind. After the snapshot message count matches the boundary and a successful `REWIND_SESSION` receipt names this Session, in either order, an untouched composer receives that prompt and does not send it. An existing draft, attachment, submission, or draft revision is kept.
- Fork leaves the source Session history unchanged. Child history is isolated by deep clone. Workspace files are not written.
- Fork confirmation requires a successful `FORK_SESSION` receipt whose `sessionId` is the child, plus that child's snapshot, in either order. Rewind does not use a child Session id.
- Streaming, approval, submission, disconnection, detached Sessions and pending lifecycle operations disable Fork/Rewind; Copy remains available.
- Rapid clicks send one request. Failures appear inline and preserve input.
- Navigation or Agent generation changes cancel pending restoration. Unconfirmed outcomes expire after 20 seconds without automatic retry; users can inspect Agent history.

Validation uses message action/safety regressions, bridge fork-result tests and browser checks against `dist/webview.js` and `dist/webview.css` at 280px and 360px in both themes. Browser host messages exercise receipt/snapshot ordering; live VS Code Agent execution is a separate acceptance environment.
