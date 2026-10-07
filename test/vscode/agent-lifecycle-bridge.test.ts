import { describe, it, expect, vi } from "vitest";
import { isWebviewAction } from "../../src/shared/ipc-protocol";
import { SnapshotBroadcaster } from "../../src/vscode/bridge/snapshot-broadcaster";
import { SessionHandler } from "../../src/vscode/bridge/session-handler";
import { createPermissionHandler } from "../../src/vscode/extension";
import { PromptHandler } from "../../src/vscode/bridge/prompt-handler";
import { ActionRouter } from "../../src/vscode/bridge/action-router";
import type { BridgeContext } from "../../src/vscode/bridge/types";

function fixture() {
  const session = { id: "same", agentId: "b", serialize: () => ({ id: "same", agentId: "b", messages: [] }) };
  const hub = {
    getActiveSession: vi.fn(() => session), getActiveAgentId: vi.fn(() => "b"),
    listConnections: vi.fn(() => [{ agentId: "b", status: "running", initialized: true, generation: 2, capabilities: { loadSession: true, sessionCapabilities: { list: {} } } }]),
    getConnection: vi.fn(() => ({ agentId: "b", generation: 2, initialized: true, capabilities: { loadSession: true, sessionCapabilities: { list: {} } } })),
    listSessions: vi.fn(() => []), listAgentSessions: vi.fn(() => []),
    listAgentSessionPage: vi.fn(async () => ({ sessions: [{ id: "remote", agentId: "b", title: "Remote history", updatedAt: 10 }], nextCursor: "next" })),
    setActiveAgent: vi.fn(), disconnectAgent: vi.fn(), closeSession: vi.fn(), restoreSession: vi.fn(),
  };
  const ctx = {
    sessionHub: hub, processManager: { getStatus: vi.fn(() => "running") },
    storageManager: { getAgentConfigs: vi.fn(async () => [{ id: "b", transport: "stdio" }]), getInputHistory: vi.fn(async () => []), listSavedSessions: vi.fn(async () => [{ id: "saved" }]) },
    postMessage: vi.fn(async (_message: any) => true), broadcastStateSnapshot: vi.fn(), bindActiveSessionEvents: vi.fn(), log: vi.fn(),
  };
  return { ctx: ctx as unknown as BridgeContext, raw: ctx, hub };
}

