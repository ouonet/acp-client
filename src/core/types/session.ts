/**
 * Session, Message, and Multimodal Event Types
 */

export type SessionStatus = 'idle' | 'streaming' | 'waiting_approval' | 'error';
export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high';

export interface PromptOptions {
  contextFiles?: string[];
  systemPrompt?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  thinkingBudgetTokens?: number;
  activeSkills?: string[];
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string; uri?: string }
  | { type: 'audio'; data: string; mimeType: string }
  | { type: 'resource'; resource: { uri: string; text?: string; blob?: string; mimeType?: string } }
  | { type: 'resource_link'; uri: string; name?: string; mimeType?: string };

export interface ToolCall {
  id: string;
  name: string;
  input: any;
  output?: any;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'denied';
}

export interface MessageChunk {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | ContentBlock[];
  thinking?: string;
  toolCalls?: ToolCall[];
}

export interface ForkSessionOptions {
  upToMessageIndex?: number;
  newAgentId?: string;
  newModel?: string;
  title?: string;
}

export interface SessionData {
  id: string;
  agentId: string;
  title: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  messages: MessageChunk[];
  parentSessionId?: string;
  forkedFromMessageIndex?: number;
}

export interface SessionSummary {
  id: string;
  agentId: string;
  title: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  messageCount: number;
  parentSessionId?: string;
}

export interface SessionEvent {
  type:
    | 'chunk'
    | 'thinking'
    | 'tool_call'
    | 'tool_result'
    | 'permission_request'
    | 'status_change'
    | 'error';
  sessionId: string;
  payload: any;
}
