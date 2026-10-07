import type { AgentState, AppAction } from "./types";

export const initialAgentState: AgentState = {
  agentConfigs: [],
  processStatuses: {},
  skills: [],
};

export function agentReducer(state: AgentState, action: AppAction): AgentState {
  switch (action.type) {
    case "APPLY_SNAPSHOT": {
      const snap = action.payload;
      const selectedId =
        snap.activeAgentId ||
        snap.activeSession?.agentId ||
        state.selectedAgentId ||
        snap.agentConfigs?.[0]?.id;
      return {
        ...state,
        agentConfigs: snap.agentConfigs || [],
        connections: snap.connections || [],
        configRevisions: snap.configRevisions || state.configRevisions || {},
        processStatuses: snap.processStatuses || {},
        capabilities: snap.activeAgentCapabilities || snap.activeSession?.capabilities,
        skills: snap.skills || [],
        selectedAgentId: selectedId,
      };
    }
    case "PROCESS_STATUS_CHANGE": {
      const { agentId, status } = action.payload;
      return {
        ...state,
        processStatuses: {
          ...state.processStatuses,
          [agentId]: status,
        },
      };
    }
    case "AGENT_CONFIG_RESULT":
      return { ...state, configResults: { ...state.configResults, [action.payload.requestId]: action.payload } };
    case "AGENT_HISTORY_RESULT":
      return { ...state, historyResults: { ...state.historyResults, [action.payload.requestId]: action.payload } };
    case "TEST_CONNECTION_RESULT":
      return { ...state, connectionResult: action.payload };
    case "LIFECYCLE_STARTED":
      return { ...state, lifecyclePending: { ...state.lifecyclePending, [action.payload.agentId]: action.payload.requestId } };
    case "LIFECYCLE_FINISHED": {
      if (state.lifecyclePending?.[action.payload.agentId] !== action.payload.requestId) return state;
      const lifecyclePending = { ...state.lifecyclePending };
      delete lifecyclePending[action.payload.agentId];
      return { ...state, lifecyclePending };
    }
    case "ACTION_RESULT": {
      const lifecyclePending = { ...state.lifecyclePending };
      for (const agentId of Object.keys(lifecyclePending)) {
        if (lifecyclePending[agentId] === action.payload.requestId && (!action.payload.agentId || action.payload.agentId === agentId)) delete lifecyclePending[agentId];
      }
      const receipts: NonNullable<AgentState["actionResults"]> = { ...state.actionResults };
      receipts[action.payload.requestId] = action.payload;
      const actionResults = Object.fromEntries(Object.entries(receipts).slice(-32));
      return { ...state, actionResult: action.payload, actionResults, lifecyclePending };
    }
    case "SELECT_AGENT": {
      return {
        ...state,
        selectedAgentId: action.payload,
      };
    }
    default:
      return state;
  }
}
