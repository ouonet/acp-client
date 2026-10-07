import type {
  SessionData,
  SessionSummary,
  ThinkingLevel,
  AvailableCommand,
  CompactionEntry,
  SessionEvent,
  AgentConnectionSummary,
} from "../../core/types/session";
import type { AgentConfig } from "../../core/types/config";
import type { ProcessStatus } from "../../core/ports";
import type { ExtensionMessage } from "../../shared/ipc-protocol";

export type PromptResult = Extract<ExtensionMessage, { type: "PROMPT_RESULT" }>["payload"];
export type ActionResult = Extract<ExtensionMessage, { type: "ACTION_RESULT" }>["payload"];
export type ConnectionResult = Extract<ExtensionMessage, { type: "TEST_CONNECTION_RESULT" }>["payload"];

export interface PendingPermissionRequest {
  sessionId?: string;
  requestId: string;
  toolTitle: string;
  options?: readonly { optionId: string; name: string; kind: string }[];
}

export interface AttachmentItem {
  id: string;
  type: "image";
  mimeType: string;
  data: string;
  name?: string;
  size?: number;
}

export interface SlashItem {
  name: string;
  description: string;
  kind?: "client" | "agent" | "skill";
  inputHint?: string;
}

export interface SessionState {
  activeSession?: SessionData;
  sessions: SessionSummary[];
  streamingText: string;
  streamingThinking: string;
  pendingPermission?: PendingPermissionRequest;
  compactions: CompactionEntry[];
}

export interface AgentState {
  agentConfigs: AgentConfig[];
  selectedAgentId?: string;
  connections?: AgentConnectionSummary[];
  configRevisions?: Record<string, number>;
  historyResults?: Record<string, any>;
  configResults?: Record<string, any>;
  actionResult?: any;
  actionResults?: Record<string, ActionResult>;
  lifecyclePending?: Record<string, string>;
  processStatuses: Record<string, ProcessStatus>;
  capabilities?: any;
  connectionResult?: ConnectionResult;
  skills: Array<{ id?: string; name: string; description: string }>;
}

export interface InputState {
  draft: string;
  history: string[];
  historyIndex: number;
  tempDraft: string;
  attachments: AttachmentItem[];
  modelConfigId?: string;
  thinkingConfigId?: string;
  configPending?: { requestId: string; sessionId: string };
  configError?: string;
  selectedModel?: string;
  availableModels: string[];
  thinkingLevel?: ThinkingLevel;
  availableThinkingLevels: string[];
  availableCommands: AvailableCommand[];
  isSubmitting: boolean;
  activeSlashQuery?: string;
  draftRevision?: number;
  submitError?: string;
  pendingSubmission?: { requestId: string; sessionId: string; revision: number; draft: string };
}

export interface WebviewAppState {
  session: SessionState;
  agent: AgentState;
  input: InputState;
}

export type AppAction =
  | { type: "APPLY_SNAPSHOT"; payload: any }
  | { type: "SESSION_EVENT"; payload: SessionEvent }
  | { type: "PROMPT_STARTED"; payload: { requestId: string; sessionId: string } }
  | { type: "PROMPT_RESULT"; payload: PromptResult }
  | { type: "INPUT_HISTORY_UPDATE"; payload: string[] }
  | { type: "TEST_CONNECTION_RESULT"; payload: ConnectionResult }
  | { type: "AGENT_CONFIG_RESULT"; payload: any }
  | { type: "AGENT_HISTORY_RESULT"; payload: any }
  | { type: "ACTION_RESULT"; payload: any }
  | { type: "LIFECYCLE_STARTED"; payload: { agentId: string; requestId: string } }
  | { type: "LIFECYCLE_FINISHED"; payload: { agentId: string; requestId: string } }
  | { type: "RESTORE_PROMPT"; payload: { draft: string; attachments: AttachmentItem[] } }
  | { type: "INPUT_ERROR"; payload: string }
  | { type: "SESSION_STATUS_CHANGE"; payload: { status: string } }
  | { type: "CHUNK"; payload: any }
  | { type: "THINKING"; payload: any }
  | { type: "TOOL_CALL"; payload: any }
  | { type: "TOOL_RESULT"; payload: any }
  | { type: "PERMISSION_REQUEST"; payload: any }
  | { type: "PERMISSION_RESOLVED" }
  | { type: "PROCESS_STATUS_CHANGE"; payload: { agentId: string; status: ProcessStatus } }
  | { type: "SELECT_AGENT"; payload: string }
  | { type: "SET_DRAFT"; payload: string }
  | { type: "ADD_ATTACHMENT"; payload: AttachmentItem }
  | { type: "REMOVE_ATTACHMENT"; payload: string }
  | { type: "CLEAR_INPUT" }
  | { type: "CONFIG_CHANGE_STARTED"; payload: { requestId: string; sessionId: string } }
  | { type: "SET_MODEL"; payload: string }
  | { type: "SET_THINKING_LEVEL"; payload: ThinkingLevel }
  | { type: "SET_SUBMITTING"; payload: boolean }
  | { type: "HISTORY_NAV"; payload: "up" | "down" };
