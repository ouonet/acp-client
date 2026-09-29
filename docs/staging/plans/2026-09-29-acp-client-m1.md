# Plan: M1 Headless Core ACP Engine & Test Suite

Reference: [docs/staging/specs/2026-09-29-acp-client.md](file:///Users/neo/workbench/test/ai/harness/acp-client/docs/staging/specs/2026-09-29-acp-client.md)
Milestone: M1 (see [docs/ROADMAP.md](file:///Users/neo/workbench/test/ai/harness/acp-client/docs/ROADMAP.md))

## Tasks

- [x] T1: Project Scaffolding & Tooling Setup
  goal: Scaffold TypeScript project structure, Vitest test runner, build scripts, ESLint/Prettier, README, CHANGELOG, .gitignore, and Makefile.
  files: package.json, tsconfig.json, vitest.config.ts, .gitignore, Makefile, README.md, CHANGELOG.md
  acceptance: `npm install && npm test` runs cleanly with exit code 0; `npm run lint` passes.
  spec: docs/staging/specs/2026-09-29-acp-client.md#conventions

- [ ] T2: Core Domain Models, Errors & Ports Definition
  goal: Define strict TypeScript domain models, state enums, ports (IProcessPort, ITransportPort, IWorkspacePort, IStoragePort), and custom error classes.
  files: src/core/types/config.ts, src/core/types/session.ts, src/core/ports/index.ts, src/core/errors/index.ts
  acceptance: `npx tsc --noEmit` passes with zero type errors under strict mode.
  spec: docs/staging/specs/2026-09-29-acp-client.md#contracts

- [ ] T3: Atomic Storage Manager & History Ring Buffer
  goal: Implement StorageManager with atomic file persistence (.tmp -> rename), session serialization, and deduplicating prompt history ring buffer.
  files: src/core/storage/storage-manager.ts, test/core/storage-manager.test.ts
  acceptance: `npx vitest run test/core/storage-manager.test.ts` passes all tests covering atomic writes, corrupted file recovery, and input history bounds.
  spec: docs/staging/specs/2026-09-29-acp-client.md#4-storage--history-srccorestoragestorage-managerts

- [ ] T4: Process Manager with Zombie-Free Lifecycle Supervision
  goal: Implement ProcessManager to spawn, monitor, restart ACP Agent child processes with status events and SIGTERM -> 5000ms SIGKILL timeout protection.
  files: src/core/process/process-manager.ts, test/core/process-manager.test.ts
  acceptance: `npx vitest run test/core/process-manager.test.ts` passes all tests verifying process spawning, status events, auto-restart, and timeout kill.
  spec: docs/staging/specs/2026-09-29-acp-client.md#2-process-manager-srccoreprocessprocess-managerts

- [ ] T5: ACP SDK Client Transport Adapter
  goal: Implement AcpClientAdapter wrapping @agentclientprotocol/sdk client fluent API over child process stdio with capability negotiation (v1 and v2).
  files: src/core/protocol/acp-client-adapter.ts, test/core/acp-client-adapter.test.ts
  acceptance: `npx vitest run test/core/acp-client-adapter.test.ts` passes with mock stdio streams (PassThrough) proving initialize handshake and event parsing.
  spec: docs/staging/specs/2026-09-29-acp-client.md#architecture

- [ ] T6: Multi-Session Hub & Session Forking Engine
  goal: Implement Session FSM (idle | streaming | waiting_approval | error) and SessionHub with concurrent execution, crash cascade, and immutable session forking.
  files: src/core/session/session.ts, src/core/session/session-hub.ts, test/core/session-hub.test.ts
  acceptance: `npx vitest run test/core/session-hub.test.ts` passes all tests verifying parallel session dispatch, crash cascade, and deep-clone fork isolation.
  spec: docs/staging/specs/2026-09-29-acp-client.md#3-session--session-hub-srccoresessionsessionts-srccoresessionsession-hubts

- [ ] T7: M1 Integration Verification & Baseline Green
  goal: Assemble ProcessManager, AcpClientAdapter, SessionHub, and StorageManager into an end-to-end headless integration suite verifying a full conversation turn with fork and crash recovery.
  files: test/integration/headless-engine.test.ts
  acceptance: `npm test` runs all unit and integration test suites with 100% green; `npm run build` succeeds without warnings.
  spec: docs/staging/specs/2026-09-29-acp-client.md#tests
