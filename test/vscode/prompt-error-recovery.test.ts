import { describe, expect, it, vi } from "vitest";
import type { SessionStatus } from "../../src/core/types/session";
import type { BridgeContext } from "../../src/vscode/bridge/types";
import { PromptHandler } from "../../src/vscode/bridge/prompt-handler";

function fixture(status: SessionStatus = "error") {
  const identity = { attached: true, runtimeRevision: 1 };
  const connection = { generation: 1 };
  const session = {
    id: "session-1",
    agentId: "agent-1",
    status,
    serialize: () => ({ ...identity }),
    prompt: vi.fn(async () => {
      session.status = "streaming";
      await Promise.resolve();
      session.status = "idle";
    }),
  };
  const postMessage = vi.fn(async (_message: unknown) => undefined);
  const recordInputHistory = vi.fn(async (_text: string) => undefined);
  const ctx = {
    sessionHub: {
      getSession: vi.fn(() => session),
      getActiveAgentId: () => session.agentId,
      getConnection: () => connection,
    },
    storageManager: { recordInputHistory },
    postMessage,
    bindActiveSessionEvents: vi.fn(),
  } as unknown as BridgeContext;
  const handler = new PromptHandler(ctx);
  const payload = {
    sessionId: session.id,
    agentId: session.agentId,
    requestId: "retry-1",
    prompt: "continue after switching models",
    options: { model: "healthy-model" },
  };
  return { handler, payload, session, identity, connection, postMessage, recordInputHistory };
}

async function results(f: ReturnType<typeof fixture>) {
  // Both terminal acknowledgement and acceptance are asynchronous.
  await Promise.resolve();
  await Promise.resolve();
  return f.postMessage.mock.calls.map(([message]) => message);
}

describe("Webview prompt recovery after a session error", () => {
  it("accepts an attached error session and forwards the replacement model once", async () => {
    const f = fixture();
    await f.handler.handleSendPrompt(f.payload);
    expect(f.session.prompt).toHaveBeenCalledExactlyOnceWith(f.payload.prompt, f.payload.options);
    expect(await results(f)).toEqual([
      { type: "PROMPT_RESULT", payload: { requestId: "retry-1", sessionId: "session-1", agentId: "agent-1", generation: 1, runtimeRevision: 1, status: "accepted" } },
      { type: "PROMPT_RESULT", payload: { requestId: "retry-1", sessionId: "session-1", agentId: "agent-1", generation: 1, runtimeRevision: 1, status: "completed" } },
    ]);
    expect(f.session.status).toBe("idle");
  });

  it("continues to accept idle sessions", async () => {
    const f = fixture("idle");
    await f.handler.handleSendPrompt(f.payload);
    expect(f.session.prompt).toHaveBeenCalledOnce();
  });

  it.each(["streaming", "waiting_approval"] as const)("rejects a %s session before forwarding", async (status) => {
    const f = fixture(status);
    await expect(f.handler.handleSendPrompt(f.payload)).rejects.toThrow(`Cannot send prompt while session is ${status}`);
    expect(f.session.prompt).not.toHaveBeenCalled();
    expect(f.recordInputHistory).not.toHaveBeenCalled();
  });

  it("rejects a detached error session before forwarding", async () => {
    const f = fixture();
    f.identity.attached = false;
    await expect(f.handler.handleSendPrompt(f.payload)).rejects.toThrow("Session is detached");
    expect(f.session.prompt).not.toHaveBeenCalled();
  });

  it.each(["busy", "detached", "revision", "generation"] as const)("revalidates an error retry after history persistence changes %s", async (change) => {
    const f = fixture();
    f.recordInputHistory.mockImplementation(async () => {
      if (change === "busy") f.session.status = "streaming";
      if (change === "detached") f.identity.attached = false;
      if (change === "revision") f.identity.runtimeRevision += 1;
      if (change === "generation") f.connection.generation += 1;
    });
    await expect(f.handler.handleSendPrompt(f.payload)).rejects.toThrow("Session changed while preparing the prompt");
    expect(f.session.prompt).not.toHaveBeenCalled();
  });

  it("reports another model failure and allows a later retry", async () => {
    const f = fixture("idle");
    f.session.prompt.mockImplementationOnce(async () => {
      f.session.status = "error";
      throw new Error("Model network unavailable");
    });
    await f.handler.handleSendPrompt(f.payload);
    expect(await results(f)).toContainEqual({
      type: "PROMPT_RESULT",
      payload: { requestId: "retry-1", sessionId: "session-1", agentId: "agent-1", generation: 1, runtimeRevision: 1, status: "rejected", error: "Model network unavailable" },
    });
    await f.handler.handleSendPrompt({ ...f.payload, requestId: "retry-2" });
    expect(f.session.prompt).toHaveBeenCalledTimes(2);
    expect(await results(f)).toContainEqual({
      type: "PROMPT_RESULT",
      payload: { requestId: "retry-2", sessionId: "session-1", agentId: "agent-1", generation: 1, runtimeRevision: 1, status: "completed" },
    });
  });
});
