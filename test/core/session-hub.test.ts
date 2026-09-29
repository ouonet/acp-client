import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Session } from '../../src/core/session/session';
import { SessionHub } from '../../src/core/session/session-hub';
import type { IProcessPort, ProcessStatusEvent, Disposable } from '../../src/core/ports';
import { SessionError } from '../../src/core/errors';
import type { SessionEvent } from '../../src/core/types/session';

describe('T6: Multi-Session Hub & Session Forking Engine', () => {
  // Mock ProcessPort
  class MockProcessPort implements IProcessPort {
    private statusListeners = new Set<(e: ProcessStatusEvent) => void>();
    private statuses = new Map<string, any>();

    async start() {
      return { pid: 100, stdin: {} as any, stdout: {} as any, stderr: {} as any };
    }
    async stop() {}
    async restart() {
      return { pid: 101 };
    }
    getStatus(agentId: string) {
      return this.statuses.get(agentId) || 'running';
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
      this.statuses.set(agentId, 'error');
      for (const listener of this.statusListeners) {
        listener({ agentId, status: 'error', error });
      }
    }
  }

  // Mock Adapter
  function createMockAdapter() {
    let sessionUpdateHandler: ((event: any) => void) | null = null;
    let onRequestPermissionHandler: ((params: any) => Promise<any>) | null = null;

    let sessionCounter = 0;
    return {
      newSession: vi.fn().mockImplementation(async () => {
        sessionCounter++;
        return { sessionId: `acp-session-${sessionCounter}` };
      }),
      prompt: vi.fn().mockImplementation(async (sessionId: string, _prompt: any) => {
        // Simulate streamed thinking chunk
        sessionUpdateHandler?.({
          sessionId,
          update: { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Thinking...' } },
        });
        // Simulate streamed message chunk
        sessionUpdateHandler?.({
          sessionId,
          update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello result' } },
        });
        return { stopReason: 'end_turn' };
      }),
      cancel: vi.fn().mockResolvedValue(undefined),
      onSessionUpdate: (listener: (event: any) => void) => {
        sessionUpdateHandler = listener;
        return { dispose: () => { sessionUpdateHandler = null; } };
      },
      simulateUpdate: (sessionId: string, update: any) => {
        sessionUpdateHandler?.({ sessionId, update });
      },
      simulatePermissionRequest: async (params: any) => {
        if (onRequestPermissionHandler) {
          return onRequestPermissionHandler(params);
        }
        return { outcome: { outcome: 'cancelled' } };
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

  describe('Session State Machine & Prompt Flow', () => {
    it('should start in idle, transition to streaming during prompt, and back to idle', async () => {
      const session = new Session({
        id: 'sess-1',
        agentId: 'agent-1',
        title: 'New Chat',
        adapter: mockAdapter as any,
      });

      expect(session.status).toBe('idle');

      const events: SessionEvent[] = [];
      session.onEvent((e) => events.push(e));

      const promptPromise = session.prompt('Hello AI');
      expect(session.status).toBe('streaming');

      await promptPromise;

      expect(session.status).toBe('idle');
      expect(mockAdapter.prompt).toHaveBeenCalledWith('sess-1', 'Hello AI', undefined);

      // Verify messages recorded
      const serialized = session.serialize();
      expect(serialized.messages).toHaveLength(2); // user + assistant
      expect(serialized.messages[0].role).toBe('user');
      expect(serialized.messages[0].content).toBe('Hello AI');
      expect(serialized.messages[1].role).toBe('assistant');
      expect(serialized.messages[1].content).toBe('Hello result');
      expect(serialized.messages[1].thinking).toBe('Thinking...');
    });

    it('should forbid concurrent prompt when session is already streaming', async () => {
      // Long-running prompt
      let finishPrompt!: () => void;
      mockAdapter.prompt.mockImplementationOnce(() => new Promise((resolve) => {
        finishPrompt = () => resolve({ stopReason: 'end_turn' });
      }));

      const session = new Session({
        id: 'sess-1',
        agentId: 'agent-1',
        title: 'New Chat',
        adapter: mockAdapter as any,
      });

      const p1 = session.prompt('First prompt');
      expect(session.status).toBe('streaming');

      await expect(session.prompt('Second prompt')).rejects.toThrow(SessionError);

      finishPrompt();
      await p1;
      expect(session.status).toBe('idle');
    });

    it('should handle cancel during streaming turn', async () => {
      let cancelled = false;
      mockAdapter.prompt.mockImplementationOnce(() => new Promise((resolve) => {
        setTimeout(() => {
          if (cancelled) {
            resolve({ stopReason: 'cancelled' });
          } else {
            resolve({ stopReason: 'end_turn' });
          }
        }, 100);
      }));

      mockAdapter.cancel.mockImplementationOnce(async () => {
        cancelled = true;
      });

      const session = new Session({
        id: 'sess-1',
        agentId: 'agent-1',
        title: 'New Chat',
        adapter: mockAdapter as any,
      });

      const promptPromise = session.prompt('To be cancelled');
      expect(session.status).toBe('streaming');

      await session.cancel();
      expect(mockAdapter.cancel).toHaveBeenCalledWith('sess-1');

      await promptPromise;
      expect(session.status).toBe('idle');
    });

    it('should handle permission requests and approvals', async () => {
      let resolvePermissionResponse: any;
      mockAdapter.prompt.mockImplementationOnce(async (sessionId) => {
        // Trigger waiting_approval state in session
        const permPromise = new Promise((res) => { resolvePermissionResponse = res; });
        mockAdapter.simulateUpdate(sessionId, {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-1',
          title: 'Format Disk',
          status: 'pending',
        });
        session.requestApproval('req-1', 'Format Disk', [{ optionId: 'opt-allow', name: 'Allow' }]);
        await permPromise;
        return { stopReason: 'end_turn' };
      });

      const session = new Session({
        id: 'sess-1',
        agentId: 'agent-1',
        title: 'New Chat',
        adapter: mockAdapter as any,
      });

      const events: SessionEvent[] = [];
      session.onEvent((e) => events.push(e));

      const p = session.prompt('Run format');
      // Wait for waiting_approval transition
      await new Promise((r) => setTimeout(r, 10));
      expect(session.status).toBe('waiting_approval');

      // Approving moves back to streaming and resolves
      await session.respondPermission('req-1', 'allow');
      resolvePermissionResponse();

      await p;
      expect(session.status).toBe('idle');
    });
  });

  describe('Session Forking & History Immutability', () => {
    it('should deep clone message history without shared references and track lineage', async () => {
      const hub = new SessionHub({
        processManager: mockProcessPort,
        adapterFactory: async () => mockAdapter as any,
      });

      const parentSession = await hub.createSession('agent-1', 'Parent Session');
      await parentSession.prompt('Message 1');
      await parentSession.prompt('Message 2');

      expect(parentSession.serialize().messages).toHaveLength(4);

      // Fork after message index 1 (meaning message 0 and 1: first turn)
      const forkedSession = await hub.forkSession(parentSession.id, {
        upToMessageIndex: 1,
        title: 'Forked Route B',
      });

      expect(forkedSession.id).not.toBe(parentSession.id);
      expect(forkedSession.parentSessionId).toBe(parentSession.id);
      expect(forkedSession.forkedFromMessageIndex).toBe(1);
      expect(forkedSession.serialize().messages).toHaveLength(2);

      // Adding new messages to child should NOT affect parent
      await forkedSession.prompt('Forked Message 3');
      expect(forkedSession.serialize().messages).toHaveLength(4);
      expect(parentSession.serialize().messages).toHaveLength(4);
      expect(parentSession.serialize().messages[2].content).toBe('Message 2');
    });
  });

  describe('Multi-Session Management & Crash Cascade', () => {
    it('should manage multiple concurrent sessions and track active session', async () => {
      const hub = new SessionHub({
        processManager: mockProcessPort,
        adapterFactory: async () => mockAdapter as any,
      });

      const s1 = await hub.createSession('agent-1', 'Chat 1');
      const s2 = await hub.createSession('agent-2', 'Chat 2');

      expect(hub.listSessions()).toHaveLength(2);
      expect(hub.getActiveSession()?.id).toBe(s2.id); // default last created

      hub.setActiveSession(s1.id);
      expect(hub.getActiveSession()?.id).toBe(s1.id);

      await hub.deleteSession(s2.id);
      expect(hub.listSessions()).toHaveLength(1);
      expect(hub.getSession(s2.id)).toBeUndefined();
    });

    it('should cascade agent crash to all active sessions bound to that agent', async () => {
      const hub = new SessionHub({
        processManager: mockProcessPort,
        adapterFactory: async () => mockAdapter as any,
      });

      const s1 = await hub.createSession('agent-crash', 'Session on crash agent');
      const s2 = await hub.createSession('agent-safe', 'Session on safe agent');

      // Put s1 in streaming
      let finishPrompt!: () => void;
      mockAdapter.prompt.mockImplementationOnce(() => new Promise((resolve) => {
        finishPrompt = () => resolve({ stopReason: 'end_turn' });
      }));

      const s1PromptPromise = s1.prompt('Work work work');
      expect(s1.status).toBe('streaming');

      // Simulate process crash on agent-crash
      mockProcessPort.simulateCrash('agent-crash', 'Process terminated with SIGSEGV');

      expect(s1.status).toBe('error');
      expect(s2.status).toBe('idle'); // unimpacted!

      // The pending prompt should have rejected due to crash
      await expect(s1PromptPromise).rejects.toThrow(SessionError);

      finishPrompt();
    });
  });
});
