import { describe, expect, it, vi } from "vitest";
import { ActionRouter } from "../../src/vscode/bridge/action-router";
import { SessionHandler } from "../../src/vscode/bridge/session-handler";
import type { BridgeContext } from "../../src/vscode/bridge/types";

function fixture() {
  const hub = { forkSession: vi.fn(async () => ({ id: "exact-child" })), getActiveSession: vi.fn(() => ({ id: "another-session" })), setActiveAgent: vi.fn() };
  const raw = { sessionHub: hub, bindActiveSessionEvents: vi.fn(), broadcastStateSnapshot: vi.fn(async () => {}), postMessage: vi.fn(async (_message: any) => true) };
  const ctx = raw as unknown as BridgeContext;
  const sessions = new SessionHandler(ctx);
  const router = new ActionRouter(ctx, {} as any, sessions, {} as any, {} as any, {} as any);
  return { hub, raw, sessions, router };
}

describe("fork action identity", () => {
  it("returns the exact child from the completed fork rather than the active selection", async () => {
    const { hub, sessions } = fixture();
    expect(await sessions.handleForkSession("parent", { upToMessageIndex: -1 })).toBe("exact-child");
    expect(hub.forkSession).toHaveBeenCalledWith("parent", { upToMessageIndex: -1 });
    expect(hub.getActiveSession).not.toHaveBeenCalled();
  });
  it("includes the exact child in the matching successful receipt", async () => {
    const { raw, router } = fixture();
    await router.handle({ type: "FORK_SESSION", payload: { sourceSessionId: "parent", agentId: "a", requestId: "rewind-1", options: { upToMessageIndex: -1 } } });
    expect(raw.postMessage).toHaveBeenCalledWith({ type: "ACTION_RESULT", payload: { requestId: "rewind-1", action: "FORK_SESSION", agentId: "a", success: true, sessionId: "exact-child" } });
    expect(raw.broadcastStateSnapshot).toHaveBeenCalledTimes(1);
  });
  it("does not return a child identity when fork fails", async () => {
    const { hub, raw, router } = fixture();
    hub.forkSession.mockRejectedValueOnce(new Error("Agent could not fork"));
    await expect(router.handle({ type: "FORK_SESSION", payload: { sourceSessionId: "parent", agentId: "a", requestId: "failed" } })).rejects.toThrow("Agent could not fork");
    expect(raw.postMessage).toHaveBeenCalledWith({ type: "ACTION_RESULT", payload: { requestId: "failed", action: "FORK_SESSION", agentId: "a", success: false, error: "Agent could not fork" } });
  });
  it("leaves non-fork receipts unchanged", async () => {
    const { raw, router } = fixture();
    await router.handle({ type: "SELECT_AGENT", payload: { agentId: "a", requestId: "select" } });
    expect(raw.postMessage).toHaveBeenCalledWith({ type: "ACTION_RESULT", payload: { requestId: "select", action: "SELECT_AGENT", agentId: "a", success: true } });
  });
});
