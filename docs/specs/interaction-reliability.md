# Interaction reliability

## File changes

- Partial unified hunks are preview-only; they never become replacement file contents.
- Applying requires complete original and modified text, a matching current file, and explicit confirmation.
- The host rechecks after confirmation; the workspace adapter validates expected text and uses a version-guarded editor edit.
- Missing capabilities, conflicts, cancellation, and invalid content do not write files.

## Permissions

- ACP requests route to their owning Agent session and register pending approval before broadcasting events.
- Runtime snapshots include pending request IDs, tool titles, and offered options; persistence excludes pending promises.
- Responses validate request and offered option identifiers. Invalid replies leave the request pending.
- Cancellation, Agent failure, and disposal settle pending approval. Unknown sessions cancel immediately.

## Prompts and snapshots

- `SEND_PROMPT` includes a request ID and optionally the selected Agent ID.
- `PROMPT_RESULT` reports `accepted`, `completed`, or `rejected` with request ID and session ID.
- Matching acceptance clears submitted text and attachments only when both text and draft revision still match the pending submission.
- Rejection before acceptance preserves input for retry. Completion releases the submission lock; newer drafts survive earlier replies.
- Text edits, attachment changes, restored prompts and history recall count as newer drafts, even when text is identical.
- A pending submission blocks duplicate sends until completion or rejection.
- Same-session snapshots retain streamed text and pending approval. Switching rebuilds from the target session.
- Empty model metadata clears stale selection. Changing the selected Agent clears conversation-specific model choices.

## Agent and session intents

- Selecting an Agent changes selection; Connect initializes that Agent without creating a chat.
- New Chat creates a remote session. Sending with a different selected Agent creates a chat for that Agent.
- Opening Agent history loads the selected remote Session. Later prompts continue on that Session's existing ID; its transcript is not copied into a composer draft.
- `/clear` starts a new remote chat and keeps the previous chat in history.
- Fork uses native ACP support for a complete same-Agent history when available.
- Otherwise, Fork creates a remote session and supplies cloned parent context until its first successful prompt.
- Fallback context is persisted for retries; histories and ancestry remain independently cloned.

## Configuration and input

- Configuration drafts are retained per Agent across snapshots, tab changes, and closing/reopening.
- Saved WebSocket configurations remain visible for correction; unsupported transport cannot be saved, tested, or connected.
- Session history comes from the selected Agent's remote listing and loading capabilities. Input history recalls previous prompt text separately.
- Multiline arrow keys move the caret. Prompt recall uses single-line boundary navigation.
- Escape dismisses an input popup first; otherwise it cancels generation or pending approval.

## Verification

- Vitest covers core lifecycle, real SDK permission requests, mocked host file edits, and Webview failure/refresh paths.
- `npm test`, `npm run build`, and `npm run lint` verify the integrated checkout.
- External Agent behavior and native VS Code editor interaction require a separate manual acceptance run.
