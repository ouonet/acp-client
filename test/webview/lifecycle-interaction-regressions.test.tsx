// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { App } from "../../src/webview/components/app";
import { AppStore } from "../../src/webview/state/app-store";
import { StoreProvider } from "../../src/webview/state/store-context";
import { ActionProvider } from "../../src/webview/state/action-context";
import { HeaderBar } from "../../src/webview/components/header/header-bar";
import { HistoryDrawer } from "../../src/webview/components/drawers/history-drawer";

let root: HTMLElement, store: AppStore, send: ReturnType<typeof vi.fn>;
const config = (id: string) => ({
  id,
  name: id,
  command: "agent",
  args: [],
  transport: "stdio",
  enabled: true,
});
const snapshot = {
  activeAgentId: "a",
  agentConfigs: [config("a"), config("b")],
  connections: [
    {
      agentId: "a",
      generation: 1,
      status: "running",
      initialized: true,
      capabilities: { sessionCapabilities: { list: {}, load: {} } },
    },
  ],
  activeSession: {
    id: "s",
    agentId: "a",
    title: "Current",
    status: "idle",
    messages: [],
    createdAt: 1,
    updatedAt: 1,
  },
};
beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
  store = new AppStore();
  send = vi.fn();
  store.dispatch({ type: "APPLY_SNAPSHOT", payload: snapshot });
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
      root,
    ),
  );
}
async function click(selector: string) {
  await act(() => (root.querySelector(selector) as HTMLElement).click());
}
async function result(payload: any) {
  await act(() => store.dispatch({ type: "ACTION_RESULT", payload } as any));
}
function installTabMetrics(
  clientWidth: number,
  tabWidth: number | ((element: HTMLElement) => number),
) {
  const box = { clientWidth, tabWidth };
  const client = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientWidth",
  );
  const offset = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetWidth",
  );
  const read = (
    property: PropertyDescriptor | undefined,
    element: HTMLElement,
  ) => (typeof property?.get === "function" ? property.get.call(element) : 0);
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return this.classList?.contains("agent-tab-budget")
        ? box.clientWidth
        : read(client, this);
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      if (this.hasAttribute("data-measure-agent"))
        return typeof box.tabWidth === "function"
          ? box.tabWidth(this)
          : box.tabWidth;
      return read(offset, this);
    },
  });
  return Object.assign(
    () => {
      if (client)
        Object.defineProperty(HTMLElement.prototype, "clientWidth", client);
      if (offset)
        Object.defineProperty(HTMLElement.prototype, "offsetWidth", offset);
    },
    { box },
  );
}
function tabWidth(agentId: string, width: number) {
  return (element: HTMLElement) =>
    element.getAttribute("data-measure-agent") === agentId ? width : 20;
}
function menuLabels(scope: ParentNode) {
  return Array.from(scope.querySelectorAll(".menu-content button"))
    .filter(
      (button) => !button.getAttribute("aria-label")?.startsWith("Disconnect"),
    )
    .map((button) => button.textContent);
}
const connection = (agentId: string) => ({
  ...snapshot.connections[0],
  agentId,
});

