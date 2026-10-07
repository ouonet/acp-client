import type { SessionState, AppAction } from "./types";
import { reconcileHistory, updateAssistant, eventText } from "./stream-messages";
import { projectThinking, projectToolCall, projectToolResult, finishExecution } from "./execution-projection";

export const initialSessionState: SessionState = {
  sessions: [],
  streamingText: "",
  streamingThinking: "",
  compactions: [],
};

export function sessionReducer(state: SessionState, action: AppAction): SessionState {
  switch (action.type) {
    case "APPLY_SNAPSHOT": {
      const snap = action.payload;
      let activeSession = snap.activeSession;
      if (activeSession && state.activeSession && activeSession.id === state.activeSession.id && activeSession.agentId === state.activeSession.agentId && activeSession.runtimeRevision === state.activeSession.runtimeRevision) {
        const reconciled = reconcileHistory(state.activeSession.messages || [], activeSession.messages || []);
        activeSession = { ...activeSession, messages: reconciled };
      }
      return {
        ...state,
        activeSession,
        sessions: snap.sessions || [],
        pendingPermission: snap.pendingPermission,
        compactions: snap.activeSession?.compactions || [],
        streamingText: "",
        streamingThinking: "",
      };
    }
    case "SESSION_STATUS_CHANGE": {
      if (!state.activeSession) return state;
      const status = action.payload.status as any;
      const isTerminal = status === "idle" || status === "error";
      return {
        ...state,
        activeSession: { ...state.activeSession, status, messages: isTerminal && state.activeSession.messages?.at(-1)?.role === "assistant" ? updateAssistant(state.activeSession.messages, finishExecution) : state.activeSession.messages },
        streamingText: isTerminal ? "" : state.streamingText,
        streamingThinking: isTerminal ? "" : state.streamingThinking,
        pendingPermission: isTerminal ? undefined : state.pendingPermission,
      };
    }
    case "CHUNK": {
      const text = eventText(action.payload);
      const startedAt = typeof action.payload === "object" ? (action.payload as any)?.messageStartedAt : undefined;
      const updatedMessages = updateAssistant(
        state.activeSession?.messages || [],
        (m) => { m.content = (typeof m.content === "string" ? m.content : "") + text; finishExecution(m); },
        startedAt,
      );
      return {
        ...state,
        streamingText: state.streamingText + text,
        activeSession: state.activeSession ? { ...state.activeSession, messages: updatedMessages } : undefined,
      };
    }
    case "THINKING": {
      const text = eventText(action.payload, true);
      const updatedMessages = updateAssistant(state.activeSession?.messages || [], (m) => {
        projectThinking(m, action.payload, text);
      }, typeof action.payload === "object" ? action.payload?.messageStartedAt : undefined);
      return {
        ...state,
        streamingThinking: state.streamingThinking + text,
        activeSession: state.activeSession ? { ...state.activeSession, messages: updatedMessages } : undefined,
      };
    }
    case "PERMISSION_REQUEST": {
      return { ...state, pendingPermission: action.payload };
    }
    case "PERMISSION_RESOLVED": {
      return { ...state, pendingPermission: undefined };
    }
    case "TOOL_CALL": {
      if (!state.activeSession) return state;
      const updatedMessages = updateAssistant(state.activeSession.messages || [], (m) => {
        projectToolCall(m, action.payload);
      }, action.payload.messageStartedAt);
      return { ...state, activeSession: { ...state.activeSession, messages: updatedMessages } };
    }
    case "TOOL_RESULT": {
      if (!state.activeSession) return state;
      const updatedMessages = updateAssistant(state.activeSession.messages || [], (m) => {
        projectToolResult(m, action.payload);
      });
      return { ...state, activeSession: { ...state.activeSession, messages: updatedMessages } };
    }
    default:
      return state;
  }
}
