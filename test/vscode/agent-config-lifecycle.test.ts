import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { ConfigHandler } from "../../src/vscode/bridge/config-handler";
const mocks = vi.hoisted(() => ({ spawn: vi.fn(), initialize: vi.fn(), dispose: vi.fn(), picker: vi.fn() }));
vi.mock("child_process", () => ({ spawn: mocks.spawn }));
vi.mock("../../src/core/protocol/acp-client-adapter", () => ({ AcpClientAdapter: class { initialize = mocks.initialize; close = mocks.dispose; } }));
vi.mock("vscode", () => ({ window: { showOpenDialog: mocks.picker }, workspace: { workspaceFolders: [] } }));
const config = { id: "a", name: "Agent", command: "agent", args: [], env: {}, enabled: true, transport: "stdio" };
function fixture() {
  let stored: any[] = [structuredClone(config)];
  const ctx: any = {
    storageManager: { getAgentConfigs: vi.fn(async () => structuredClone(stored)), saveAgentConfigs: vi.fn(async (next) => { stored = next; }) },
    sessionHub: { connectAgent: vi.fn(async () => {}), getConnection: vi.fn(), setActiveAgent: vi.fn(), disconnectAgent: vi.fn(async () => {}) },
    processManager: { restart: vi.fn(), stop: vi.fn() }, postMessage: vi.fn(async () => true), broadcastStateSnapshot: vi.fn(async () => {}),
  };
  return { ctx, handler: new ConfigHandler(ctx), stored: () => stored };
}
function child() {
  const proc: any = new EventEmitter();
  proc.stdin = new PassThrough(); proc.stdout = new PassThrough(); proc.stderr = new PassThrough();
  proc.exitCode = null; proc.signalCode = null;
  proc.kill = vi.fn((signal) => { proc.signalCode = signal; proc.emit("exit", null, signal); return true; });
  mocks.spawn.mockReturnValue(proc); return proc;
}
beforeEach(() => { vi.clearAllMocks(); mocks.initialize.mockResolvedValue({ protocolVersion: 1, agentCapabilities: {} }); });
afterEach(() => vi.useRealTimers());
describe("agent config lifecycle", () => {
  it("serializes writes and rejects stale resurrection", async () => {
    const { ctx, handler, stored } = fixture();
    await Promise.all([
      handler.handleSaveConfig({ config: { ...config, name: "One" }, requestId: "s1", draftRevision: 1, configRevision: 0 } as any),
      handler.handleSaveConfig({ config: { ...config, id: "b" }, requestId: "s2", configRevision: 0 } as any),
    ]);
    expect(stored().map(c => c.id)).toEqual(["a", "b"]);
    expect((handler as any).getConfigRevisions()).toEqual({ a: 1, b: 1 });
    await (handler as any).handleDeleteConfig("a", { requestId: "d", configRevision: 1 });
    await handler.handleSaveConfig({ config, requestId: "stale", configRevision: 1 } as any);
    expect(stored().map(c => c.id)).toEqual(["b"]);
    expect(ctx.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: "AGENT_CONFIG_RESULT", payload: expect.objectContaining({ requestId: "stale", success: false, configRevision: 2 }) }));
  });
  it("validates fields without writing and keeps active launch config intact", async () => {
    const { ctx, handler } = fixture();
    await handler.handleSaveConfig({ config: { ...config, env: { "BAD=KEY": "x" } }, requestId: "bad" } as any);
    expect(ctx.storageManager.saveAgentConfigs).not.toHaveBeenCalled();
    ctx.sessionHub.getConnection.mockReturnValue({ agentId: "a", status: "running" });
    await handler.handleSaveConfig({ config: { ...config, command: "new" }, requestId: "save" } as any);
    expect(ctx.processManager.restart).not.toHaveBeenCalled();
    await (handler as any).handleDeleteConfig("a", { requestId: "delete" });
    expect(ctx.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ payload: expect.objectContaining({ success: false }) }));
  });
  it("reserves pending connects against deletion and routes stop/restart through core", async () => {
    const { ctx, handler, stored } = fixture(); let release!: () => void;
    ctx.sessionHub.connectAgent.mockImplementationOnce(() => new Promise<void>(r => { release = r; }));
    const connecting = handler.handleConnectAgent("a");
    await (handler as any).handleDeleteConfig("a", { requestId: "delete" });
    expect(stored()).toHaveLength(1); release(); await connecting;
    expect(ctx.sessionHub.setActiveAgent).toHaveBeenCalledWith("a");
    await handler.handleStopAgent("a"); await handler.handleRestartAgent("a");
    expect(ctx.sessionHub.disconnectAgent).toHaveBeenCalledTimes(2); expect(ctx.processManager.stop).not.toHaveBeenCalled();
  });
  it("tests unsaved drafts once and disposes/reaps on success", async () => {
    const { ctx, handler } = fixture(); const proc = child();
    await Promise.all([handler.handleTestConnection({ config, requestId: "t", draftRevision: 3 } as any), handler.handleTestConnection({ config, requestId: "t", draftRevision: 3 } as any)]);
    expect(mocks.spawn).toHaveBeenCalledTimes(1); expect(mocks.dispose).toHaveBeenCalledTimes(1); expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
    expect(ctx.storageManager.saveAgentConfigs).not.toHaveBeenCalled();
    expect(ctx.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "TEST_CONNECTION_RESULT", payload: expect.objectContaining({ requestId: "t", configId: "a", draftRevision: 3, success: true }) }));
  });
  it("correlates different requests sharing the same in-flight draft test", async () => {
    const { ctx, handler } = fixture(); child(); let resolve!: (value: any) => void;
    mocks.initialize.mockImplementation(() => new Promise(r => { resolve = r; }));
    const one = handler.handleTestConnection({ config, requestId: "one", draftRevision: 1 } as any);
    const two = handler.handleTestConnection({ config, requestId: "two", draftRevision: 1 } as any);
    resolve({ protocolVersion: 1, agentCapabilities: {} }); await Promise.all([one, two]);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(ctx.postMessage.mock.calls.map(([message]: [any]) => message.payload.requestId)).toEqual(["one", "two"]);
  });
  it("cancels a hung test and fences late success", async () => {
    const { ctx, handler } = fixture(); const proc = child(); let resolve!: (x: any) => void;
    mocks.initialize.mockImplementation(() => new Promise(r => { resolve = r; }));
    const testing = handler.handleTestConnection({ config, requestId: "t", draftRevision: 1 } as any); await Promise.resolve();
    await (handler as any).handleCancelAgentTest({ configId: "a", requestId: "cancel", testRequestId: "t" });
    await testing; resolve({ protocolVersion: 1 }); await Promise.resolve();
    expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
    expect(ctx.postMessage.mock.calls.filter(([m]: [any]) => m.type === "TEST_CONNECTION_RESULT").map(([m]: [any]) => m.payload)).toEqual([expect.objectContaining({ requestId: "t", cancelled: true, success: false })]);
  });
  it("times out handshakes and escalates stubborn children", async () => {
    vi.useFakeTimers(); const { handler } = fixture(); const proc = child(); proc.kill.mockImplementation((signal: string) => { if (signal === "SIGKILL") { proc.signalCode = signal; proc.emit("exit", null, signal); } return true; });
    mocks.initialize.mockReturnValue(new Promise(() => {})); const testing = handler.handleTestConnection({ config, requestId: "timeout" } as any);
    await vi.advanceTimersByTimeAsync(10000); await vi.advanceTimersByTimeAsync(5000); await testing;
    expect(mocks.dispose).toHaveBeenCalled(); expect(proc.kill.mock.calls).toEqual([["SIGTERM"], ["SIGKILL"]]);
  });
  it("does not acknowledge cleanup before SIGKILL exit", async () => {
    vi.useFakeTimers(); const { ctx, handler } = fixture(); const proc = child();
    proc.kill.mockImplementation((signal: string) => { if (signal === "SIGKILL") setTimeout(() => { proc.signalCode = signal; proc.emit("exit", null, signal); }, 500); return true; });
    mocks.initialize.mockReturnValue(new Promise(() => {})); const pending = handler.handleTestConnection({ config, requestId: "reap" } as any);
    await vi.advanceTimersByTimeAsync(15000); expect(ctx.postMessage).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500); await pending; expect(ctx.postMessage).toHaveBeenCalled();
  });
  it("preempts bridge preflight reads when stopped", async () => {
    const { ctx, handler } = fixture(); let release!: (value: any[]) => void;
    ctx.storageManager.getAgentConfigs.mockImplementationOnce(() => new Promise(r => { release = r; }));
    const connecting = handler.handleConnectAgent("a"); const rejected = expect(connecting).rejects.toThrow(/cancelled|disconnected/i);
    await Promise.resolve(); await handler.handleStopAgent("a"); release([config]); await rejected;
    expect(ctx.sessionHub.connectAgent).not.toHaveBeenCalled();
  });
  it("settles failed initialization and disposal with reaped children", async () => {
    const { ctx, handler } = fixture(); const first = child(); mocks.initialize.mockRejectedValueOnce(new Error("Handshake rejected"));
    await handler.handleTestConnection({ config, requestId: "fail" } as any);
    expect(first.kill).toHaveBeenCalledWith("SIGTERM");
    const second = child(); mocks.initialize.mockReturnValue(new Promise(() => {}));
    const pending = handler.handleTestConnection({ config, requestId: "dispose" } as any);
    handler.dispose(); await (handler as any).waitForTests(); await pending;
    expect(second.kill).toHaveBeenCalledWith("SIGTERM"); expect(mocks.dispose).toHaveBeenCalledTimes(2);
    expect(ctx.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ payload: expect.objectContaining({ cancelled: true }) }));
  });
  it("handles asynchronous spawn errors without hanging", async () => {
    const { ctx, handler } = fixture(); const proc = child(); proc.pid = undefined;
    mocks.initialize.mockReturnValue(new Promise(() => {}));
    const pending = handler.handleTestConnection({ config, requestId: "spawn" } as any);
    proc.emit("error", new Error("ENOENT")); await pending;
    expect(mocks.dispose).toHaveBeenCalled(); expect(ctx.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ payload: expect.objectContaining({ success: false, error: "ENOENT" }) }));
  });
  it("returns directory identity and preserves cancelled picker field", async () => {
    const { ctx, handler } = fixture(); mocks.picker.mockResolvedValue(undefined);
    await (handler as any).handlePickAgentDirectory({ configId: "a", requestId: "p", draftRevision: 2, cwdRevision: 5 });
    expect(ctx.postMessage).toHaveBeenCalledWith({ type: "AGENT_CONFIG_RESULT", payload: { configId: "a", requestId: "p", operation: "directory", success: true, draftRevision: 2, cwdRevision: 5 } });
  });
});
