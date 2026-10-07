import type { BridgeContext } from "./types";
import { resolveConfigCwd } from "./types";
import { SkillDiscovery } from "../../core/skills/skill-discovery";
import type { WebviewStateSnapshot } from "../../shared/ipc-protocol";

export class SnapshotBroadcaster {
  private snapshotGeneration = 0;
  constructor(private readonly ctx: BridgeContext) {}

  public async broadcast(hasView: boolean): Promise<void> {
    if (!hasView) return;
    const revision = ++this.snapshotGeneration;
    const [agentConfigs, inputHistory] = await Promise.all([
      this.ctx.storageManager.getAgentConfigs(), this.ctx.storageManager.getInputHistory(),
    ]);
    if (revision !== this.snapshotGeneration) return;
    const activeAgentId = this.ctx.sessionHub.getActiveAgentId?.() ?? this.ctx.sessionHub.getActiveSession()?.agentId;
    const activeConfig = agentConfigs.find((c) => c.id === activeAgentId);
    const processStatuses = Object.fromEntries(agentConfigs.map((c) => [c.id, this.ctx.processManager.getStatus(c.id)]));
    let skills: Array<{ id: string; name: string; description: string }> = [];
    if (this.ctx.workspaceAdapter) {
      try {
        const found = await new SkillDiscovery().findSkills(resolveConfigCwd(activeConfig?.cwd), this.ctx.workspaceAdapter);
        skills = found.map(({ id, name, description }) => ({ id, name, description }));
      } catch (error) { this.ctx.log(`Skill discovery failed: ${error}`); }
    }
    if (revision !== this.snapshotGeneration) return;
    const active = this.ctx.sessionHub.getActiveSession();
    const serialized = active?.serialize();
    const snapshot: WebviewStateSnapshot = {
      revision, activeAgentId, activeSession: serialized,
      connections: this.ctx.sessionHub.listConnections?.() ?? [],
      configRevisions: this.ctx.getConfigRevisions?.() ?? {},
      sessions: this.ctx.sessionHub.listSessions(), agentConfigs, inputHistory, processStatuses,
      pendingPermission: active?.pendingApproval, skills,
      activeAgentCapabilities: this.ctx.sessionHub.getConnection?.(activeAgentId ?? "")?.capabilities ?? serialized?.capabilities,
      activeModes: serialized?.modes,
    };
    await this.ctx.postMessage({ type: "STATE_SNAPSHOT", payload: snapshot });
  }
}
