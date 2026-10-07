import type { InputState, AppAction } from "./types";

export const initialInputState: InputState = {
  draft: "",
  history: [],
  historyIndex: -1,
  tempDraft: "",
  attachments: [],
  availableModels: [],
  availableThinkingLevels: [],
  availableCommands: [],
  isSubmitting: false,
};

export function inputReducer(state: InputState, action: AppAction): InputState {
  switch (action.type) {
    case "APPLY_SNAPSHOT": {
      const snap = action.payload;
      const s = snap.activeSession;
      return {
        ...state,
        history: snap.inputHistory || state.history,
        availableModels: s?.availableModels || [],
        selectedModel: s?.model,
        modelConfigId: s?.modelConfigId,
        thinkingConfigId: s?.thinkingConfigId,
        configPending: state.configPending?.sessionId === s?.id ? state.configPending : undefined,
        configError: state.configError,
        availableThinkingLevels: s?.availableThinkingLevels || [],
        thinkingLevel: s?.thinkingLevel,
        availableCommands: s?.availableCommands || [],
      };
    }
    case "INPUT_HISTORY_UPDATE": {
      return { ...state, history: action.payload };
    }
    case "CONFIG_CHANGE_STARTED":
      return { ...state, configPending: action.payload, configError: undefined };
    case "ACTION_RESULT": {
      if (action.payload.action !== "SET_CONFIG_OPTION" || state.configPending?.requestId !== action.payload.requestId) return state;
      return { ...state, configPending: undefined, configError: action.payload.success ? undefined : action.payload.error || "Configuration change failed" };
    }
    case "SESSION_EVENT": {
      if (action.payload.type === "config_option_update") {
        const s = action.payload.payload as any;
        return { ...state, selectedModel: s.model, thinkingLevel: s.thinkingLevel, modelConfigId: s.modelConfigId, thinkingConfigId: s.thinkingConfigId, availableModels: s.availableModels || [], availableThinkingLevels: s.availableThinkingLevels || [] };
      }
      if (action.payload.type === "available_commands_update") {
        return {
          ...state,
          availableCommands: (action.payload.payload as any)?.availableCommands || [],
        };
      }
      return state;
    }
    case "RESTORE_PROMPT":
      return { ...state, ...structuredClone(action.payload), draftRevision: (state.draftRevision || 0) + 1, historyIndex: -1, tempDraft: "", submitError: undefined };
    case "SET_DRAFT": {
      return {
        ...state,
        draft: action.payload,
        draftRevision: (state.draftRevision || 0) + 1,
        submitError: undefined,
      };
    }
    case "PROMPT_STARTED": {
      return {
        ...state,
        isSubmitting: true,
        submitError: undefined,
        pendingSubmission: {
          requestId: action.payload.requestId,
          sessionId: action.payload.sessionId,
          revision: state.draftRevision || 0,
          draft: state.draft,
        },
      };
    }
    case "PROMPT_RESULT": {
      const res = action.payload;
      if (!state.pendingSubmission || state.pendingSubmission.requestId !== res.requestId) {
        return state;
      }
      if (res.status === "accepted" || res.status === "completed") {
        // Acceptance consumes the input; completion releases the submission lock.
        const draftUnchanged = state.draft === state.pendingSubmission.draft && (state.draftRevision || 0) === state.pendingSubmission.revision;
        return {
          ...state,
          isSubmitting: res.status !== "completed",
          pendingSubmission: res.status === "completed" ? undefined : state.pendingSubmission,
          draft: draftUnchanged ? "" : state.draft,
          attachments: draftUnchanged ? [] : state.attachments,
          historyIndex: draftUnchanged ? -1 : state.historyIndex,
          tempDraft: draftUnchanged ? "" : state.tempDraft,
        };
      }
      if (res.status === "rejected" || (res as any).status === "error") {
        return {
          ...state,
          isSubmitting: false,
          pendingSubmission: undefined,
          submitError: res.error || "Submission failed",
        };
      }
      return state;
    }
    case "ADD_ATTACHMENT": {
      return { ...state, attachments: [...state.attachments, action.payload], draftRevision: (state.draftRevision || 0) + 1 };
    }
    case "REMOVE_ATTACHMENT": {
      return {
        ...state,
        attachments: state.attachments.filter((a) => a.id !== action.payload),
        draftRevision: (state.draftRevision || 0) + 1,
      };
    }
    case "CLEAR_INPUT": {
      return { ...state, draft: "", attachments: [], historyIndex: -1, tempDraft: "", submitError: undefined };
    }
    case "SET_MODEL": {
      return { ...state, selectedModel: action.payload };
    }
    case "SET_THINKING_LEVEL": {
      return { ...state, thinkingLevel: action.payload };
    }
    case "SET_SUBMITTING": {
      return { ...state, isSubmitting: action.payload };
    }
    case "HISTORY_NAV": {
      if (state.history.length === 0) return state;
      const draftRevision = (state.draftRevision || 0) + 1;
      if (action.payload === "up") {
        const nextIdx = state.historyIndex === -1 ? state.history.length - 1 : Math.max(0, state.historyIndex - 1);
        const temp = state.historyIndex === -1 ? state.draft : state.tempDraft;
        return { ...state, historyIndex: nextIdx, tempDraft: temp, draft: state.history[nextIdx] || "", draftRevision };
      } else {
        if (state.historyIndex === -1) return state;
        const nextIdx = state.historyIndex + 1;
        if (nextIdx >= state.history.length) {
          return { ...state, historyIndex: -1, draft: state.tempDraft, draftRevision };
        }
        return { ...state, historyIndex: nextIdx, draft: state.history[nextIdx] || "", draftRevision };
      }
    }
    default:
      return state;
  }
}
