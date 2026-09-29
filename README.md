# ACP Client for VS Code

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A production-grade, Clean Architecture **Agent Client Protocol (ACP)** client extension for VS Code, conforming to the Zed ACP open standard.

## Highest Principles (Clean Architecture)

See [AGENTS.md](./AGENTS.md) and [docs/ROADMAP.md](./docs/ROADMAP.md) for full architectural guidelines.
- **Dependency Rule**: `src/core/` is a pure headless TypeScript engine with **zero VS Code API dependencies**.
- **Ports & Adapters**: All external I/O (Stdio child_process, WebSockets, File system, Terminal, Storage) is abstracted behind explicit ports.
- **Strict State Machines**: Explicit finite state transitions with failure cascade protection.
- **Immutability & Forking**: Complete session physical isolation upon branching.
- **Zombie-Free Lifecycle**: SIGTERM + 5000ms SIGKILL timeout protection for all agent subprocesses.

## Quick Start

```bash
# Install dependencies
npm install

# Run unit tests (Vitest)
npm test

# Build TypeScript
npm run build

# Run linting
npm run lint
```
