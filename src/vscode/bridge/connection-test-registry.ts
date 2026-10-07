import type { BridgeContext } from "./types";
import { type ConfigMetadata, type ConfigPayload, errorMessage, unpackConfig, validateConfig, validateMetadata } from "./agent-config-validation";
import { initializeTestProcess } from "./connection-test-process";
interface PendingTest { requests: Map<string | undefined, ConfigMetadata>; fingerprint: string; controller: AbortController; promise: Promise<void> }

export class ConnectionTestRegistry {
  private readonly pending = new Map<string, PendingTest>();
  private disposed = false;
  constructor(private readonly ctx: BridgeContext) {}
  public run(payload: ConfigPayload): Promise<void> {
    const { config, metadata } = unpackConfig(payload);
    const id = config?.id ?? "";
    const fingerprint = JSON.stringify([config, metadata.draftRevision]);
    const existing = this.pending.get(id);
    if (existing && existing.fingerprint === fingerprint) {
      existing.requests.set(metadata.requestId, metadata);
      return existing.promise;
    }
    existing?.controller.abort();
    const entry: PendingTest = { requests: new Map([[metadata.requestId, metadata]]), fingerprint, controller: new AbortController(), promise: Promise.resolve() };
    this.pending.set(id, entry);
    entry.promise = this.execute(payload, entry).finally(() => { if (this.pending.get(id) === entry) this.pending.delete(id); });
    return entry.promise;
  }
  public cancelConfig(id: string): void { this.pending.get(id)?.controller.abort(); }
  public async cancel(payload: { configId: string; requestId: string; testRequestId: string }): Promise<void> {
    const entry = this.pending.get(payload.configId);
    if (entry?.requests.has(payload.testRequestId)) { entry.controller.abort(); await entry.promise; }
    await this.ctx.postMessage({ type: "ACTION_RESULT", payload: { requestId: payload.requestId, action: "CANCEL_AGENT_TEST", agentId: payload.configId, success: true } });
  }
  public cancelAll(): void { for (const entry of this.pending.values()) entry.controller.abort(); }
  public waitForTests(): Promise<void> { return Promise.allSettled([...this.pending.values()].map(entry => entry.promise)).then(() => {}); }
  public dispose(): void { this.disposed = true; this.cancelAll(); }
  private async execute(payload: ConfigPayload, entry: PendingTest): Promise<void> {
    const { config, metadata } = unpackConfig(payload);
    const configId = config?.id ?? "";
    const started = Date.now();
    let result: { success: boolean; protocolVersion?: number; capabilities?: unknown; error?: string; cancelled?: boolean };
    try {
      if (this.disposed) throw new Error("Connection tests are disposed");
      validateMetadata(metadata);
      const checked = validateConfig(config);
      const initialized = await initializeTestProcess(checked, entry.controller.signal);
      result = entry.controller.signal.aborted ? { success: false, cancelled: true, error: "Connection test cancelled" } : { success: true, ...initialized };
    } catch (error) {
      result = { success: false, error: errorMessage(error), ...(entry.controller.signal.aborted ? { cancelled: true } : {}) };
    }
    for (const request of entry.requests.values()) {
      await this.ctx.postMessage({ type: "TEST_CONNECTION_RESULT", payload: { configId, requestId: request.requestId, draftRevision: request.draftRevision, ...result, durationMs: Date.now() - started } });
    }
  }
}
