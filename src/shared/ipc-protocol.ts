/**
 * Shared Type-Safe IPC Protocol for Webview <-> Extension Communication
 */

import type { AgentConfig } from "../core/types/config";
import type {
  ContentBlock,
  PromptOptions,
  ThinkingLevel,
  ForkSessionOptions,
  SessionData,
  SessionSummary,
  SessionEvent,
  AgentConnectionSummary,
} from "../core/types/session";
import type { ProcessStatus, ProcessStatusEvent } from "../core/ports";

// -------------------------------------------------------------
// Webview -> Extension Actions
// -------------------------------------------------------------

type LegacyWebviewAction =
  | { type: "READY" }
  | {
      type: "SEND_PROMPT";
      payload: {
        sessionId: string;
        agentId?: string;
        prompt: string | ContentBlock[];
        requestId?: string;
        options?: PromptOptions;
      };
    }
  | {
      type: "CANCEL_PROMPT";
      payload: {
        sessionId: string;
      };
    }
  | {
      type: "RESPOND_PERMISSION";
      payload: {
        sessionId: string;
        requestId: string;
        decision: "allow" | "deny" | "always_allow_session";
        optionId?: string;
        options?: any;
      };
    }
  | { type: "CONNECT_AGENT"; payload: { agentId: string } }
  | {
      type: "CREATE_SESSION";
      payload: {
        agentId: string;
        title?: string;
        model?: string;
        thinkingLevel?: ThinkingLevel;
        cwd?: string;
      };
    }
  | {
      type: "SWITCH_SESSION";
      payload: {
        sessionId: string;
      };
    }
  | { type: "REFRESH_SESSIONS" }
  | {
      type: "FORK_SESSION";
      payload: {
        sourceSessionId: string;
        options?: ForkSessionOptions;
      };
    }
  | {
      type: "REWIND_SESSION";
      payload: {
        sourceSessionId: string;
        upToMessageIndex: number;
      };
    }
  | {
      type: "DELETE_SESSION";
      payload: {
        sessionId: string;
      };
    }
  | {
      type: "SAVE_AGENT_CONFIG";
      payload: {
        config: AgentConfig;
      };
    }
  | {
      type: "DELETE_AGENT_CONFIG";
      payload: {
        agentId: string;
      };
    }
  | {
      type: "TEST_AGENT_CONNECTION";
      payload: {
        config: AgentConfig;
      };
    }
  | {
      type: "RESTART_AGENT_PROCESS";
      payload: {
        agentId: string;
      };
    }
  | {
      type: "STOP_AGENT_PROCESS";
      payload: {
        agentId: string;
      };
    }
  | {
      type: "INSERT_CODE_TO_EDITOR";
      payload: {
        code: string;
      };
    }
  | {
      type: "APPLY_FILE_DIFF";
      payload: {
        filePath: string;
        diff?: string;
        originalContent?: string;
        content: string;
      };
    }
  | {
      type: "OPEN_DIFF_EDITOR";
      payload: {
        filePath: string;
        originalContent: string;
        modifiedContent: string;
      };
    }
  | {
      type: "SHOW_OUTPUT";
    }
  | {
      type: "OPEN_FILE";
      payload: {
        filePath: string;
        startLine?: number;
        endLine?: number;
      };
    }
  | {
      type: "SET_CONFIG_OPTION";
      payload: {
        sessionId?: string;
        configId: string;
        value: string;
      };
    };

export interface ActionMetadata {
  agentId?: string;
  requestId?: string;
  generation?: number;
  runtimeRevision?: number;
  draftRevision?: number;
  configRevision?: number;
}
type WithMetadata<T> = T extends { payload: infer P }
  ? Omit<T, "payload"> & { payload: P & ActionMetadata } : T;
export type WebviewAction = WithMetadata<LegacyWebviewAction>
  | { type: "SELECT_AGENT" | "DISCONNECT_AGENT"; payload: { agentId: string } & ActionMetadata }
  | { type: "CLOSE_SESSION"; payload: { sessionId: string } & ActionMetadata }
  | { type: "REQUEST_AGENT_HISTORY"; payload: { agentId: string; requestId: string; cursor?: string } & ActionMetadata }
  | { type: "PICK_AGENT_DIRECTORY"; payload: { configId: string; requestId: string; draftRevision: number; cwdRevision: number } }
  | { type: "CANCEL_AGENT_TEST"; payload: { configId: string; requestId: string; testRequestId: string } };

