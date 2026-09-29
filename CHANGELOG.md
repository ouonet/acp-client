# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-29 - Milestone M1 (Headless Core ACP Engine)

### Added
- **Core Domain & Ports**: Clean Architecture ports (`IProcessPort`, `ITransportPort`, `IWorkspacePort`, `IStoragePort`), typed error hierarchy (`ProcessError`, `ProtocolError`, `SessionError`, `StorageError`), and session data models.
- **Atomic Storage**: `StorageManager` with `.tmp` -> rename atomic writes, corrupted file recovery, and deduplicating prompt history ring buffer (max 100 entries).
- **Process Supervision**: `ProcessManager` with zombie-free lifecycle management (`SIGTERM` -> 5000ms `SIGKILL` timeout escalation), status event streaming, and process auto-restart.
- **ACP SDK Integration**: `AcpClientAdapter` wrapping `@agentclientprotocol/sdk` (v1.5.1) client fluent API over child process stdio with capability negotiation (v1 and draft v2), multimodal block support (`image`, `audio`), tool call permission dispatch, and workspace FS integration.
- **Multi-Session Hub & Forking Engine**: `Session` explicit finite state machine (`idle | streaming | waiting_approval | error`), `SessionHub` with concurrent session scheduling, crash cascade isolation, and immutable session forking (`forkSession`) with lineage tracking.
- **End-to-End Headless Suite**: Comprehensive integration test suite verifying full multi-turn ACP conversation, thinking blocks, diffs, approvals, forking, and crash recovery. Zero VS Code Electron dependencies in core.