describe("Agent lifecycle bridge", () => {
  it("checks the qualified fork source runtime before invoking fork", async () => {
    const { ctx, hub } = fixture(); (hub as any).getSession = vi.fn(() => ({ serialize: () => ({ runtimeRevision: 2 }) }));
    const sessions = { handleForkSession: vi.fn() };
    const router = new ActionRouter(ctx, {} as any, sessions as any, {} as any, {} as any, {} as any);
    await expect(router.handle({ type: "FORK_SESSION", payload: { sourceSessionId: "same", agentId: "b", runtimeRevision: 1 } })).rejects.toThrow("runtime changed");
    expect((hub as any).getSession).toHaveBeenCalledWith("same", "b");
    expect(sessions.handleForkSession).not.toHaveBeenCalled();
  });
  it("rejects permission requests from an old Agent connection", async () => {
    const { hub } = fixture(); const approval = vi.fn();
    (hub as any).getSession = vi.fn(() => ({ agentId: "b", requestApproval: approval }));
    const result = await createPermissionHandler(() => hub as any, "b", 1)({ sessionId: "same", options: [] });
    expect(result).toEqual({ outcome: { outcome: "cancelled" } });
    expect(approval).not.toHaveBeenCalled();
  });
  it("rejects a prompt closed during input-history persistence before accepting it", async () => {
    const { ctx, raw, hub } = fixture(); let release!: () => void; let attached = true;
    const session = { id: "same", agentId: "b", status: "idle", prompt: vi.fn(), serialize: () => ({ attached, runtimeRevision: 1 }) };
    (hub as any).getSession = vi.fn(() => session);
    (raw.storageManager as any).recordInputHistory = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    const sending = new PromptHandler(ctx).handleSendPrompt({ sessionId: "same", agentId: "b", prompt: "hello", requestId: "send" });
    const rejected = expect(sending).rejects.toThrow("Session changed"); attached = false; release(); await rejected;
    expect(session.prompt).not.toHaveBeenCalled();
    expect(raw.postMessage.mock.calls.map(([m]) => m).filter(m => m.type === "PROMPT_RESULT")).toEqual([expect.objectContaining({ payload: expect.objectContaining({ status: "rejected", requestId: "send" }) })]);
  });
  it("rejects actions from an earlier connection before invoking mutations", async () => {
    const { ctx, raw } = fixture();
    const config = { handleStopAgent: vi.fn() };
    const router = new ActionRouter(ctx, {} as any, {} as any, config as any, {} as any, {} as any);
    await expect(router.handle({ type: "DISCONNECT_AGENT", payload: { agentId: "b", generation: 1, requestId: "old" } })).rejects.toThrow("connection changed");
    expect(config.handleStopAgent).not.toHaveBeenCalled();
    expect(raw.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "ACTION_RESULT", payload: expect.objectContaining({ requestId: "old", success: false }) }));
  });
  it("routes closing an Agent through bridge preflight cancellation", async () => {
    const { ctx } = fixture(); const config = { handleStopAgent: vi.fn() };
    const router = new ActionRouter(ctx, {} as any, {} as any, config as any, {} as any, {} as any);
    await router.handle({ type: "DISCONNECT_AGENT", payload: { agentId: "b" } });
    expect(config.handleStopAgent).toHaveBeenCalledWith("b");
  });
  it.each(["SELECT_AGENT", "DISCONNECT_AGENT"])("validates %s payloads", (type) => {
    expect(isWebviewAction({ type, payload: { agentId: "a" } })).toBe(true);
    expect(isWebviewAction({ type, payload: { agentId: "" } })).toBe(false);
  });
  it("validates history request correlation", () => {
    expect(isWebviewAction({ type: "REQUEST_AGENT_HISTORY", payload: { agentId: "a", requestId: "r", cursor: "opaque" } })).toBe(true);
    expect(isWebviewAction({ type: "REQUEST_AGENT_HISTORY", payload: { agentId: "a" } })).toBe(false);
  });
  it("rejects malformed config and stale-target metadata", () => {
    expect(isWebviewAction({ type: "SAVE_AGENT_CONFIG", payload: { config: null } })).toBe(false);
    expect(isWebviewAction({ type: "SWITCH_SESSION", payload: { sessionId: "s", generation: -1 } })).toBe(false);
  });
  it("snapshots current runtimes without querying remote or local histories", async () => {
    const { ctx, raw, hub } = fixture();
    await new SnapshotBroadcaster(ctx).broadcast(true);
    expect(raw.storageManager.listSavedSessions).not.toHaveBeenCalled();
    expect(hub.listAgentSessions).not.toHaveBeenCalled();
    expect(raw.postMessage).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ activeAgentId: "b", connections: hub.listConnections(), sessions: [] }) }));
  });
  it("requests one Agent history page without inventing an idle state", async () => {
    const { ctx, raw, hub } = fixture();
    await new SessionHandler(ctx).handleHistoryRequest({ agentId: "b", requestId: "h", cursor: "previous" });
    expect(hub.listAgentSessionPage).toHaveBeenCalledWith("b", expect.objectContaining({ cursor: "previous" }));
    const message = raw.postMessage.mock.calls[0][0] as any;
    expect(message).toMatchObject({ type: "AGENT_HISTORY_RESULT", payload: { agentId: "b", requestId: "h", nextCursor: "next" } });
    expect(message.payload.sessions[0]).not.toHaveProperty("status");
  });
  it("loads history with its owning Agent instead of whichever tab is active", async () => {
    const { ctx, hub } = fixture();
    await new SessionHandler(ctx).handleSwitchSession("same", "a");
    expect(hub.restoreSession).toHaveBeenCalledWith("same", "a", expect.any(String));
  });
});