export const WEBVIEW_ACTION_TYPES = new Set<string>([
  "READY", "SELECT_AGENT", "DISCONNECT_AGENT", "CLOSE_SESSION",
  "REQUEST_AGENT_HISTORY", "PICK_AGENT_DIRECTORY", "CANCEL_AGENT_TEST",
  "SEND_PROMPT",
  "CANCEL_PROMPT",
  "RESPOND_PERMISSION",
  "CREATE_SESSION",
  "CONNECT_AGENT",
  "SWITCH_SESSION",
  "FORK_SESSION",
  "REWIND_SESSION",
  "DELETE_SESSION",
  "SAVE_AGENT_CONFIG",
  "DELETE_AGENT_CONFIG",
  "TEST_AGENT_CONNECTION",
  "RESTART_AGENT_PROCESS",
  "STOP_AGENT_PROCESS",
  "INSERT_CODE_TO_EDITOR",
  "APPLY_FILE_DIFF",
  "OPEN_DIFF_EDITOR",
  "SHOW_OUTPUT",
  "OPEN_FILE",
  "SET_CONFIG_OPTION",
  "REFRESH_SESSIONS",
]);

export function isWebviewAction(val: unknown): val is WebviewAction {
  if (!val || typeof val !== "object") return false;
  const msg = val as { type?: unknown; payload?: unknown };
  if (typeof msg.type !== "string" || !WEBVIEW_ACTION_TYPES.has(msg.type))
    return false;
  if (["READY", "SHOW_OUTPUT", "REFRESH_SESSIONS"].includes(msg.type)) return true;
  if (!msg.payload || typeof msg.payload !== "object") return false;
  const payload = msg.payload as Record<string, unknown>;
  const nonempty = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  const revision = (value: unknown) => value === undefined || (Number.isInteger(value) && (value as number) >= 0);
  if (!["generation", "runtimeRevision", "draftRevision", "configRevision", "cwdRevision"].every(key => revision(payload[key]))) return false;
  if (payload.agentId !== undefined && !nonempty(payload.agentId)) return false;
  if (payload.requestId !== undefined && !nonempty(payload.requestId)) return false;
  switch (msg.type) {
    case "SELECT_AGENT": case "DISCONNECT_AGENT":
    case "RESTART_AGENT_PROCESS": case "STOP_AGENT_PROCESS": case "DELETE_AGENT_CONFIG":
      return nonempty(payload.agentId);
    case "REQUEST_AGENT_HISTORY":
      return nonempty(payload.agentId) && nonempty(payload.requestId) && (payload.cursor === undefined || typeof payload.cursor === "string");
    case "PICK_AGENT_DIRECTORY":
      return nonempty(payload.configId) && nonempty(payload.requestId) && typeof payload.draftRevision === "number" && typeof payload.cwdRevision === "number";
    case "CANCEL_AGENT_TEST":
      return nonempty(payload.configId) && nonempty(payload.requestId) && nonempty(payload.testRequestId);
    case "SAVE_AGENT_CONFIG": case "TEST_AGENT_CONNECTION": {
      const config = payload.config as Record<string, unknown> | undefined;
      return !!config && typeof config === "object" && nonempty(config.id) && typeof config.name === "string" && typeof config.command === "string";
    }
    case "CLOSE_SESSION": case "SWITCH_SESSION": case "DELETE_SESSION": case "CANCEL_PROMPT":
      return nonempty(payload.sessionId);
    case "CREATE_SESSION": return nonempty(payload.agentId);
    case "FORK_SESSION": return nonempty(payload.sourceSessionId);
    case "REWIND_SESSION": return nonempty(payload.sourceSessionId) && Number.isInteger(payload.upToMessageIndex);
    case "OPEN_FILE": case "OPEN_DIFF_EDITOR":
      return nonempty(payload.filePath);
    case "INSERT_CODE_TO_EDITOR": return typeof payload.code === "string";
    case "SET_CONFIG_OPTION": return nonempty(payload.configId) && typeof payload.value === "string";
    case "CONNECT_AGENT":
      return typeof payload.agentId === "string" && payload.agentId.length > 0;
    case "SEND_PROMPT":
      return (
        typeof payload.sessionId === "string" &&
        (payload.agentId === undefined ||
          (typeof payload.agentId === "string" &&
            payload.agentId.length > 0)) &&
        (typeof payload.prompt === "string" || Array.isArray(payload.prompt)) &&
        (payload.requestId === undefined ||
          (typeof payload.requestId === "string" &&
            payload.requestId.length > 0))
      );
    case "RESPOND_PERMISSION":
      return (
        typeof payload.sessionId === "string" &&
        typeof payload.requestId === "string" &&
        ["allow", "deny", "always_allow_session"].includes(
          String(payload.decision),
        ) &&
        (payload.optionId === undefined || typeof payload.optionId === "string")
      );
    case "APPLY_FILE_DIFF":
      return (
        typeof payload.filePath === "string" &&
        payload.filePath.length > 0 &&
        typeof payload.originalContent === "string" &&
        typeof payload.content === "string"
      );
    default:
      return false;
  }
}

