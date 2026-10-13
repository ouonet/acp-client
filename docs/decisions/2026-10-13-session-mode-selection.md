# ADR: ACP Session Mode State Parsing & Interactive Mode Picker

## context
ACP specification standardizes session modes via `SessionModeState`:
```json
{
  "currentModeId": "ask",
  "availableModes": [
    { "id": "ask", "name": "Ask", "description": "Ask permission" },
    { "id": "code", "name": "Code", "description": "Autonomous code" }
  ]
}
```
Directly iterating `options.modes` with `[...options.modes]` caused a runtime crash (`options.modes is not iterable`) when connecting ACP agents such as `aharness`. Furthermore, the Webview UI had no control for displaying current mode or switching between available modes.

## choice
1. **Defensive Mode Parsing**: `parseModes` and `parseCurrentModeId` pure functions in `AcpClientAdapter` handle both standard `SessionModeState` objects and legacy arrays.
2. **ACP Protocol Integration**: `AcpClientAdapter.setSessionMode` sends `session/set_mode` (`acp.methods.agent.session.setMode`). `Session` handles live `current_mode_update` notifications and emits `mode_change` events.
3. **IPC Bridge & Snapshot**: `SET_SESSION_MODE` action dispatched from Webview; `activeCurrentModeId` included in `WebviewStateSnapshot`.
4. **Preact ModePicker UI**: Reusable `ModePicker` component in `src/webview/components/input/mode-picker.tsx` with keyboard navigation, click-outside handling, and VS Code design tokens. Hidden when no modes are advertised.

## ruled-out
- Assuming `modes` is always an array: Violates official ACP SDK specification.
- Local-only mode tracking: Agent server must be kept in sync via `session/set_mode`.
