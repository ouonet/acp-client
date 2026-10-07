import { describe, it, expect, vi, beforeEach } from "vitest";
import { Session } from "../../src/core/session/session";

describe("T2: Three-Tier Permission Policy Gate & Session Whitelisting", () => {
  let mockAdapter: any;
  let session: Session;

  beforeEach(() => {
    mockAdapter = {
      initialize: vi.fn().mockResolvedValue({ protocolVersion: 1 }),
      createSession: vi.fn().mockResolvedValue({ sessionId: "sess-1" }),
      prompt: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
      onSessionUpdate: vi.fn().mockReturnValue({ dispose: () => {} }),
      isConnected: vi.fn().mockReturnValue(true),
      close: vi.fn().mockResolvedValue(undefined),
    };

    session = new Session({
      id: "sess-1",
      agentId: "agent-1",
      adapter: mockAdapter,
    });
  });

  it("publishes a detached JSON-safe pending approval before synchronous listeners reply", async () => {
    const offered = [{ optionId: "once", name: "Allow", kind: "allow_once" }];
    let snapshot: any;
    session.onEvent((event) => {
      if (event.type === "permission_request") {
        snapshot = JSON.parse(JSON.stringify(session.pendingApproval));
        void session.respondPermission("sync", "allow", { optionId: "once" });
      }
    });
    const result = await session.requestApproval("sync", "Write", offered);
    expect(snapshot).toEqual({
      sessionId: "sess-1",
      requestId: "sync",
      toolTitle: "Write",
      options: offered,
    });
    expect(result).toEqual({
      outcome: { outcome: "selected", optionId: "once" },
    });
    expect(session.pendingApproval).toBeUndefined();
  });

  it("rejects forged options without settling the real request", async () => {
    const pending = session.requestApproval("req", "Write", [
      { optionId: "once", name: "Allow", kind: "allow_once" },
    ]);
    await expect(
      session.respondPermission("req", "allow", { optionId: "forged" }),
    ).rejects.toThrow();
    expect(session.status).toBe("waiting_approval");
    await session.respondPermission("req", "allow", { optionId: "once" });
    await expect(pending).resolves.toEqual({
      outcome: { outcome: "selected", optionId: "once" },
    });
  });

  it.each(["cancel", "dispose", "crash"])(
    "settles approval on %s",
    async (action) => {
      const pending = session.requestApproval("req", "Write", [
        { optionId: "once", name: "Allow", kind: "allow_once" },
      ]);
      if (action === "cancel") await session.cancel();
      if (action === "dispose") session.dispose();
      if (action === "crash") session.handleProcessCrash("gone");
      await expect(pending).resolves.toEqual({
        outcome: { outcome: "cancelled" },
      });
      expect(session.pendingApproval).toBeUndefined();
    },
  );

  it("does not grant session-wide approval from an allow-once option", async () => {
    const pending = session.requestApproval("req", "Write", [
      { optionId: "once", name: "Allow", kind: "allow_once" },
    ]);
    await expect(
      session.respondPermission("req", "always_allow_session", {
        optionId: "once",
      }),
    ).rejects.toThrow();
    await session.respondPermission("req", "allow", { optionId: "once" });
    await pending;
  });

  it("does not auto-select a deny option for a previously whitelisted tool", async () => {
    const first = session.requestApproval("first", "Write", [
      { optionId: "always", name: "Always", kind: "allow_always" },
    ]);
    await session.respondPermission("first", "always_allow_session", {
      optionId: "always",
    });
    await first;
    const second = session.requestApproval("second", "Write", [
      { optionId: "deny", name: "Deny", kind: "reject_once" },
    ]);
    expect(session.status).toBe("waiting_approval");
    await session.cancel();
    await expect(second).resolves.toEqual({
      outcome: { outcome: "cancelled" },
    });
  });

  it("selects the offered reject option and rejects a decision-kind mismatch", async () => {
    const pending = session.requestApproval("req", "Write", [
      { optionId: "once", name: "Allow", kind: "allow_once" },
      { optionId: "reject", name: "Reject", kind: "reject_once" },
    ]);
    await expect(
      session.respondPermission("req", "deny", { optionId: "once" }),
    ).rejects.toThrow();
    await session.respondPermission("req", "deny", { optionId: "reject" });
    await expect(pending).resolves.toEqual({
      outcome: { outcome: "selected", optionId: "reject" },
    });
  });

  it("settles the active turn and approval when the transport closes", async () => {
    let close!: () => void;
    Object.assign(mockAdapter, {
      onClose: vi.fn((listener) => {
        close = listener;
        return { dispose: vi.fn() };
      }),
      prompt: vi.fn(() => new Promise(() => {})),
    });
    session = new Session({
      id: "closed",
      agentId: "agent-1",
      adapter: mockAdapter,
    });
    const turn = session.prompt("Work");
    const rejection = expect(turn).rejects.toThrow("disconnected");
    const approval = session.requestApproval("req", "Write", [
      { optionId: "once", name: "Allow", kind: "allow_once" },
    ]);
    close();
    await rejection;
    await expect(approval).resolves.toEqual({
      outcome: { outcome: "cancelled" },
    });
    expect(session.status).toBe("error");
  });

  it("replaces and disposes transport-close subscriptions", () => {
    const oldDispose = vi.fn();
    const newDispose = vi.fn();
    const oldAdapter = {
      ...mockAdapter,
      onClose: vi.fn(() => ({ dispose: oldDispose })),
    };
    const newAdapter = {
      ...mockAdapter,
      onClose: vi.fn(() => ({ dispose: newDispose })),
    };
    session = new Session({
      id: "replace",
      agentId: "agent-1",
      adapter: oldAdapter,
    });
    session.attachAdapter(newAdapter);
    expect(oldDispose).toHaveBeenCalledOnce();
    expect(newAdapter.onClose).toHaveBeenCalledOnce();
    session.dispose();
    expect(newDispose).toHaveBeenCalledOnce();
  });

  it("should transition to waiting_approval on initial tool approval request", async () => {
    const promise = session.requestApproval("req-1", "fs/writeFile", [
      { optionId: "opt-allow", name: "Allow Once", kind: "allow_once" },
      {
        optionId: "opt-always",
        name: "Always Allow in Session",
        kind: "allow_always",
      },
      { optionId: "opt-deny", name: "Deny", kind: "deny" },
    ]);

    expect(session.status).toBe("waiting_approval");

    await session.respondPermission("req-1", "allow");
    const result = await promise;

    expect(result.outcome.outcome).toBe("selected");
    expect(session.status).toBe("streaming");
  });

  it("should whitelist tool on always_allow_session and auto-approve subsequent requests", async () => {
    // 1. First request -> user selects always_allow_session
    const firstPromise = session.requestApproval("req-1", "fs/writeFile", [
      { optionId: "opt-allow", name: "Allow Once", kind: "allow_once" },
      {
        optionId: "opt-always",
        name: "Always Allow in Session",
        kind: "allow_always",
      },
    ]);

    expect(session.status).toBe("waiting_approval");
    await session.respondPermission("req-1", "always_allow_session", {
      optionId: "opt-always",
    });
    const firstResult = await firstPromise;
    expect(firstResult.outcome.outcome).toBe("selected");

    // 2. Second request for same tool -> auto approves without waiting_approval
    const secondPromise = session.requestApproval("req-2", "fs/writeFile", [
      { optionId: "opt-allow", name: "Allow Once", kind: "allow_once" },
    ]);

    // Should NOT enter waiting_approval
    expect(session.status).not.toBe("waiting_approval");
    const secondResult = await secondPromise;
    expect(secondResult.outcome.outcome).toBe("selected");
  });

  it("should return cancelled outcome with reason when decision is deny", async () => {
    const promise = session.requestApproval("req-3", "terminal/execute", [
      { optionId: "opt-deny", name: "Deny", kind: "deny" },
    ]);

    await session.respondPermission("req-3", "deny", {
      reason: "Unauthorized command",
    });
    const result = await promise;

    expect(result.outcome.outcome).toBe("cancelled");
    expect(result.outcome.reason).toBe("Unauthorized command");
  });
});