// -------------------------------------------------------------
// Extension -> Webview Events & Snapshots
// -------------------------------------------------------------

export interface WebviewStateSnapshot {
  activeAgentId?: string;
  connections?: AgentConnectionSummary[];
  revision?: number;
  configRevisions?: Record<string, number>;
  activeSession?: SessionData;
  /** Runtime approval only; never restored from persisted session data. */
  pendingPermission?: {
    sessionId?: string;
    requestId: string;
    toolTitle: string;
    options: readonly { optionId: string; name: string; kind: string }[];
  };
  sessions: SessionSummary[];
  agentConfigs: AgentConfig[];
  inputHistory: string[];
  processStatuses: Record<string, ProcessStatus>;
  skills?: {
    id: string;
    name: string;
    description: string;
  }[];
  activeAgentCapabilities?: any;
  activeModes?: Array<{ id: string; name: string }>;
}

export type ExtensionMessage =
  | { type: "ACTION_RESULT"; payload: { requestId: string; action?: string; agentId?: string; sessionId?: string; success: boolean; error?: string } }
  | { type: "AGENT_HISTORY_RESULT"; payload: { agentId: string; requestId: string; generation?: number; sessions: SessionSummary[]; nextCursor?: string; error?: string } }
  | { type: "AGENT_CONFIG_RESULT"; payload: { requestId?: string; configId: string; operation: "save" | "delete" | "directory"; success: boolean; draftRevision?: number; configRevision?: number; cwd?: string; cwdRevision?: number; error?: string } }
  | {
      type: "PROMPT_RESULT";
      payload: {
        requestId: string;
        sessionId: string;
        agentId?: string;
        generation?: number;
        runtimeRevision?: number;
        status: "accepted" | "completed" | "rejected";
        error?: string;
      };
    }
  | {
      type: "STATE_SNAPSHOT";
      payload: WebviewStateSnapshot;
    }
  | {
      type: "SESSION_EVENT";
      payload: {
        sessionId: string;
        agentId?: string;
        generation?: number;
        runtimeRevision?: number;
        event: SessionEvent;
      };
    }
  | {
      type: "PROCESS_STATUS_CHANGE";
      payload: ProcessStatusEvent;
    }
  | {
      type: "TEST_CONNECTION_RESULT";
      payload: {
        success: boolean;
        requestId?: string;
        configId?: string;
        draftRevision?: number;
        cancelled?: boolean;
        protocolVersion?: number;
        capabilities?: any;
        error?: string;
        durationMs: number;
      };
    }
  | {
      type: "INPUT_HISTORY_UPDATE";
      payload: {
        history: string[];
      };
    };

export const EXTENSION_MESSAGE_TYPES = new Set<string>([
  "STATE_SNAPSHOT", "ACTION_RESULT", "AGENT_HISTORY_RESULT", "AGENT_CONFIG_RESULT",
  "PROMPT_RESULT",
  "SESSION_EVENT",
  "PROCESS_STATUS_CHANGE",
  "TEST_CONNECTION_RESULT",
  "INPUT_HISTORY_UPDATE",
]);

export function isExtensionMessage(val: unknown): val is ExtensionMessage {
  if (!val || typeof val !== "object") return false;
  const msg = val as { type?: unknown; payload?: unknown };
  if (typeof msg.type !== "string" || !EXTENSION_MESSAGE_TYPES.has(msg.type))
    return false;
  if (msg.type !== "PROMPT_RESULT") return true;
  if (!msg.payload || typeof msg.payload !== "object") return false;
  const payload = msg.payload as Record<string, unknown>;
  return (
    typeof payload.requestId === "string" &&
    typeof payload.sessionId === "string" &&
    ["accepted", "completed", "rejected"].includes(String(payload.status)) &&
    (payload.error === undefined || typeof payload.error === "string")
  );
}
