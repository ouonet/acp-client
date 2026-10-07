import { describe, it, expect, beforeEach, vi } from "vitest";
import { Session } from "../../src/core/session/session";
import { SessionHub } from "../../src/core/session/session-hub";
import type {
  IProcessPort,
  ProcessStatusEvent,
  Disposable,
} from "../../src/core/ports";
import { SessionError } from "../../src/core/errors";
import type { SessionEvent } from "../../src/core/types/session";

describe("T6: Multi-Session Hub & Session Forking Engine", () => {
  // Mock ProcessPort
  class MockProcessPort implements IProcessPort {
    private statusListeners = new Set<(e: ProcessStatusEvent) => void>();
    private statuses = new Map<string, any>();

    async start() {
      return {
        pid: 100,
        stdin: {} as any,
        stdout: {} as any,
        stderr: {} as any,
      };
    }
    async stop() {}
    async restart() {
      return { pid: 101 };
    }
    setStatus(agentId: string, status: any) {
      this.statuses.set(agentId, status);
    }
    getStatus(agentId: string) {
      return this.statuses.get(agentId) || "running";
    }
    onStatusChange(listener: (event: ProcessStatusEvent) => void): Disposable {
      this.statusListeners.add(listener);
      return {
        dispose: () => {
          this.statusListeners.delete(listener);
        },
      };
    }
    async dispose() {}

    simulateCrash(agentId: string, error: string) {
      this.statuses.set(agentId, "error");
      for (const listener of this.statusListeners) {
        listener({ agentId, status: "error", error });
      }
    }
  }

  // Mock Adapter
  function createMockAdapter() {
    let sessionUpdateHandler: ((event: any) => void) | null = null;
    let onRequestPermissionHandler: ((params: any) => Promise<any>) | null =
      null;

    let sessionCounter = 0;
    return {
      getAgentCapabilities: () => ({ loadSession: true, sessionCapabilities: { list: {}, delete: {} } }),
      close: vi.fn().mockResolvedValue(undefined),
      deleteSession: vi.fn().mockResolvedValue(true),
      async listSessionPage(params: any) { return { sessions: await this.listSessions(params) }; },
      newSession: vi.fn().mockImplementation(async () => {
        sessionCounter++;
        return { sessionId: `acp-session-${sessionCounter}` };
      }),
      listSessions: vi.fn().mockResolvedValue([
        {
          sessionId: "agent-remote-1",
          cwd: "/workspace/proj",
          title: "Remote Task A",
          updatedAt: "2026-09-30T11:00:00Z",
        },
      ]),
      loadSession: vi
        .fn()
        .mockImplementation(async (sessionId: string, _cwd: string) => {
          sessionUpdateHandler?.({
            sessionId,
            update: {
              sessionUpdate: "user_message_chunk",
              content: "Earlier user query",
            },
          });
          sessionUpdateHandler?.({
            sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: "Earlier answer",
            },
          });
          return {
            models: ["deepseek-v4-pro", "deepseek-v3"],
            currentModel: "deepseek-v4-pro",
            thinkingLevels: ["low", "medium", "high"],
            currentThinkingLevel: "medium",
            configOptions: [
              {
                id: "model",
                currentValue: "deepseek-v4-pro",
                options: [
                  { value: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
                  { value: "deepseek-v3", name: "DeepSeek V3" },
                ],
              },
            ],
          };
        }),
      prompt: vi
        .fn()
        .mockImplementation(async (sessionId: string, _prompt: any) => {
          // Simulate streamed thinking chunk
          sessionUpdateHandler?.({
            sessionId,
            update: {
              sessionUpdate: "agent_thought_chunk",
              content: { type: "text", text: "Thinking..." },
            },
          });
          // Simulate streamed message chunk
          sessionUpdateHandler?.({
            sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: "Hello result" },
            },
          });
          return { stopReason: "end_turn" };
        }),
      cancel: vi.fn().mockResolvedValue(undefined),
      onSessionUpdate: (listener: (event: any) => void) => {
        sessionUpdateHandler = listener;
        return {
          dispose: () => {
            sessionUpdateHandler = null;
          },
        };
      },
      simulateUpdate: (sessionId: string, update: any) => {
        sessionUpdateHandler?.({ sessionId, update });
      },
      simulatePermissionRequest: async (params: any) => {
        if (onRequestPermissionHandler) {
          return onRequestPermissionHandler(params);
        }
        return { outcome: { outcome: "cancelled" } };
      },
      setOnRequestPermission: (handler: any) => {
        onRequestPermissionHandler = handler;
      },
    };
  }

  let mockProcessPort: MockProcessPort;
  let mockAdapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    mockProcessPort = new MockProcessPort();
    mockAdapter = createMockAdapter();
  });

  describe("Session State Machine & Prompt Flow", () => {
    it("reserves the turn while model synchronization is pending", async () => {
      let finish!: () => void;
      Object.assign(mockAdapter, {
        setConfigOption: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              finish = resolve;
            }),
        ),
      });
      const session = new Session({
        id: "reserved",
        agentId: "agent-1",
        adapter: mockAdapter as any,
      });
      const first = session.prompt("First", { model: "other" });
      await expect(session.prompt("Second")).rejects.toThrow(SessionError);
      finish();
      await first;
      expect(
        session.messages.filter((message) => message.role === "user"),
      ).toHaveLength(1);
    });

    it("should start in idle, transition to streaming during prompt, and back to idle", async () => {
      const session = new Session({
        id: "sess-1",
        agentId: "agent-1",
        title: "New Chat",
        adapter: mockAdapter as any,
      });

      expect(session.status).toBe("idle");

      const events: SessionEvent[] = [];
      session.onEvent((e) => events.push(e));

      const promptPromise = session.prompt("Hello AI");
      expect(session.status).toBe("streaming");

      await promptPromise;

      expect(session.status).toBe("idle");
      expect(mockAdapter.prompt).toHaveBeenCalledWith(
        "sess-1",
        "Hello AI",
        undefined,
      );

      // Verify messages recorded
      const serialized = session.serialize();
      expect(serialized.messages).toHaveLength(2); // user + assistant
      expect(serialized.messages[0].role).toBe("user");
      expect(serialized.messages[0].content).toBe("Hello AI");
      expect(serialized.messages[1].role).toBe("assistant");
      expect(serialized.messages[1].content).toBe("Hello result");
      expect(serialized.messages[1].thinking).toBe("Thinking...");
    });

    it("should forbid concurrent prompt when session is already streaming", async () => {
      // Long-running prompt
      let finishPrompt!: () => void;
      mockAdapter.prompt.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishPrompt = () => resolve({ stopReason: "end_turn" });
          }),
      );

      const session = new Session({
        id: "sess-1",
        agentId: "agent-1",
        title: "New Chat",
        adapter: mockAdapter as any,
      });

      const p1 = session.prompt("First prompt");
      expect(session.status).toBe("streaming");

      await expect(session.prompt("Second prompt")).rejects.toThrow(
        SessionError,
      );

      finishPrompt();
      await p1;
      expect(session.status).toBe("idle");
    });

    it("should handle cancel during streaming turn", async () => {
      let cancelled = false;
      mockAdapter.prompt.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              if (cancelled) {
                resolve({ stopReason: "cancelled" });
              } else {
                resolve({ stopReason: "end_turn" });
              }
            }, 100);
          }),
      );

      mockAdapter.cancel.mockImplementationOnce(async () => {
        cancelled = true;
      });

      const session = new Session({
        id: "sess-1",
        agentId: "agent-1",
        title: "New Chat",
        adapter: mockAdapter as any,
      });

      const promptPromise = session.prompt("To be cancelled");
      expect(session.status).toBe("streaming");

      await session.cancel();
      expect(mockAdapter.cancel).toHaveBeenCalledWith("sess-1");

      await promptPromise;
      expect(session.status).toBe("idle");
    });

    it("should handle permission requests and approvals", async () => {
      let resolvePermissionResponse: any;
      mockAdapter.prompt.mockImplementationOnce(async (sessionId) => {
        // Trigger waiting_approval state in session
        const permPromise = new Promise((res) => {
          resolvePermissionResponse = res;
        });
        mockAdapter.simulateUpdate(sessionId, {
          sessionUpdate: "tool_call",
          toolCallId: "tc-1",
          title: "Format Disk",
          status: "pending",
        });
        session.requestApproval("req-1", "Format Disk", [
          { optionId: "opt-allow", name: "Allow" },
        ]);
        await permPromise;
        return { stopReason: "end_turn" };
      });

      const session = new Session({
        id: "sess-1",
        agentId: "agent-1",
        title: "New Chat",
        adapter: mockAdapter as any,
      });

      const events: SessionEvent[] = [];
      session.onEvent((e) => events.push(e));

      const p = session.prompt("Run format");
      // Wait for waiting_approval transition
      await new Promise((r) => setTimeout(r, 10));
      expect(session.status).toBe("waiting_approval");

      // Approving moves back to streaming and resolves
      await session.respondPermission("req-1", "allow");
      resolvePermissionResponse();

      await p;
      expect(session.status).toBe("idle");
    });
  });

  describe("Session Forking & History Immutability", () => {
    it("connects without creating or selecting a chat", async () => {
      const factory = vi.fn(async () => mockAdapter as any);
      const hub = new SessionHub({
        processManager: mockProcessPort,
        adapterFactory: factory,
      });
      await hub.connectAgent("agent-1");
      expect(factory).toHaveBeenCalledWith("agent-1");
      expect(mockAdapter.newSession).not.toHaveBeenCalled();
      expect(hub.listSessions()).toEqual([]);
      expect(hub.getActiveSession()).toBeUndefined();
    });

    it("creates a valid remote fork and sends cloned context until its first successful prompt", async () => {
      const hub = new SessionHub({
        processManager: mockProcessPort,
        adapterFactory: async () => mockAdapter as any,
      });
      const parent = await hub.createSession("agent-1");
      await parent.prompt("Original question");
      const fork = await hub.forkSession(parent.id);
      expect(fork.id).toBe("acp-session-2");
      expect(mockAdapter.newSession).toHaveBeenCalledTimes(2);
      mockAdapter.prompt.mockRejectedValueOnce(new Error("temporary failure"));
      await expect(fork.prompt("Continue")).rejects.toThrow(
        "temporary failure",
      );
      const firstPayload = mockAdapter.prompt.mock.calls.at(-1)![1];
      expect(JSON.stringify(firstPayload)).toContain("Original question");
      await fork.prompt("Retry");
      expect(
        JSON.stringify(mockAdapter.prompt.mock.calls.at(-1)![1]),
      ).toContain("Original question");
      await fork.prompt("Next");
      expect(mockAdapter.prompt.mock.calls.at(-1)![1]).toBe("Next");
      expect(parent.messages).toHaveLength(2);
    });

    it("uses native fork for complete same-agent history without injecting fallback context", async () => {
      const native = vi.fn().mockResolvedValue({ sessionId: "native-fork" });
      Object.assign(mockAdapter, { forkSession: native });
      const hub = new SessionHub({
        processManager: mockProcessPort,
        adapterFactory: async () => mockAdapter as any,
      });
      const parent = await hub.createSession("agent-1");
      await parent.prompt("Original");
      const fork = await hub.forkSession(parent.id);
      expect(fork.id).toBe("native-fork");
      expect(native).toHaveBeenCalledWith(parent.id, parent.cwd);
      await fork.prompt("Next");
      expect(mockAdapter.prompt.mock.calls.at(-1)![1]).toBe("Next");
    });

    it("uses native fork at the explicit final response boundary and lists it before any child prompt", async () => {
      const native = vi.fn(async () => {
        mockAdapter.listSessions.mockResolvedValue([{ sessionId: "native-footer-fork", cwd: "/workspace/proj", title: "Fork", updatedAt: "2026-10-05T00:00:00Z" }]);
        return { sessionId: "native-footer-fork" };
      });
      Object.assign(mockAdapter, { forkSession: native });
      const hub = new SessionHub({ processManager: mockProcessPort, adapterFactory: async () => mockAdapter as any });
      const parent = await hub.createSession("agent-1", "Parent", { cwd: "/workspace/proj" });
      await parent.prompt("Original");
      const child = await hub.forkSession(parent.id, { upToMessageIndex: 1 });
      expect(native).toHaveBeenCalledWith(parent.id, parent.cwd, 1);
      expect(mockAdapter.newSession).toHaveBeenCalledTimes(1);
      expect(child.forkedFromMessageIndex).toBe(1);
      expect((await hub.listAgentSessionPage("agent-1")).sessions.map(s => s.id)).toEqual([child.id]);
      await child.prompt("Continue");
      expect(mockAdapter.prompt.mock.calls.at(-1)![1]).toBe("Continue");
      await hub.dispose();
    });

    it("lists an acknowledged partial fork immediately when Agent history omits its empty remote session", async () => {
      const native = vi.fn().mockResolvedValue({ sessionId: "wrong-full-history" });
      Object.assign(mockAdapter, { forkSession: native });
      const hub = new SessionHub({ processManager: mockProcessPort, adapterFactory: async () => mockAdapter as any });
      const parent = await hub.createSession("agent-1", "Parent", { cwd: "/workspace/proj" });
      await parent.prompt("First"); await parent.prompt("Second");
      const child = await hub.forkSession(parent.id, { upToMessageIndex: 1 });
      expect(native).toHaveBeenCalledWith(parent.id, parent.cwd, 1);
      expect(child.id).toBe("wrong-full-history");
      expect(hub.getActiveSession()?.id).toBe(child.id);
      expect(mockAdapter.newSession).toHaveBeenCalledTimes(1);
      expect(child.messages).toHaveLength(2);
      const page = await hub.listAgentSessionPage("agent-1", { cwd: "/workspace/proj" });
      expect(page.sessions[0]).toMatchObject({ id: child.id, title: "Parent (Fork)", status: "idle", messageCount: 2 });
      expect(mockAdapter.prompt).toHaveBeenCalledTimes(2);
      expect((await hub.listAgentSessionPage("agent-1", { cwd: "/other" })).sessions.map(s => s.id)).not.toContain(child.id);
      expect((await hub.listAgentSessionPage("agent-1", { cursor: "next" })).sessions.map(s => s.id)).not.toContain(child.id);
      await hub.closeSession(child.id, "agent-1");
      expect((await hub.listAgentSessionPage("agent-1")).sessions.map(s => s.id)).not.toContain(child.id);
      await hub.dispose();
    });

    it("preserves unsent fallback context through a saved session snapshot", async () => {
      const hub = new SessionHub({
        processManager: mockProcessPort,
        adapterFactory: async () => mockAdapter as any,
      });
      const parent = await hub.createSession("agent-1");
      await parent.prompt("Retained original");
      const fork = await hub.forkSession(parent.id);
      const restored = new Session({
        ...fork.serialize(),
        adapter: mockAdapter as any,
      });
      await restored.prompt("Resume");
      expect(
        JSON.stringify(mockAdapter.prompt.mock.calls.at(-1)![1]),
      ).toContain("Retained original");
    });

    it("forks without accessing client chat persistence even when storage would fail", async () => {
      const saveSession = vi.fn().mockResolvedValue(undefined);
      const deleteSession = vi.fn().mockResolvedValue(true);
      Object.assign(mockAdapter, { deleteSession });
      const hub = new SessionHub({
        processManager: mockProcessPort,
        adapterFactory: async () => mockAdapter as any,
        storageManager: { saveSession } as any,
      });
      const parent = await hub.createSession("agent-1");
      const changed = vi.fn();
      hub.onSessionListChange(changed);
      saveSession.mockRejectedValueOnce(new Error("disk full"));
      const fork = await hub.forkSession(parent.id);
      expect(hub.listSessions().map((session) => session.id)).toEqual([fork.id]);
      expect(hub.getActiveSession()).toBe(fork);
      expect(saveSession).not.toHaveBeenCalled();
      expect(deleteSession).not.toHaveBeenCalled();
    });

    it("does not publish a phantom fork if remote creation fails", async () => {
      const hub = new SessionHub({
        processManager: mockProcessPort,
        adapterFactory: async () => mockAdapter as any,
      });
      const parent = await hub.createSession("agent-1");
      const changed = vi.fn();
      hub.onSessionListChange(changed);
      mockAdapter.newSession.mockRejectedValueOnce(
        new Error("remote unavailable"),
      );
      await expect(hub.forkSession(parent.id)).rejects.toThrow(
        "remote unavailable",
      );
      expect(hub.listSessions().map((session) => session.id)).toEqual([
        parent.id,
      ]);
      expect(hub.getActiveSession()?.id).toBe(parent.id);
      expect(parent.serialize()).toMatchObject({ attached: false, status: 'error' });
      expect(changed).toHaveBeenCalled();
    });
    it("retains the working directory across creation, serialization, and forking", async () => {
      const hub = new SessionHub({
        processManager: mockProcessPort,
        adapterFactory: async () => mockAdapter as any,
      });

      const parent = await hub.createSession("agent-1", "Parent", {
        cwd: "/workspace/project",
      });
      const fork = await hub.forkSession(parent.id);

      expect(mockAdapter.newSession).toHaveBeenCalledWith("/workspace/project");
      expect(parent.cwd).toBe("/workspace/project");
      expect(parent.serialize().cwd).toBe("/workspace/project");
      expect(fork.cwd).toBe("/workspace/project");
    });

    it("should deep clone message history without shared references and track lineage", async () => {
      const hub = new SessionHub({
        processManager: mockProcessPort,
        adapterFactory: async () => mockAdapter as any,
      });

      const parentSession = await hub.createSession(
        "agent-1",
        "Parent Session",
      );
      await parentSession.prompt("Message 1");
      await parentSession.prompt("Message 2");

      expect(parentSession.serialize().messages).toHaveLength(4);

      // Fork after message index 1 (meaning message 0 and 1: first turn)
      const forkedSession = await hub.forkSession(parentSession.id, {
        upToMessageIndex: 1,
        title: "Forked Route B",
      });

      expect(forkedSession.id).not.toBe(parentSession.id);
      expect(forkedSession.parentSessionId).toBe(parentSession.id);
      expect(forkedSession.forkedFromMessageIndex).toBe(1);
      expect(forkedSession.serialize().messages).toHaveLength(2);

      // Adding new messages to child should NOT affect parent
      await forkedSession.prompt("Forked Message 3");
      expect(forkedSession.serialize().messages).toHaveLength(4);
      expect(parentSession.serialize().messages).toHaveLength(4);
      expect(parentSession.serialize().messages[2].content).toBe("Message 2");
    });
  });

  describe("Multi-Session Management & Crash Cascade", () => {
    it("deletes unloaded remote history only after Agent acknowledgement without tombstones", async () => {
      const deleted = new Set<string>();
      const storageManager = {
        deleteSavedSession: vi.fn(async (id: string) => {
          deleted.add(id);
        }),
        getDeletedSessionIds: vi.fn(async () => [...deleted]),
      } as any;
      const hub = new SessionHub({
        processManager: mockProcessPort,
        storageManager,
        adapterFactory: async () => mockAdapter as any,
      });

      expect(
        (await hub.listAgentSessions("agent-1")).map((s) => s.id),
      ).toContain("agent-remote-1");
      mockAdapter.deleteSession.mockImplementationOnce(async () => {
        mockAdapter.listSessions.mockResolvedValue([]);
        return true;
      });
      await hub.deleteSession("agent-remote-1");
      expect(mockAdapter.deleteSession).toHaveBeenCalledWith("agent-remote-1");
      expect(storageManager.deleteSavedSession).not.toHaveBeenCalled();
      expect(storageManager.getDeletedSessionIds).not.toHaveBeenCalled();
      expect(
        (await hub.listAgentSessions("agent-1")).map((s) => s.id),
      ).not.toContain("agent-remote-1");
    });
    it("notifies the history list after deleting the active session", async () => {
      const hub = new SessionHub({
        processManager: mockProcessPort,
        adapterFactory: async () => mockAdapter as any,
      });
      const session = await hub.createSession("agent-1", "Active");
      const onListChange = vi.fn();
      hub.onSessionListChange(onListChange);

      await hub.deleteSession(session.id);

      expect(hub.getActiveSession()).toBeUndefined();
      expect(onListChange).toHaveBeenCalledWith([]);
    });

    it("should manage multiple concurrent sessions and track active session", async () => {
      const hub = new SessionHub({
        processManager: mockProcessPort,
        adapterFactory: async () => mockAdapter as any,
      });

      const s1 = await hub.createSession("agent-1", "Chat 1");
      const s2 = await hub.createSession("agent-2", "Chat 2");

      expect(hub.listSessions()).toHaveLength(2);
      expect(hub.getActiveSession()?.id).toBe(s2.id); // default last created

      hub.setActiveSession(s1.id);
      expect(hub.getActiveSession()?.id).toBe(s1.id);

      await hub.deleteSession(s2.id);
      expect(hub.listSessions()).toHaveLength(1);
      expect(hub.getSession(s2.id)).toBeUndefined();
    });

    it("should cascade agent crash to all active sessions bound to that agent", async () => {
      const hub = new SessionHub({
        processManager: mockProcessPort,
        adapterFactory: async () => mockAdapter as any,
      });

      const s1 = await hub.createSession(
        "agent-crash",
        "Session on crash agent",
      );
      const s2 = await hub.createSession("agent-safe", "Session on safe agent");

      // Put s1 in streaming
      let finishPrompt!: () => void;
      mockAdapter.prompt.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishPrompt = () => resolve({ stopReason: "end_turn" });
          }),
      );

      const s1PromptPromise = s1.prompt("Work work work");
      expect(s1.status).toBe("streaming");

      // Simulate process crash on agent-crash
      mockProcessPort.simulateCrash(
        "agent-crash",
        "Process terminated with SIGSEGV",
      );

      expect(s1.status).toBe("error");
      expect(s2.status).toBe("idle"); // unimpacted!

      // The pending prompt should have rejected due to crash
      await expect(s1PromptPromise).rejects.toThrow(SessionError);

      finishPrompt();
    });
  });

  describe("Connected Agent Session Sync & Replay", () => {
    it("should list sessions from running agent adapter and cache remote metadata", async () => {
      const hub = new SessionHub({
        processManager: mockProcessPort,
        adapterFactory: async () => mockAdapter as any,
      });

      const list = await hub.listAgentSessions("agent-1");
      expect(mockAdapter.listSessions).toHaveBeenCalled();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        id: "agent-remote-1",
        agentId: "agent-1",
        title: "Remote Task A",
      });
    });

    it("should return empty list when agent is not running", async () => {
      mockProcessPort.setStatus("agent-off", "stopped");
      const hub = new SessionHub({
        processManager: mockProcessPort,
        adapterFactory: async () => mockAdapter as any,
      });

      const list = await hub.listAgentSessions("agent-off");
      expect(list).toEqual([]);
    });

    it("should restore and replay remote agent session into hub", async () => {
      const hub = new SessionHub({
        processManager: mockProcessPort,
        adapterFactory: async () => mockAdapter as any,
      });

      await hub.listAgentSessions("agent-1");
      const restored = await hub.restoreSession("agent-remote-1");

      expect(restored).toBeDefined();
      expect(mockAdapter.loadSession).toHaveBeenCalledWith(
        "agent-remote-1",
        "/workspace/proj",
        [],
      );
      expect(restored?.messages).toHaveLength(2);
      expect(restored?.messages[0].content).toBe("Earlier user query");
      expect(restored?.model).toBe("deepseek-v4-pro");
      expect(restored?.availableModels).toEqual([
        "deepseek-v4-pro",
        "deepseek-v3",
      ]);
      expect(restored?.availableThinkingLevels).toEqual([]);
      expect(hub.getActiveSession()?.id).toBe("agent-remote-1");
    });

    it("ignores saved chat records and reloads a crashed current runtime from its Agent", async () => {
      const savedSessions = new Map<string, any>();
      const storageManager = {
        saveSession: vi.fn(async (data: any) => {
          savedSessions.set(data.id, data);
        }),
        loadSession: vi.fn(async (id: string) => savedSessions.get(id) || null),
      } as any;
      const hub = new SessionHub({
        processManager: mockProcessPort,
        storageManager,
        adapterFactory: async () => mockAdapter as any,
      });

      await storageManager.saveSession({
        id: "sess-empty-models",
        agentId: "agent-1",
        title: "Previous Session",
        cwd: "/workspace/proj",
        model: "deepseek-v4-pro",
        thinkingLevel: "medium",
        availableModels: [],
        availableThinkingLevels: [],
        createdAt: 1000,
        updatedAt: 1000,
        status: "idle",
        messages: [],
      });

      expect(await hub.restoreSession("sess-empty-models")).toBeUndefined();
      expect(storageManager.loadSession).not.toHaveBeenCalled();
      const session = await hub.restoreSession("sess-empty-models", "agent-1");
      expect(session).toBeDefined();
      expect(session?.availableModels).toEqual([
        "deepseek-v4-pro",
        "deepseek-v3",
      ]);
      expect(session?.availableThinkingLevels).toEqual([]);

      mockProcessPort.simulateCrash('agent-1', 'crash');
      expect(session?.serialize().attached).toBe(false);
      await hub.connectAgent("agent-1");
      const reloaded = hub.getActiveSession();
      expect(reloaded).not.toBe(session);
      expect(reloaded?.availableModels).toEqual(["deepseek-v4-pro", "deepseek-v3"]);
      expect(reloaded?.messages).toHaveLength(2);
    });
  });
});
