/**
 * Session, Message, and Multimodal Event Types
 */

import type { ProcessStatus } from "../ports";

export interface SessionRef { agentId: string; sessionId: string }
export interface AgentConnectionSummary {
  agentId: string;
  status: ProcessStatus;
  initialized: boolean;
  generation: number;
  capabilities?: any;
  clientCapabilities?: import("@agentclientprotocol/sdk").ClientCapabilities;
  protocolVersion?: number;
  agentInfo?: { name: string; title?: string; version?: string };
  error?: string;
}

export type SessionStatus = "idle" | "streaming" | "waiting_approval" | "error";
export type ThinkingLevel = string;

export interface PromptOptions {
  contextFiles?: string[];
  systemPrompt?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  thinkingBudgetTokens?: number;
  activeSkills?: string[];
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string; uri?: string }
  | { type: "audio"; data: string; mimeType: string }
  | {
      type: "resource";
      resource: {
        uri: string;
        text?: string;
        blob?: string;
        mimeType?: string;
      };
    }
  | { type: "resource_link"; uri: string; name?: string; mimeType?: string };

export interface ToolCall {
  id: string;
  name: string;
  input: any;
  output?: any;
  status: "pending" | "running" | "completed" | "failed" | "denied";
  startedAt?: number;
  completedAt?: number;
}

export interface AssistantTurn {
  thinking?: string;
  toolCalls: ToolCall[];
  startedAt?: number;
  completedAt?: number;
}

export interface MessageChunk {
  role: "user" | "assistant" | "system" | "tool";
  content: string | ContentBlock[];
  thinking?: string;
  toolCalls?: ToolCall[];
  turns?: AssistantTurn[];
  startedAt?: number;
  completedAt?: number;
}

export interface ForkSessionOptions {
  sourceAgentId?: string;
  upToMessageIndex?: number;
  newAgentId?: string;
  newModel?: string;
  title?: string;
}

export interface AvailableCommand {
  name: string;
  description: string;
  input?: {
    hint?: string;
  };
}

export interface CompactionEntry {
  compactionId: string;
  id?: string;
  status: "in_progress" | "completed" | "failed" | "cancelled" | string;
  summary?: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
  messageIndex?: number;
  tokensBefore?: number;
  tokensAfter?: number;
}

export interface SessionData {
  runtimeRevision?: number;
  attached?: boolean;
  initialContext?: MessageChunk[];
  id: string;
  agentId: string;
  title: string;
  cwd?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  modelConfigId?: string;
  thinkingConfigId?: string;
  availableModels?: string[];
  availableThinkingLevels?: string[];
  availableCommands?: AvailableCommand[];
  capabilities?: any;
  modes?: Array<{ id: string; name: string }>;
  compactions?: CompactionEntry[];
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  messages: MessageChunk[];
  parentSessionId?: string;
  forkedFromMessageIndex?: number;
}

export interface SessionSummary {
  runtimeRevision?: number;
  attached?: boolean;
  id: string;
  agentId: string;
  title: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  modelConfigId?: string;
  thinkingConfigId?: string;
  availableModels?: string[];
  availableThinkingLevels?: string[];
  availableCommands?: AvailableCommand[];
  capabilities?: any;
  modes?: Array<{ id: string; name: string }>;
  createdAt: number;
  updatedAt: number;
  status?: SessionStatus;
  messageCount: number;
  parentSessionId?: string;
  cwd?: string;
}

export interface SessionEvent {
  type:
    | "chunk"
    | "thinking"
    | "tool_call"
    | "tool_result"
    | "permission_request"
    | "status_change"
    | "config_option_update"
    | "available_commands_update"
    | "compaction"
    | "compaction_chunk"
    | "error";
  sessionId: string;
  agentId?: string;
  runtimeRevision?: number;
  payload: any;
}
