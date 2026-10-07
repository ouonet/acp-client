import type { AgentConfig } from "../../core/types/config";
import { formatCommandLineArgs, parseCommandLineArgs } from "../utils/command-line-args";
export interface ConfigDraft {
  config: AgentConfig;
  argsText: string;
  envRows: Array<{ key: string; value: string }>;
  revision: number;
  baseRevision: number;
  cwdRevision: number;
  dirty: boolean;
  error?: string;
  notice?: string;
  result?: any;
  save?: { id: string; revision: number };
  test?: { id: string; revision: number };
  picker?: { id: string; revision: number };
  deletion?: string;
}
export function makeDraft(config: AgentConfig, baseRevision = 0): ConfigDraft {
  return { config: { ...config }, argsText: formatCommandLineArgs(config.args), envRows: Object.entries(config.env || {}).map(([key, value]) => ({ key, value })), revision: 0, cwdRevision: 0, baseRevision, dirty: false };
}
export function serializeDraft(draft: ConfigDraft): AgentConfig {
  return { ...draft.config, args: parseCommandLineArgs(draft.argsText), env: Object.fromEntries(draft.envRows.map(row => [row.key, row.value])) };
}
export function validateDraft(draft: ConfigDraft): string | undefined {
  const { config, argsText, envRows } = draft;
  if (!config.name.trim() || !config.command.trim()) return "Agent name and executable are required.";
  if (config.transport !== "stdio") return "WebSocket transport is not supported.";
  if ([config.name, config.command, config.cwd || "", argsText].some(value => value.includes("\0"))) return "Fields must not contain NUL characters.";
  let quote = "", escaped = false;
  for (const char of argsText) {
    if (escaped) { escaped = false; continue; }
    if (char === "\\") { escaped = true; continue; }
    if (quote) { if (char === quote) quote = ""; }
    else if (char === '"' || char === "'") quote = char;
  }
  if (quote || escaped) return "Arguments have an unmatched quote or trailing escape.";
  const keys = new Set<string>();
  for (const row of envRows) {
    if (!row.key.trim() || /[=\0]/.test(row.key)) return "Environment keys must be nonempty and contain neither = nor NUL.";
    if (keys.has(row.key)) return "Environment keys must be unique.";
    if (row.value.includes("\0")) return "Environment values must not contain NUL.";
    keys.add(row.key);
  }
  return undefined;
}
