/**
 * Shared Type-Safe IPC Protocol for Webview <-> Extension Communication
 */

import type { AgentConfig } from '../core/types/config';
import type {
  ContentBlock,
  PromptOptions,
  ThinkingLevel,
  ForkSessionOptions,
  SessionData,
  SessionSummary,
  SessionEvent,
} from '../core/types/session';
import type { ProcessStatus, ProcessStatusEvent } from '../core/ports';

// -------------------------------------------------------------
// Webview -> Extension Actions
// -------------------------------------------------------------

export type WebviewAction =
  | { type: 'READY' }
  | {
      type: 'SEND_PROMPT';
      payload: {
        sessionId: string;
        prompt: string | ContentBlock[];
        options?: PromptOptions;
      };
    }
  | {
      type: 'CANCEL_PROMPT';
      payload: {
        sessionId: string;
      };
    }
  | {
      type: 'RESPOND_PERMISSION';
      payload: {
        sessionId: string;
        requestId: string;
        decision: 'allow' | 'deny';
        options?: any;
      };
    }
  | {
      type: 'CREATE_SESSION';
      payload: {
        agentId: string;
        title?: string;
        model?: string;
        thinkingLevel?: ThinkingLevel;
        cwd?: string;
      };
    }
  | {
      type: 'SWITCH_SESSION';
      payload: {
        sessionId: string;
      };
    }
  | {
      type: 'FORK_SESSION';
      payload: {
        sourceSessionId: string;
        options?: ForkSessionOptions;
      };
    }
  | {
      type: 'DELETE_SESSION';
      payload: {
        sessionId: string;
      };
    }
  | {
      type: 'SAVE_AGENT_CONFIG';
      payload: {
        config: AgentConfig;
      };
    }
  | {
      type: 'DELETE_AGENT_CONFIG';
      payload: {
        agentId: string;
      };
    }
  | {
      type: 'TEST_AGENT_CONNECTION';
      payload: {
        config: AgentConfig;
      };
    }
  | {
      type: 'RESTART_AGENT_PROCESS';
      payload: {
        agentId: string;
      };
    }
  | {
      type: 'STOP_AGENT_PROCESS';
      payload: {
        agentId: string;
      };
    }
  | {
      type: 'INSERT_CODE_TO_EDITOR';
      payload: {
        code: string;
      };
    };

export const WEBVIEW_ACTION_TYPES = new Set<string>([
  'READY',
  'SEND_PROMPT',
  'CANCEL_PROMPT',
  'RESPOND_PERMISSION',
  'CREATE_SESSION',
  'SWITCH_SESSION',
  'FORK_SESSION',
  'DELETE_SESSION',
  'SAVE_AGENT_CONFIG',
  'DELETE_AGENT_CONFIG',
  'TEST_AGENT_CONNECTION',
  'RESTART_AGENT_PROCESS',
  'STOP_AGENT_PROCESS',
  'INSERT_CODE_TO_EDITOR',
]);

export function isWebviewAction(val: unknown): val is WebviewAction {
  if (!val || typeof val !== 'object') return false;
  const msg = val as { type?: unknown };
  return typeof msg.type === 'string' && WEBVIEW_ACTION_TYPES.has(msg.type);
}

// -------------------------------------------------------------
// Extension -> Webview Events & Snapshots
// -------------------------------------------------------------

export interface WebviewStateSnapshot {
  activeSession?: SessionData;
  sessions: SessionSummary[];
  agentConfigs: AgentConfig[];
  inputHistory: string[];
  processStatuses: Record<string, ProcessStatus>;
}

export type ExtensionMessage =
  | {
      type: 'STATE_SNAPSHOT';
      payload: WebviewStateSnapshot;
    }
  | {
      type: 'SESSION_EVENT';
      payload: {
        sessionId: string;
        event: SessionEvent;
      };
    }
  | {
      type: 'PROCESS_STATUS_CHANGE';
      payload: ProcessStatusEvent;
    }
  | {
      type: 'TEST_CONNECTION_RESULT';
      payload: {
        success: boolean;
        protocolVersion?: number;
        capabilities?: any;
        error?: string;
        durationMs: number;
      };
    }
  | {
      type: 'INPUT_HISTORY_UPDATE';
      payload: {
        history: string[];
      };
    };

export const EXTENSION_MESSAGE_TYPES = new Set<string>([
  'STATE_SNAPSHOT',
  'SESSION_EVENT',
  'PROCESS_STATUS_CHANGE',
  'TEST_CONNECTION_RESULT',
  'INPUT_HISTORY_UPDATE',
]);

export function isExtensionMessage(val: unknown): val is ExtensionMessage {
  if (!val || typeof val !== 'object') return false;
  const msg = val as { type?: unknown };
  return typeof msg.type === 'string' && EXTENSION_MESSAGE_TYPES.has(msg.type);
}
