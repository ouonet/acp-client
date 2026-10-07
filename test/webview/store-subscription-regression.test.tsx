// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { AppStore } from "../../src/webview/state/app-store";
import { StoreProvider, useAppStore } from "../../src/webview/state/store-context";

it("shows the first host snapshot delivered between initial render and subscription", async () => {
  const store = new AppStore();
  const container = document.createElement("div");
  function Conversation() {
    const [state] = useAppStore();
    return <div>{state.session.activeSession?.title ?? "empty"}</div>;
  }
  // Deliberately deliver the READY response before passive effects subscribe.
  render(<StoreProvider store={store}><Conversation /></StoreProvider>, container);
  store.dispatch({ type: "APPLY_SNAPSHOT", payload: { activeSession: {
    id: "s", agentId: "a", title: "First conversation", status: "idle", createdAt: 1, updatedAt: 1, messages: [],
  } } });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 120)); });
  expect(container.textContent).toBe("First conversation");
  act(() => render(null, container));
});
