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
  // Mirror parseCommandLineArgs: backslash is literal (Windows `C:\...`) except
  // to escape whitespace/quote outside quotes, or according to paired-backslash
  // rules inside quotes. A trailing backslash is valid; only an unclosed quote
  // is an error.
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < argsText.length; i++) {
    const char = argsText[i];
    const next = argsText[i + 1];
    if (char === "\\") {
      if (quote) {
        let slashCount = 0;
        while (argsText[i + slashCount] === "\\") slashCount++;
        const quoteIndex = i + slashCount;
        if (argsText[quoteIndex] === quote) {
          if (slashCount % 2 === 0) quote = null;
          i = quoteIndex;
        } else {
          i += slashCount - 1;
        }
      } else if (next !== undefined && (/\s/.test(next) || next === '"' || next === "'")) {
        i++;
      }
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    }
  }
  if (quote) return "Arguments have an unmatched quote or trailing escape.";
  const keys = new Set<string>();
  for (const row of envRows) {
    if (!row.key.trim() || /[=\0]/.test(row.key)) return "Environment keys must be nonempty and contain neither = nor NUL.";
    if (keys.has(row.key)) return "Environment keys must be unique.";
    if (row.value.includes("\0")) return "Environment values must not contain NUL.";
    keys.add(row.key);
  }
  return undefined;
}
