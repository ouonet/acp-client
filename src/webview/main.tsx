import { render } from "preact";
import { globalStore } from "./state/app-store";
import { StoreProvider } from "./state/store-context";
import { App } from "./components/app";
import type { ExtensionMessage, WebviewAction } from "../shared/ipc-protocol";

declare function acquireVsCodeApi<T = unknown>(): {
  postMessage: (msg: unknown) => void;
  getState: () => T | undefined;
  setState: (state: T) => void;
};

export const vscodeApi =
  typeof acquireVsCodeApi === "function"
    ? acquireVsCodeApi()
    : {
        postMessage: (msg: unknown) => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("vscode-post-message", { detail: msg }));
          }
        },
        getState: () => undefined,
        setState: () => {},
      };

export function mountApp(): void {
  const container = document.getElementById("app") || document.body;

  window.addEventListener("message", (event) => {
    const msg = event.data as ExtensionMessage;
    if (!msg || !msg.type) return;

    if (msg.type === "STATE_SNAPSHOT") {
      globalStore.dispatch({ type: "APPLY_SNAPSHOT", payload: msg.payload });
    } else if (msg.type === "SESSION_EVENT") {
      const { sessionId, agentId, generation, runtimeRevision, event: sEvent } = msg.payload;
      const active = globalStore.getState().session.activeSession;
      const connection = globalStore.getState().agent.connections?.find(c => c.agentId === agentId);
      if (sessionId && active && sessionId !== active.id) return;
      if (agentId && active?.agentId !== agentId) return;
      if (generation !== undefined && connection?.generation !== generation) return;
      if (runtimeRevision !== undefined && active?.runtimeRevision !== runtimeRevision) return;

      if (sEvent.type === "chunk") {
        globalStore.dispatch({ type: "CHUNK", payload: sEvent.payload });
      } else if (sEvent.type === "thinking") {
        globalStore.dispatch({ type: "THINKING", payload: sEvent.payload });
      } else if (sEvent.type === "status_change") {
        globalStore.dispatch({ type: "SESSION_STATUS_CHANGE", payload: { status: (sEvent.payload as any).status } });
      } else if (sEvent.type === "tool_call") {
        globalStore.dispatch({ type: "TOOL_CALL", payload: sEvent.payload });
      } else if (sEvent.type === "tool_result") {
        globalStore.dispatch({ type: "TOOL_RESULT", payload: sEvent.payload });
      } else if (sEvent.type === "permission_request") {
        globalStore.dispatch({ type: "PERMISSION_REQUEST", payload: sEvent.payload });
      } else if (sEvent.type === "available_commands_update" || sEvent.type === "config_option_update") {
        globalStore.dispatch({ type: "SESSION_EVENT", payload: sEvent });
      }
    } else if (msg.type === "PROCESS_STATUS_CHANGE") {
      globalStore.dispatch({ type: "PROCESS_STATUS_CHANGE", payload: msg.payload });
    } else if (msg.type === "INPUT_HISTORY_UPDATE") {
      globalStore.dispatch({ type: "INPUT_HISTORY_UPDATE", payload: msg.payload.history });
    } else if (msg.type === "AGENT_HISTORY_RESULT" || msg.type === "AGENT_CONFIG_RESULT" || msg.type === "TEST_CONNECTION_RESULT" || msg.type === "ACTION_RESULT") {
      globalStore.dispatch({ type: msg.type, payload: msg.payload } as any);
    } else if (msg.type === "PROMPT_RESULT") {
      globalStore.dispatch({ type: "PROMPT_RESULT", payload: msg.payload });
    }
  });

  render(
    <StoreProvider store={globalStore}>
      <App onAction={(action) => vscodeApi.postMessage(action as WebviewAction)} />
    </StoreProvider>,
    container,
  );

  vscodeApi.postMessage({ type: "READY" } as WebviewAction);
}

if (typeof document !== "undefined") {
  mountApp();
}
