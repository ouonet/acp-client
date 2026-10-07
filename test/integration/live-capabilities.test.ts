import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AcpClientAdapter } from "../../src/core/protocol/acp-client-adapter";
import { SessionHub } from "../../src/core/session/session-hub";

async function reap(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  try { await exited; } finally { clearTimeout(timer); }
}

// Opt in: creates isolated empty sessions and forks without running model prompts.
describe.skipIf(process.env.ACP_LIVE_FORKS !== "1")("Real ACP footer forks", () => {
  it.each([
    { name: "OpenCode", command: "opencode", args: ["acp"] },
    { name: "aharness", command: "uv", args: ["run", "--directory", "/Users/neo/workbench/test/ai/harness/aharness", "aharness", "acp", "serve"] },
  ])("$name creates a distinct native child present in remote history before prompting", async ({ name, command, args }) => {
    const cwd = await mkdtemp(join(tmpdir(), "acp-fork-regression-"));
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "ignore"] });
    let adapter: AcpClientAdapter | undefined;
    let hub: SessionHub | undefined;
    try {
      await once(child, "spawn");
      adapter = new AcpClientAdapter({ input: child.stdout!, output: child.stdin! });
      await adapter.initialize();
      const native = vi.spyOn(adapter, "forkSession");
      hub = new SessionHub({ processManager: { onStatusChange: () => ({ dispose() {} }), stop: async () => { await reap(child); } } as any, adapterFactory: async () => adapter! });
      const parent = await hub.createSession(name, "Fork regression", { cwd });
      const fork = await hub.forkSession(parent.id, { upToMessageIndex: parent.messages.length - 1 });
      expect(native).toHaveBeenCalledWith(parent.id, cwd);
      expect(fork.id).not.toBe(parent.id);
      expect(hub.getActiveSession()?.id).toBe(fork.id);
      const page = await adapter.listSessionPage({ cwd });
      expect(page.sessions.map(session => session.sessionId)).toContain(fork.id);
      expect((await hub.listAgentSessionPage(name, { cwd })).sessions.filter(session => session.id === fork.id)).toHaveLength(1);
    } finally {
      try { await hub?.dispose(); } finally {
        try { await adapter?.close(); } finally {
          await reap(child); await rm(cwd, { recursive: true, force: true });
        }
      }
    }
  }, 30000);
});

// Opt in: requires both locally installed agents; performs no prompts or session creation.
describe.skipIf(process.env.ACP_LIVE_CAPABILITIES !== "1")("Real ACP capability handshakes", () => {
  it.each([
    { name: "OpenCode", command: "opencode", args: ["acp"], expected: {
      loadSession: true, promptCapabilities: { image: true, embeddedContext: true },
      mcpCapabilities: { http: true, sse: true }, sessionCapabilities: { list: {}, fork: {}, resume: {}, close: {} },
    } },
    { name: "aharness", command: "uv", args: ["run", "--directory", "/Users/neo/workbench/test/ai/harness/aharness", "aharness", "acp", "serve"], expected: {
      loadSession: true, sessionCapabilities: { list: {}, delete: {}, fork: {}, resume: {}, close: {} },
    } },
  ])("$name preserves the agent declaration and actual client offer through the runtime snapshot", async ({ name, command, args, expected }) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "ignore"] });
    let adapter: AcpClientAdapter | undefined;
    let hub: SessionHub | undefined;
    try {
      await once(child, "spawn");
      adapter = new AcpClientAdapter({
        input: child.stdout!, output: child.stdin!,
        onReadTextFile: async () => "", onWriteTextFile: async () => {},
      });
      const result = await adapter.initialize();
      expect(result.protocolVersion).toBe(1);
      expect(result.agentInfo?.name).toBe(name);
      expect(result.agentCapabilities).toMatchObject(expected);
      hub = new SessionHub({
        processManager: {
          onStatusChange: () => ({ dispose() {} }),
          stop: async () => { await reap(child); },
        } as any,
        adapterFactory: async () => adapter!,
      });
      await hub.connectAgent(name);
      const summary = hub.getConnection(name)!;
      expect(summary.capabilities).toEqual(result.agentCapabilities);
      expect(summary.clientCapabilities).toEqual(adapter.getClientCapabilities());
      expect(summary.clientCapabilities?.fs).toEqual({ readTextFile: true, writeTextFile: true });
      expect(summary.clientCapabilities?.terminal).toBe(false);
      if (name === "aharness") {
        expect(summary.capabilities.promptCapabilities).toBeUndefined();
        expect(summary.capabilities.mcpCapabilities).toBeUndefined();
      }
    } finally {
      try { await hub?.dispose(); } finally {
        try { await adapter?.close(); } finally { await reap(child); }
      }
    }
  }, 30000);
});
