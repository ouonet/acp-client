# Architecture Rules: Clean Architecture & Engineering Principles

All coding agents working on this ACP Client repository must strictly follow these rules:

1. **Clean Architecture Dependency Rule**: `src/core/` is the domain and use-case core. It must never import `vscode` or any UI framework.
2. **Ports & Adapters**: Decouple external I/O (stdio child_process, WebSockets, filesystem, terminals) behind explicit TypeScript interfaces (`ITransportPort`, `IProcessPort`, `IWorkspacePort`, `IStoragePort`).
3. **State Machine Integrity**: Manage `ProcessStatus` and `SessionStatus` via explicit finite state transitions. Crash events must cascade cleanly.
4. **Session Fork Immutability**: Forking deep-clones history up to the cutoff index with zero mutation leakage into parent sessions.
5. **Functional Core, Imperative Shell**: Keep protocol framing, stream parsing, thinking extraction, diff calculation, and history ring buffers as pure functions.
6. **Safety & Zero Zombies**: Enforce SIGTERM + 5000ms SIGKILL timeout on child processes; enforce atomic rename (`.tmp` -> file) on all durable writes.
