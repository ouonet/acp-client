import { vi } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { AppStore } from "../../src/webview/state/app-store";
import { StoreProvider } from "../../src/webview/state/store-context";
import { ActionProvider } from "../../src/webview/state/action-context";
import { ChatView } from "../../src/webview/components/chat/chat-view";
import type { SessionData } from "../../src/core/types/session";

export function messageFixture(overrides: Partial<SessionData> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const store = new AppStore();
  const source: SessionData = {
    id: "source",
    agentId: "a",
    title: "Original",
    status: "idle",
    attached: true,
    runtimeRevision: 5,
    createdAt: 1,
    updatedAt: 1,
    messages: [
      { role: "user", content: "First" },
      { role: "assistant", content: "Reply one" },
      { role: "user", content: "Second\nline" },
      { role: "assistant", content: "Reply two" },
    ],
    ...overrides,
  };
  const base = {
    activeAgentId: "a",
    agentConfigs: [
      {
        id: "a",
        name: "Agent A",
        command: "demo",
        args: [],
        env: {},
        transport: "stdio",
        enabled: true,
      },
    ],
    connections: [
      { agentId: "a", status: "running", initialized: true, generation: 3 },
    ],
    sessions: [],
    inputHistory: [],
    processStatuses: { a: "running" },
    activeSession: source,
  };
  store.dispatch({ type: "APPLY_SNAPSHOT", payload: base });
  const send = vi.fn();
  act(() =>
    render(
      <StoreProvider store={store}>
        <ActionProvider onAction={send}>
          <ChatView />
        </ActionProvider>
      </StoreProvider>,
      container,
    ),
  );
  const dispatch = (action: any) => act(() => store.dispatch(action));
  const snapshot = (changes: any = {}) =>
    dispatch({ type: "APPLY_SNAPSHOT", payload: { ...base, ...changes } });
  const child = (
    boundary = 1,
    changes: Partial<SessionData> = {},
  ): SessionData => ({
    ...source,
    id: "child",
    parentSessionId: source.id,
    forkedFromMessageIndex: boundary,
    messages: structuredClone(source.messages.slice(0, boundary + 1)),
    ...changes,
  });
  const rewound = (boundary = 1): SessionData => ({
    ...source,
    messages:
      boundary < 0
        ? []
        : structuredClone(source.messages.slice(0, boundary + 1)),
  });
  const button = (action: "copy" | "rewind" | "fork", messageIndex = 1) =>
    container
      .querySelectorAll(action === "fork" ? ".assistant-turn" : ".user-turn")
      [messageIndex]?.querySelector<HTMLButtonElement>(
        `[data-action="${action}-message"]`,
      ) ?? null;
  const click = (action: "copy" | "rewind" | "fork", index = 1) => {
    const control = button(action, index);
    if (!control) throw new Error(`Missing ${action} user action`);
    act(() => control.click());
  };
  const receipt = (changes: any = {}) => {
    const request = send.mock.lastCall?.[0];
    const action = request?.type;
    return dispatch({
      type: "ACTION_RESULT",
      payload: {
        requestId: request?.payload.requestId,
        agentId: "a",
        action,
        success: true,
        ...(action === "FORK_SESSION" ? { sessionId: "child" } : {}),
        ...changes,
      },
    });
  };
  const unmount = () => {
    act(() => render(null, container));
    container.remove();
  };
  return {
    container,
    store,
    source,
    send,
    dispatch,
    snapshot,
    child,
    rewound,
    button,
    click,
    receipt,
    unmount,
  };
}
