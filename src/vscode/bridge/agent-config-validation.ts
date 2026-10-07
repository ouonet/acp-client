import type { AgentConfig } from "../../core/types/config";
import { assertSupportedTransport } from "./types";

export interface ConfigMetadata {
  requestId?: string;
  draftRevision?: number;
  configRevision?: number;
}
export type ConfigPayload = AgentConfig | ({ config: AgentConfig } & ConfigMetadata);
export function unpackConfig(payload: ConfigPayload): { config: AgentConfig; metadata: ConfigMetadata } {
  const wrapped = payload && typeof payload === "object" && "config" in payload;
  return { config: wrapped ? payload.config : payload as AgentConfig, metadata: wrapped ? payload : {} };
}
export function validateConfig(config: AgentConfig): AgentConfig {
  if (!config || typeof config !== "object") throw new Error("Agent configuration is required");
  for (const field of ["id", "name", "command"] as const) {
    if (typeof config[field] !== "string" || !config[field].trim() || config[field].includes("\0")) {
      throw new Error(`Agent ${field} must be nonempty and contain no NUL`);
    }
  }
  assertSupportedTransport(config);
  if (config.args !== undefined && (!Array.isArray(config.args) || config.args.some(arg => typeof arg !== "string" || arg.includes("\0")))) {
    throw new Error("Arguments must be an array of strings without NUL");
  }
  if (config.cwd !== undefined && (typeof config.cwd !== "string" || config.cwd.includes("\0"))) throw new Error("Working directory is invalid");
  if (config.enabled !== undefined && typeof config.enabled !== "boolean") throw new Error("Enabled must be boolean");
  if (config.env !== undefined) {
    if (!config.env || typeof config.env !== "object" || Array.isArray(config.env)) throw new Error("Environment must be an object");
    for (const [key, value] of Object.entries(config.env)) {
      if (!key.trim() || key.includes("=") || key.includes("\0")) throw new Error("Environment key is invalid");
      if (typeof value !== "string" || value.includes("\0")) throw new Error("Environment value is invalid");
    }
  }
  return structuredClone(config);
}
export function validateMetadata(metadata: ConfigMetadata): void {
  if (metadata.requestId !== undefined && (typeof metadata.requestId !== "string" || !metadata.requestId)) throw new Error("Request ID is invalid");
  for (const revision of [metadata.configRevision, metadata.draftRevision]) {
    if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 0)) throw new Error("Configuration revision is invalid");
  }
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
