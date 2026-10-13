import { describe, it, expect, vi } from "vitest";
import { Session } from "../../src/core/session/session";
import type { AcpClientAdapter } from "../../src/core/protocol/acp-client-adapter";
import { sessionReducer } from "../../src/webview/state/session-slice";

describe("Session Title Updates", () => {
  it("auto-derives title from the first prompt for a new session", async () => {
    const mockAdapter = {
      onSessionUpdate: vi.fn().mockReturnValue({ dispose: () => {} }),
      prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }),
      cancel: vi.fn().mockResolvedValue(undefined),
    } as unknown as AcpClientAdapter;

    const session = new Session({
      id: "sess-1",
      agentId: "agent-1",
      adapter: mockAdapter,
    });

    expect(session.title).toBe("New Session");

    const events: any[] = [];
    session.onEvent((e) => events.push(e));

    await session.prompt("Fix login authentication error\nDetailed description here");

    expect(session.title).toBe("Fix login authentication error");
    expect(events.some((e) => e.type === "session_info_update" && e.payload.title === "Fix login authentication error")).toBe(true);
  });

  it("does not overwrite a custom session title when prompting", async () => {
    const mockAdapter = {
      onSessionUpdate: vi.fn().mockReturnValue({ dispose: () => {} }),
      prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }),
      cancel: vi.fn().mockResolvedValue(undefined),
    } as unknown as AcpClientAdapter;

    const session = new Session({
      id: "sess-2",
      agentId: "agent-1",
      title: "My Custom Feature",
      adapter: mockAdapter,
    });

    expect(session.title).toBe("My Custom Feature");

    await session.prompt("Fix something else");

    expect(session.title).toBe("My Custom Feature");
  });

  it("updates title when receiving session_info_update from agent", () => {
    let updateCallback: ((event: any) => void) | undefined;
    const mockAdapter = {
      onSessionUpdate: vi.fn((cb) => {
        updateCallback = cb;
        return { dispose: () => {} };
      }),
      prompt: vi.fn(),
      cancel: vi.fn(),
    } as unknown as AcpClientAdapter;

    const session = new Session({
      id: "sess-3",
      agentId: "agent-1",
      adapter: mockAdapter,
    });

    const events: any[] = [];
    session.onEvent((e) => events.push(e));

    updateCallback!({
      sessionId: "sess-3",
      update: {
        sessionUpdate: "session_info_update",
        title: "Agent Generated Title",
        updatedAt: "2026-10-13T10:00:00Z",
      },
    });

    expect(session.title).toBe("Agent Generated Title");
    expect(events.some((e) => e.type === "session_info_update" && e.payload.title === "Agent Generated Title")).toBe(true);
  });

  it("updates activeSession title and session list in webview sessionReducer", () => {
    const initialState: any = {
      activeSession: {
        id: "sess-4",
        agentId: "agent-1",
        title: "New Session",
        updatedAt: 100,
      },
      sessions: [
        { id: "sess-4", title: "New Session", updatedAt: 100 },
        { id: "sess-other", title: "Other Session", updatedAt: 50 },
      ],
    };

    const nextState = sessionReducer(initialState, {
      type: "SESSION_EVENT",
      payload: {
        sessionId: "sess-4",
        type: "session_info_update",
        payload: {
          title: "Brand New Title",
          updatedAt: 200,
        },
      },
    } as any);

    expect(nextState.activeSession?.title).toBe("Brand New Title");
    expect(nextState.activeSession?.updatedAt).toBe(200);
    expect(nextState.sessions.find((s) => s.id === "sess-4")?.title).toBe("Brand New Title");
    expect(nextState.sessions.find((s) => s.id === "sess-4")?.updatedAt).toBe(200);
    expect(nextState.sessions.find((s) => s.id === "sess-other")?.title).toBe("Other Session");
  });

  it("updates sessionHub.listSessions() when session title updates", async () => {
    let updateCallback: ((event: any) => void) | undefined;
    const mockAdapter = {
      getAgentCapabilities: () => ({ loadSession: true }),
      newSession: vi.fn().mockResolvedValue({ sessionId: "sess-hub-1" }),
      onSessionUpdate: vi.fn((cb) => {
        updateCallback = cb;
        return { dispose: () => {} };
      }),
      prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }),
      cancel: vi.fn(),
      close: vi.fn(),
    };

    const mockProcess = {
      start: vi.fn().mockResolvedValue({ pid: 1 }),
      stop: vi.fn(),
      getStatus: vi.fn().mockReturnValue("running"),
      onStatusChange: vi.fn().mockReturnValue({ dispose: () => {} }),
      dispose: vi.fn(),
    };

    const { SessionHub } = await import("../../src/core/session/session-hub");
    const hub = new SessionHub({
      processManager: mockProcess as any,
      adapterFactory: vi.fn().mockResolvedValue(mockAdapter),
    });

    await hub.connectAgent("agent-1");
    const session = await hub.createSession("agent-1");

    expect(session.title).toBe("New Session");
    expect(hub.listSessions().find((s) => s.id === "sess-hub-1")?.title).toBe("New Session");

    let notifiedSessions: any[] = [];
    hub.onSessionListChange((sessions) => {
      notifiedSessions = sessions;
    });

    // When the agent updates session info
    updateCallback!({
      sessionId: "sess-hub-1",
      update: {
        sessionUpdate: "session_info_update",
        title: "Hub Title Updated",
      },
    });

    expect(session.title).toBe("Hub Title Updated");
    expect(hub.listSessions().find((s) => s.id === "sess-hub-1")?.title).toBe("Hub Title Updated");
    expect(notifiedSessions.find((s) => s.id === "sess-hub-1")?.title).toBe("Hub Title Updated");

    await hub.dispose();
  });
});
