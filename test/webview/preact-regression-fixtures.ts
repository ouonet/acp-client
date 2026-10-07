import type { WebviewStateSnapshot } from "../../src/shared/ipc-protocol";
import type { MessageChunk, SessionStatus } from "../../src/core/types/session";

export function snapshot(id = "s1", status: SessionStatus = "idle", messages: MessageChunk[] = []): WebviewStateSnapshot {
  return {
    activeSession: {
      id, agentId: "a1", title: "Test", status, messages,
      createdAt: 1, updatedAt: 1,
      model: "model-a", modelConfigId: "model", thinkingConfigId: "thought_level", availableModels: ["model-a", "model-b"],
      thinkingLevel: "medium", availableThinkingLevels: ["off", "medium", "high"],
      availableCommands: [{ name: "compact", description: "Compact context" }],
      capabilities: { promptCapabilities: { image: true } },
    },
    agentConfigs: [{ id: "a1", name: "Agent", command: "node", args: ["agent.js"], env: { TEST: "value" }, cwd: "/workspace", transport: "stdio", enabled: true }],
    sessions: [], processStatuses: { a1: "running" }, inputHistory: ["previous prompt"],
    activeAgentCapabilities: { promptCapabilities: { image: true } },
  };
}