it("covers the app with configuration and keeps keyboard focus inside the modal", async () => {
  await mount(<App onAction={send} />);
  const trigger = root.querySelector(
    '[aria-label="Agent Settings"]',
  ) as HTMLButtonElement;
  trigger.focus();
  await click('[aria-label="Agent Settings"]');
  const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
  expect(dialog.closest(".main-content")).toBeNull();
  for (const selector of [".acp-header", ".main-content", ".input-dock"]) {
    expect(root.querySelector(selector)?.hasAttribute("inert")).toBe(true);
  }
  const first = dialog.querySelector("button") as HTMLButtonElement;
  const last = Array.from(dialog.querySelectorAll("button")).at(-1)!;
  last.focus();
  await act(() => {
    last.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
  });
  expect(document.activeElement).toBe(first);
  await act(() => {
    first.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(root.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(root.querySelector(".input-dock")?.hasAttribute("inert")).toBe(false);
});

it("renders connection information outside the header stacking context", async () => {
  await mount(<HeaderBar />);
  await click('[aria-label="Connection information for a"]');
  expect(root.querySelector('[role="dialog"]')?.closest("header")).toBeNull();
});

it("hides overflow and connection information when no Agent is connected", async () => {
  store.dispatch({
    type: "APPLY_SNAPSHOT",
    payload: { agentConfigs: [], connections: [] },
  });
  await mount(<HeaderBar />);
  expect(root.querySelector(".agent-overflow")).toBeNull();
  expect(
    root.querySelector('[aria-label^="Connection information for"]'),
  ).toBeNull();
});

it("moves one wide Agent into the overflow menu", async () => {
  const restore = installTabMetrics(70, 80);
  try {
    await mount(<HeaderBar />);
    expect(root.querySelector('[role="tab"]')).toBeNull();
    const menu = root.querySelector(".agent-overflow") as HTMLDetailsElement;
    expect(menuLabels(menu)).toEqual(["a · running"]);
    expect(menu.querySelector('[aria-label="Disconnect a"]')).not.toBeNull();
    const info = root.querySelectorAll(
      '[aria-label="Connection information for a"]',
    );
    expect(info).toHaveLength(1);
    expect(info[0].closest(".session-header")).not.toBeNull();
    expect(root.querySelector(".connect-menu")).not.toBeNull();
    expect(root.querySelector('[aria-label="Agent Settings"]')).not.toBeNull();
  } finally {
    restore();
  }
});

it("hides overflow when multiple connected Agents fit", async () => {
  store.dispatch({
    type: "APPLY_SNAPSHOT",
    payload: { ...snapshot, connections: [connection("a"), connection("b")] },
  });
  const restore = installTabMetrics(100, 40);
  try {
    await mount(<HeaderBar />);
    expect(root.querySelector(".agent-overflow")).toBeNull();
    expect(root.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(
      root
        .querySelector('[role="tab"][aria-selected="true"]')
        ?.getAttribute("data-agent-id"),
    ).toBe("a");
    expect(
      root.querySelector('[aria-label="Connection information for a"]'),
    ).not.toBeNull();
    expect(
      root.querySelector('[aria-label="Connection information for b"]'),
    ).toBeNull();
  } finally {
    restore();
  }
});

it("lists only the overflowing Agent and selects it", async () => {
  store.dispatch({
    type: "APPLY_SNAPSHOT",
    payload: { ...snapshot, connections: [connection("a"), connection("b")] },
  });
  const restore = installTabMetrics(60, tabWidth("b", 40));
  try {
    await mount(<HeaderBar />);
    const menu = root.querySelector(".agent-overflow") as HTMLDetailsElement;
    expect(menu.querySelector("summary")?.textContent).toBe("");
    expect(menu.querySelector("summary svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(menu.querySelector("summary")?.getAttribute("aria-label")).toBe(
      "Agent overflow",
    );
    expect(menuLabels(menu)).toEqual(["b · running"]);
    expect(root.querySelectorAll('[role="tab"]')).toHaveLength(1);
    await act(() => {
      (menu.querySelector(".menu-content button") as HTMLButtonElement).click();
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SELECT_AGENT",
        payload: expect.objectContaining({ agentId: "b" }),
      }),
    );
  } finally {
    restore();
  }
});

it("keeps the opened connection dialog when the selected Agent is cleared", async () => {
  store.dispatch({
    type: "APPLY_SNAPSHOT",
    payload: { ...snapshot, connections: [connection("a"), connection("b")] },
  });
  await mount(<HeaderBar />);
  await act(() => store.dispatch({ type: "SELECT_AGENT", payload: "b" }));
  const info = root.querySelector(
    '[aria-label="Connection information for b"]',
  ) as HTMLButtonElement;
  expect(info.closest(".session-header")).not.toBeNull();
  await act(() => info.click());
  expect(root.querySelector('[role="dialog"]')).not.toBeNull();
  await act(() => store.dispatch({ type: "SELECT_AGENT", payload: "" }));
  expect(
    root.querySelector(
      '.session-header [aria-label^="Connection information for"]',
    ),
  ).toBeNull();
  expect(root.querySelector('[role="dialog"]')).not.toBeNull();
});

it("measures overflow after the connected set changes when ResizeObserver is missing", async () => {
  const observer = globalThis.ResizeObserver;
  Reflect.deleteProperty(globalThis, "ResizeObserver");
  const fitting = installTabMetrics(100, 40);
  try {
    await mount(<HeaderBar />);
    expect(root.querySelector(".agent-overflow")).toBeNull();
    fitting();
    const overflowing = installTabMetrics(70, 80);
    try {
      await act(() =>
        store.dispatch({
          type: "APPLY_SNAPSHOT",
          payload: {
            ...snapshot,
            connections: [connection("a"), connection("b")],
          },
        }),
      );
      expect(root.querySelector(".agent-overflow")).not.toBeNull();
    } finally {
      overflowing();
    }
  } finally {
    if (observer) globalThis.ResizeObserver = observer;
  }
});

it("keeps every tab on the strip until widths are measured", async () => {
  store.dispatch({
    type: "APPLY_SNAPSHOT",
    payload: { ...snapshot, connections: [connection("a"), connection("b")] },
  });
  const restore = installTabMetrics(10, 0);
  try {
    await mount(<HeaderBar />);
    expect(root.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(root.querySelector(".agent-overflow")).toBeNull();
  } finally {
    restore();
  }
});

it("puts every tab in the menu when none fit beside it", async () => {
  store.dispatch({
    type: "APPLY_SNAPSHOT",
    payload: { ...snapshot, connections: [connection("a"), connection("b")] },
  });
  const restore = installTabMetrics(20, 10);
  try {
    await mount(<HeaderBar />);
    expect(root.querySelector('[role="tab"]')).toBeNull();
    expect(menuLabels(root.querySelector(".agent-overflow")!)).toEqual([
      "a · running",
      "b · running",
    ]);
  } finally {
    restore();
  }
});

it("marks the selected overflow row and leaves strip tabs unselected", async () => {
  store.dispatch({
    type: "APPLY_SNAPSHOT",
    payload: {
      ...snapshot,
      activeAgentId: "b",
      connections: [connection("a"), connection("b")],
    },
  });
  const restore = installTabMetrics(60, tabWidth("b", 40));
  try {
    await mount(<HeaderBar />);
    expect(
      root.querySelector('.agent-overflow [aria-selected="true"]')?.textContent,
    ).toBe("b · running");
    const tabs = Array.from(root.querySelectorAll('[role="tab"]'));
    expect(tabs).toHaveLength(1);
    expect(
      tabs.every((tab) => tab.getAttribute("aria-selected") === "false"),
    ).toBe(true);
    expect((tabs[0] as HTMLElement).tabIndex).toBe(0);
  } finally {
    restore();
  }
});

it("disconnects from inside the tab without selecting it", async () => {
  const restore = installTabMetrics(100, 40);
  try {
    await mount(<HeaderBar />);
    const close = root.querySelector(
      '[role="tab"] [aria-label="Disconnect a"]',
    ) as HTMLButtonElement;
    expect(close).not.toBeNull();
    await act(() => {
      close.click();
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "DISCONNECT_AGENT",
        payload: expect.objectContaining({ agentId: "a" }),
      }),
    );
    expect(send).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "SELECT_AGENT" }),
    );
  } finally {
    restore();
  }
});

it("disables disconnect while a lifecycle request is pending", async () => {
  store.dispatch({
    type: "APPLY_SNAPSHOT",
    payload: { ...snapshot, connections: [connection("a"), connection("b")] },
  });
  const restore = installTabMetrics(60, tabWidth("b", 40));
  try {
    await mount(<HeaderBar />);
    await act(() => {
      store.dispatch({
        type: "LIFECYCLE_STARTED",
        payload: { agentId: "a", requestId: "req-a" },
      });
      store.dispatch({
        type: "LIFECYCLE_STARTED",
        payload: { agentId: "b", requestId: "req-b" },
      });
    });
    expect(
      (
        root.querySelector(
          '[role="tab"] [aria-label="Disconnect a"]',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        root.querySelector(
          '.agent-overflow [aria-label="Disconnect b"]',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  } finally {
    restore();
  }
});

it("moves between strip tabs and stops at the ends", async () => {
  store.dispatch({
    type: "APPLY_SNAPSHOT",
    payload: { ...snapshot, connections: [connection("a"), connection("b")] },
  });
  const restore = installTabMetrics(100, 40);
  try {
    await mount(<HeaderBar />);
    const first = root.querySelector(
      '[role="tab"][data-agent-id="a"]',
    ) as HTMLElement;
    const second = root.querySelector(
      '[role="tab"][data-agent-id="b"]',
    ) as HTMLElement;
    first.focus();
    await act(() => {
      first.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(second);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SELECT_AGENT",
        payload: expect.objectContaining({ agentId: "b" }),
      }),
    );
    send.mockClear();
    await act(() => {
      second.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    expect(send).not.toHaveBeenCalled();
    await act(() => {
      first.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      );
    });
    expect(send).not.toHaveBeenCalled();
    await act(() => {
      second.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(first);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SELECT_AGENT",
        payload: expect.objectContaining({ agentId: "a" }),
      }),
    );
    send.mockClear();
    await act(() => {
      first.dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(second);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SELECT_AGENT",
        payload: expect.objectContaining({ agentId: "b" }),
      }),
    );
  } finally {
    restore();
  }
});

it("does not move tabs from the disconnect control", async () => {
  store.dispatch({
    type: "APPLY_SNAPSHOT",
    payload: { ...snapshot, connections: [connection("a"), connection("b")] },
  });
  const restore = installTabMetrics(100, 40);
  try {
    await mount(<HeaderBar />);
    const close = root.querySelector(
      '[role="tab"] [aria-label="Disconnect a"]',
    ) as HTMLButtonElement;
    const other = root.querySelector(
      '[aria-label="Disconnect b"]',
    ) as HTMLButtonElement;
    expect(close.tabIndex).toBe(0);
    expect(other.tabIndex).toBe(-1);
    close.focus();
    await act(() => {
      close.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    expect(send).not.toHaveBeenCalled();
  } finally {
    restore();
  }
});

it("selects the focused strip tab with Enter", async () => {
  store.dispatch({
    type: "APPLY_SNAPSHOT",
    payload: { ...snapshot, connections: [connection("a"), connection("b")] },
  });
  const restore = installTabMetrics(100, 40);
  try {
    await mount(<HeaderBar />);
    const second = root.querySelector(
      '[role="tab"][data-agent-id="b"]',
    ) as HTMLElement;
    second.focus();
    await act(() => {
      second.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SELECT_AGENT",
        payload: expect.objectContaining({ agentId: "b" }),
      }),
    );
  } finally {
    restore();
  }
});

it("moves focus to the overflow summary when the focused tab leaves the strip", async () => {
  store.dispatch({
    type: "APPLY_SNAPSHOT",
    payload: { ...snapshot, connections: [connection("a"), connection("b")] },
  });
  const restore = installTabMetrics(100, tabWidth("b", 40));
  try {
    await mount(<HeaderBar />);
    (
      root.querySelector('[role="tab"][data-agent-id="b"]') as HTMLElement
    ).focus();
    restore.box.clientWidth = 60;
    await act(() =>
      store.dispatch({
        type: "APPLY_SNAPSHOT",
        payload: {
          ...snapshot,
          connections: [connection("a"), connection("b")],
        },
      }),
    );
    expect(document.activeElement).toBe(
      root.querySelector(".agent-overflow summary"),
    );
  } finally {
    restore();
  }
});

it("folds squeezed strip tabs into the menu using measurer widths", async () => {
  store.dispatch({
    type: "APPLY_SNAPSHOT",
    payload: { ...snapshot, connections: [connection("a"), connection("b")] },
  });
  const restore = installTabMetrics(50, (element) =>
    element.closest(".agent-tab-measure") ? 80 : 20,
  );
  try {
    await mount(<HeaderBar />);
    expect(root.querySelector(".agent-overflow")).not.toBeNull();
    expect(root.querySelectorAll('[role="tab"]')).toHaveLength(0);
  } finally {
    restore();
  }
});

it("styles strip tabs with editor-tab chrome", () => {
  const css = readFileSync("src/webview/styles/lifecycle.css", "utf8");
  for (const token of [
    "--vscode-tab-inactiveBackground",
    "--vscode-tab-inactiveForeground",
    "--vscode-tab-activeBackground",
    "--vscode-tab-activeForeground",
    "--vscode-tab-activeBorderTop",
    "--vscode-tab-hoverBackground",
    "--vscode-tab-hoverForeground",
    "--vscode-editorGroupHeader-tabsBackground",
    "border-radius: 0",
    "padding-inline-end: 22px",
    "position: absolute",
    "opacity: 0",
    "pointer-events: none",
    ".agent-tab:hover",
    ".agent-tab:focus-within",
  ])
    expect(css).toContain(token);
  const strip = css.slice(
    css.indexOf(".agent-tabs {"),
    css.indexOf("}", css.indexOf(".agent-tabs {")),
  );
  expect(strip).toContain("overflow: hidden");
  expect(strip).not.toContain("auto");
});

it("dismisses header menus on selection, Escape and outside interaction", async () => {
  await mount(<HeaderBar />);
  const menu = root.querySelector(".connect-menu") as HTMLDetailsElement;
  menu.open = true;
  await click(".connect-menu .menu-content button");
  expect(menu.open).toBe(false);
  menu.open = true;
  await act(() => {
    menu.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(menu.open).toBe(false);
  menu.open = true;
  await act(() => {
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(menu.open).toBe(false);
});

it("prevents duplicate lifecycle requests until their own acknowledgement", async () => {
  await mount(<HeaderBar />);
  const button = root.querySelector(
    '[data-action="new-session"]',
  ) as HTMLButtonElement;
  await act(() => {
    button.click();
    button.click();
  });
  expect(send).toHaveBeenCalledTimes(1);
  expect(button.disabled).toBe(true);
  const request = send.mock.calls[0][0];
  await result({ requestId: "other", agentId: "a", success: true });
  expect(button.disabled).toBe(true);
  await result({
    requestId: request.payload.requestId,
    agentId: "a",
    success: false,
    error: "Cannot create",
  });
  expect(button.disabled).toBe(false);
  expect(root.textContent).toContain("Cannot create");
  await click('[data-action="new-session"]');
  expect(send).toHaveBeenCalledTimes(2);
});

it("blocks sending to the old Session while New is awaiting acknowledgement", async () => {
  store.dispatch({ type: "SET_DRAFT", payload: "Keep this draft" });
  await mount(<App onAction={send} />);
  await click('[data-action="new-session"]');
  const request = send.mock.calls.at(-1)![0];
  expect(
    (
      root.querySelector(
        '[aria-label="User prompt input"]',
      ) as HTMLTextAreaElement
    ).disabled,
  ).toBe(true);
  await click('[title="Send Prompt (Enter)"]');
  expect(send).toHaveBeenCalledTimes(1);
  await act(() =>
    store.dispatch({ type: "APPLY_SNAPSHOT", payload: snapshot }),
  );
  expect(
    (root.querySelector('[title="Send Prompt (Enter)"]') as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await result({
    requestId: request.payload.requestId,
    agentId: "a",
    success: false,
    error: "Cannot replace",
  });
  expect(
    (
      root.querySelector(
        '[aria-label="User prompt input"]',
      ) as HTMLTextAreaElement
    ).disabled,
  ).toBe(false);
  expect(store.getState().input.draft).toBe("Keep this draft");
});

it("settles acknowledgements for independent Agents even when results arrive together", async () => {
  await mount(<HeaderBar />);
  await click('[data-action="new-session"]');
  const first = send.mock.calls.at(-1)![0];
  await act(() =>
    store.dispatch({
      type: "APPLY_SNAPSHOT",
      payload: {
        ...snapshot,
        activeAgentId: "b",
        activeSession: { ...snapshot.activeSession, agentId: "b" },
        connections: [
          ...snapshot.connections,
          { ...snapshot.connections[0], agentId: "b" },
        ],
      },
    }),
  );
  await click('[data-action="new-session"]');
  const second = send.mock.calls.at(-1)![0];
  await act(() => {
    store.dispatch({
      type: "ACTION_RESULT",
      payload: {
        requestId: first.payload.requestId,
        agentId: "a",
        success: true,
      },
    });
    store.dispatch({
      type: "ACTION_RESULT",
      payload: {
        requestId: second.payload.requestId,
        agentId: "b",
        success: true,
      },
    });
  });
  expect(store.getState().agent.lifecyclePending).toEqual({});
  await click('[data-action="new-session"]');
  expect(send).toHaveBeenCalledTimes(3);
});

it("offers configuration when every Agent is disabled", async () => {
  store.dispatch({
    type: "APPLY_SNAPSHOT",
    payload: {
      ...snapshot,
      agentConfigs: [{ ...config("a"), enabled: false }],
    },
  });
  await mount(<HeaderBar />);
  expect(root.querySelector(".connect-menu")?.textContent).toContain(
    "Configure Agent",
  );
});

it("retains history and reports load failure until a successful load", async () => {
  const close = vi.fn();
  await mount(<HistoryDrawer open onClose={close} />);
  const request = send.mock.calls.find(
    (c) => c[0].type === "REQUEST_AGENT_HISTORY",
  )![0];
  await act(() =>
    store.dispatch({
      type: "AGENT_HISTORY_RESULT",
      payload: {
        agentId: "a",
        requestId: request.payload.requestId,
        sessions: [{ id: "remote", title: "Remote" }],
      },
    } as any),
  );
  await click(".session-item");
  const load = send.mock.calls.at(-1)![0];
  expect(close).not.toHaveBeenCalled();
  expect(
    (root.querySelector(".session-item") as HTMLButtonElement).disabled,
  ).toBe(true);
  await result({
    requestId: load.payload.requestId,
    agentId: "a",
    success: false,
    error: "Agent refused load",
  });
  expect(close).not.toHaveBeenCalled();
  expect(root.textContent).toContain("Agent refused load");
  await click(".session-item");
  const retry = send.mock.calls.at(-1)![0];
  await result({
    requestId: retry.payload.requestId,
    agentId: "a",
    success: true,
  });
  expect(close).toHaveBeenCalledOnce();
});
