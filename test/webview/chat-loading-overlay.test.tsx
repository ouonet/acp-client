// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { AppStore } from "../../src/webview/state/app-store";
import { StoreProvider } from "../../src/webview/state/store-context";
import { ActionProvider } from "../../src/webview/state/action-context";
import { App } from "../../src/webview/components/app";
import { HeaderBar } from "../../src/webview/components/header/header-bar";
import { ChatView } from "../../src/webview/components/chat/chat-view";

let root: HTMLElement;
let store: AppStore;
let send: ReturnType<typeof vi.fn>;

const config = (id: string) => ({
  id,
  name: id,
  command: "agent",
  args: ["--stdio"],
  transport: "stdio",
  enabled: true,
});

beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
  store = new AppStore();
  send = vi.fn();
});

afterEach(() => {
  render(null, root);
  root.remove();
});

async function mount(node: any) {
  await act(() =>
    render(
      <StoreProvider store={store}>
        <ActionProvider onAction={send}>{node}</ActionProvider>
      </StoreProvider>,
      root
    )
  );
}

describe("Chat Loading Overlay", () => {
  it("renders a grey waiting overlay with spinner when agent connection is pending", async () => {
    store.dispatch({
      type: "APPLY_SNAPSHOT",
      payload: {
        activeAgentId: "agent-1",
        activeSession: undefined,
        agentConfigs: [config("agent-1")],
        connections: [],
        sessions: [],
      },
    });

    // Lifecycle action started for agent-1
    store.dispatch({
      type: "LIFECYCLE_STARTED",
      payload: { agentId: "agent-1", requestId: "req-1" },
    });

    await mount(<App onAction={send} />);

    const overlay = root.querySelector(".chat-loading-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay?.querySelector(".chat-loading-spinner")).not.toBeNull();
    expect(overlay?.textContent).toContain("Connecting to Agent");
  });

  it("renders session initializing text when connected agent is creating a session", async () => {
    store.dispatch({
      type: "APPLY_SNAPSHOT",
      payload: {
        activeAgentId: "agent-1",
        activeSession: undefined,
        agentConfigs: [config("agent-1")],
        connections: [
          {
            agentId: "agent-1",
            status: "running",
            initialized: true,
            generation: 1,
          },
        ],
        sessions: [],
      },
    });

    store.dispatch({
      type: "LIFECYCLE_STARTED",
      payload: { agentId: "agent-1", requestId: "req-create-session" },
    });

    await mount(<App onAction={send} />);

    const overlay = root.querySelector(".chat-loading-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain("Initializing Session");
  });

  it("hides overlay when lifecyclePending completes", async () => {
    store.dispatch({
      type: "APPLY_SNAPSHOT",
      payload: {
        activeAgentId: "agent-1",
        activeSession: undefined,
        agentConfigs: [config("agent-1")],
        connections: [],
        sessions: [],
      },
    });

    store.dispatch({
      type: "LIFECYCLE_STARTED",
      payload: { agentId: "agent-1", requestId: "req-1" },
    });

    await mount(<App onAction={send} />);
    expect(root.querySelector(".chat-loading-overlay")).not.toBeNull();

    // Finish action
    await act(() => {
      store.dispatch({
        type: "ACTION_RESULT",
        payload: { requestId: "req-1", agentId: "agent-1", success: true },
      });
    });

    expect(root.querySelector(".chat-loading-overlay")).toBeNull();
  });

  it("header-bar does not render the plain text line 'Updating Agent / Session…'", async () => {
    store.dispatch({
      type: "APPLY_SNAPSHOT",
      payload: {
        activeAgentId: "agent-1",
        activeSession: undefined,
        agentConfigs: [config("agent-1")],
        connections: [],
        sessions: [],
      },
    });

    store.dispatch({
      type: "LIFECYCLE_STARTED",
      payload: { agentId: "agent-1", requestId: "req-1" },
    });

    await mount(<HeaderBar />);

    expect(root.querySelector(".lifecycle-progress")).toBeNull();
    expect(root.textContent).not.toContain("Updating Agent / Session");
  });
});
