import type { BridgeContext } from "./types";
import type { AgentConfig } from "../../core/types/config";
import { type ConfigMetadata, errorMessage, validateConfig, validateMetadata } from "./agent-config-validation";

/** Serializes every config read-modify-write and keeps tombstone revisions in memory. */
export class AgentConfigStore {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly revisions = new Map<string, number>();
  private readonly connecting = new Map<string, number>();
  constructor(private readonly ctx: BridgeContext, private readonly cancelTests: (id: string) => void) {}
  public getRevisions(): Record<string, number> { return Object.fromEntries(this.revisions); }
  public reserve(id: string): () => void {
    this.connecting.set(id, (this.connecting.get(id) ?? 0) + 1);
    return () => {
      const count = (this.connecting.get(id) ?? 1) - 1;
      if (count) this.connecting.set(id, count); else this.connecting.delete(id);
    };
  }
  public enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.catch(() => {});
    return result;
  }
  public async save(config: AgentConfig, metadata: ConfigMetadata): Promise<void> {
    await this.mutate(config?.id ?? "", "save", metadata, async () => {
      const checked = validateConfig(config);
      const existing = [...await this.ctx.storageManager.getAgentConfigs()];
      const index = existing.findIndex(item => item.id === checked.id);
      if (index < 0) existing.push(checked); else existing[index] = checked;
      await this.ctx.storageManager.saveAgentConfigs(existing);
    });
  }
  public async delete(id: string, metadata: ConfigMetadata): Promise<void> {
    await this.mutate(id, "delete", metadata, async () => {
      if (this.connecting.has(id) || this.ctx.sessionHub.getConnection(id)) throw new Error("Disconnect the Agent before deleting its configuration");
      const existing = await this.ctx.storageManager.getAgentConfigs();
      await this.ctx.storageManager.saveAgentConfigs(existing.filter(item => item.id !== id));
      this.cancelTests(id);
    });
  }
  private async mutate(id: string, operation: "save" | "delete", metadata: ConfigMetadata, write: () => Promise<void>): Promise<void> {
    await this.enqueue(async () => {
      let success = false;
      let error: string | undefined;
      try {
        if (!id) throw new Error("Agent configuration ID is required");
        validateMetadata(metadata);
        if (metadata.configRevision !== undefined && metadata.configRevision !== (this.revisions.get(id) ?? 0)) throw new Error("Configuration changed; refresh before saving");
        await write();
        this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1);
        success = true;
      } catch (caught) { error = errorMessage(caught); }
      await this.ctx.postMessage({ type: "AGENT_CONFIG_RESULT", payload: {
        requestId: metadata.requestId, configId: id, operation, success,
        draftRevision: metadata.draftRevision, configRevision: this.revisions.get(id) ?? 0, ...(error ? { error } : {}),
      } });
      if (success) await this.ctx.broadcastStateSnapshot();
      if (!success && !metadata.requestId) throw new Error(error);
    });
  }
}
