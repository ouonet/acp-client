import type { WebviewAppState, AppAction } from "./types";
import { initialSessionState, sessionReducer } from "./session-slice";
import { initialAgentState, agentReducer } from "./agent-slice";
import { initialInputState, inputReducer } from "./input-slice";

export type Listener = (state: WebviewAppState) => void;

export class AppStore {
  private state: WebviewAppState;
  private listeners = new Set<Listener>();
  private revision = -1;
  private inputs = new Map<string, WebviewAppState["input"]>();
  private inputKey = "";

  constructor(initialState?: Partial<WebviewAppState>) {
    this.state = {
      session: { ...initialSessionState, ...(initialState?.session || {}) },
      agent: { ...initialAgentState, ...(initialState?.agent || {}) },
      input: { ...initialInputState, ...(initialState?.input || {}) },
    };
  }

  public getState(): WebviewAppState {
    return this.state;
  }

  public dispatch(action: AppAction): void {
    let input = this.state.input;
    if (action.type === "APPLY_SNAPSHOT") {
      const snap = action.payload;
      if (typeof snap.revision === "number") {
        if (snap.revision < this.revision) return;
        this.revision = snap.revision;
      }
      const key = JSON.stringify([snap.activeAgentId || snap.activeSession?.agentId || "", snap.activeSession?.id || ""]);
      if (key !== this.inputKey) {
        const firstPrompt = this.inputKey && input.pendingSubmission?.sessionId === "" && snap.activeSession?.id && JSON.parse(this.inputKey)[0] === (snap.activeAgentId || snap.activeSession.agentId);
        if (firstPrompt) input = { ...input, pendingSubmission: { ...input.pendingSubmission!, sessionId: snap.activeSession.id } };
        else {
          if (this.inputKey) this.inputs.set(this.inputKey, input);
          input = this.inputs.get(key) || { ...initialInputState };
        }
        this.inputKey = key;
      }
    }
    if (action.type === "PROMPT_RESULT" && input.pendingSubmission?.requestId !== action.payload.requestId) {
      for (const [key, saved] of this.inputs) {
        if (saved.pendingSubmission?.requestId === action.payload.requestId) this.inputs.set(key, inputReducer(saved, action));
      }
    }
    if (action.type === "ACTION_RESULT" && action.payload.action === "SET_CONFIG_OPTION") {
      for (const [key, saved] of this.inputs) {
        if (saved.configPending?.requestId === action.payload.requestId) {
          this.inputs.set(key, inputReducer(saved, action));
        }
      }
    }
    const nextState: WebviewAppState = {
      session: sessionReducer(this.state.session, action),
      agent: agentReducer(this.state.agent, action),
      input: inputReducer(input, action),
    };

    if (nextState !== this.state) {
      this.state = nextState;
      for (const listener of this.listeners) {
        try {
          listener(this.state);
        } catch (err) {
          console.error("[AppStore] Listener error:", err);
        }
      }
    }
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const globalStore = new AppStore();
