import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProcessManager } from '../../src/core/process/process-manager';
import { AcpClientAdapter } from '../../src/core/protocol/acp-client-adapter';
import { SessionHub } from '../../src/core/session/session-hub';
import { StorageManager } from '../../src/core/storage/storage-manager';
import type { AgentConfig } from '../../src/core/types/config';

describe('T7: M1 Headless Core Engine Integration Suite', () => {
  let tempDir: string;
  let processManager: ProcessManager;
  let storageManager: StorageManager;
  let sessionHub: SessionHub;
  const adapters = new Map<string, AcpClientAdapter>();

  // A standalone Node script implementing ACP agent over stdio
  const agentScript = `
    const readline = require("readline");
    const rl = readline.createInterface({ input: process.stdin, terminal: false });

    rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line);
        if (msg.method === "initialize") {
          const res = {
            jsonrpc: "2.0",
            id: msg.id,
            result: {
              protocolVersion: 1,
              agentCapabilities: { loadSession: true }
            }
          };
          process.stdout.write(JSON.stringify(res) + "\\n");
        } else if (msg.method === "session/new") {
          const res = {
            jsonrpc: "2.0",
            id: msg.id,
            result: {
              sessionId: "real-session-" + Math.random().toString(36).substring(2, 8)
            }
          };
          process.stdout.write(JSON.stringify(res) + "\\n");
        } else if (msg.method === "session/prompt") {
          const sId = msg.params.sessionId;
          const text = msg.params.prompt[0]?.text;
          if (text === "CRASH_NOW") {
            process.exit(42);
          }
          // Send thought chunk
          const thoughtNotice = {
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: sId,
              update: {
                sessionUpdate: "agent_thought_chunk",
                content: { type: "text", text: "Analyzing query in real subprocess..." }
              }
            }
          };
          process.stdout.write(JSON.stringify(thoughtNotice) + "\\n");

          // Send message chunk
          const msgNotice = {
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: sId,
              update: {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: "Subprocess response to: " + JSON.stringify(msg.params.prompt[0].text) }
              }
            }
          };
          process.stdout.write(JSON.stringify(msgNotice) + "\\n");

          // Send prompt response
          const res = {
            jsonrpc: "2.0",
            id: msg.id,
            result: { stopReason: "end_turn" }
          };
          process.stdout.write(JSON.stringify(res) + "\\n");
        } else if (msg.method === "session/cancel") {
          // ack cancel
        }
      } catch (e) {
        // ignore
      }
    });
  `;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'acp-integration-test-'));
    processManager = new ProcessManager(300);
    storageManager = new StorageManager(tempDir);

    sessionHub = new SessionHub({
      processManager,
      storageManager,
      adapterFactory: async (agentId: string) => {
        let adapter = adapters.get(agentId);
        if (!adapter || !adapter.isConnected()) {
          const config: AgentConfig = {
            id: agentId,
            name: `Agent-${agentId}`,
            command: 'node',
            args: ['-e', agentScript],
            env: {},
            transport: 'stdio',
            enabled: true,
          };
          const proc = await processManager.start(config);
          adapter = new AcpClientAdapter({
            input: proc.stdout,
            output: proc.stdin,
            clientInfo: { name: 'acp-client-test', version: '0.1.0' },
          });
          await adapter.initialize();
          adapters.set(agentId, adapter);
        }
        return adapter;
      },
    });
  });

  afterEach(async () => {
    await sessionHub.dispose();
    for (const adapter of adapters.values()) {
      await adapter.close().catch(() => {});
    }
    adapters.clear();
    await processManager.dispose();
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('should run end-to-end full turn over real process stdio and persist atomically', async () => {
    const session = await sessionHub.createSession('agent-main', 'End-to-End Chat');

    expect(session.status).toBe('idle');
    expect(processManager.getStatus('agent-main')).toBe('running');

    await session.prompt('Hello ACP');

    expect(session.status).toBe('idle');
    const data = session.serialize();
    expect(data.messages).toHaveLength(2);
    expect(data.messages[0].content).toBe('Hello ACP');
    expect(data.messages[1].thinking).toContain('Analyzing query');
    expect(data.messages[1].content).toContain('Subprocess response');

    // Verify storage persistence
    const saved = await storageManager.loadSession(session.id);
    expect(saved).not.toBeNull();
    expect(saved?.id).toBe(session.id);
    expect(saved?.messages).toHaveLength(2);
  });

  it('should fork a session into an isolated branch with independent history', async () => {
    const parent = await sessionHub.createSession('agent-main', 'Root Thread');
    await parent.prompt('Turn 1 Question');

    const forked = await sessionHub.forkSession(parent.id, {
      title: 'Branch Thread',
    });

    expect(forked.id).not.toBe(parent.id);
    expect(forked.parentSessionId).toBe(parent.id);
    expect(forked.serialize().messages).toHaveLength(2);

    // Prompt the forked session
    await forked.prompt('Turn 2 Question on Branch');

    expect(forked.serialize().messages).toHaveLength(4);
    expect(parent.serialize().messages).toHaveLength(2); // parent unaffected!

    // Verify both exist independently in storage
    const savedParent = await storageManager.loadSession(parent.id);
    const savedForked = await storageManager.loadSession(forked.id);

    expect(savedParent?.messages).toHaveLength(2);
    expect(savedForked?.messages).toHaveLength(4);
  });

  it('should handle agent crash cascade and allow restarting process', async () => {
    const session = await sessionHub.createSession('agent-crashing', 'Fragile Chat');
    expect(session.status).toBe('idle');

    // Prompt the agent to crash itself unexpectedly
    const crashPrompt = session.prompt('CRASH_NOW');

    // Verify in-flight prompt rejects with error
    await expect(crashPrompt).rejects.toThrow();

    // Verify status cascaded to error
    expect(session.status).toBe('error');
    await new Promise((r) => setTimeout(r, 30));
    expect(processManager.getStatus('agent-crashing')).toBe('error');

    // Restart process
    const { pid } = await processManager.restart('agent-crashing');
    expect(pid).toBeGreaterThan(0);
    expect(processManager.getStatus('agent-crashing')).toBe('running');
  });
});
