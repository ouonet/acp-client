// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { AppStore } from "../../src/webview/state/app-store";
import { StoreProvider } from "../../src/webview/state/store-context";
import { ActionProvider } from "../../src/webview/state/action-context";
import { HeaderBar } from "../../src/webview/components/header/header-bar";

let root: HTMLElement, store: AppStore, send: ReturnType<typeof vi.fn>;
const config = (id: string) => ({
  id,
  name: `Agent ${id}`,
  command: "agent",
  args: [],
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
  vi.restoreAllMocks();
});

function installOverflowMetrics() {
  const client = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientWidth",
  );
  const offset = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetWidth",
  );
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return this.classList?.contains("agent-tab-budget")
        ? 60
        : typeof client?.get === "function"
          ? client.get.call(this)
          : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      if (this.hasAttribute("data-measure-agent")) return 80;
      return typeof offset?.get === "function" ? offset.get.call(this) : 0;
    },
  });
  return () => {
    if (client) Object.defineProperty(HTMLElement.prototype, "clientWidth", client);
    if (offset) Object.defineProperty(HTMLElement.prototype, "offsetWidth", offset);
  };
}

async function mountOverflow() {
  store.dispatch({
    type: "APPLY_SNAPSHOT",
    payload: {
      activeAgentId: "a",
      agentConfigs: [config("a"), config("b")],
      // connections stale: both claim running
      connections: [
        { agentId: "a", generation: 1, status: "running", initialized: true },
        { agentId: "b", generation: 1, status: "running", initialized: true },
      ],
      // real process state: b actually errored
      processStatuses: { a: "running", b: "error" },
    },
  });
  const restore = installOverflowMetrics();
  await act(() =>
    render(
      <StoreProvider store={store}>
        <ActionProvider onAction={send}>
          <HeaderBar />
        </ActionProvider>
      </StoreProvider>,
      root,
    ),
  );
  return restore;
}

it("overflow rows use status icons instead of status text", async () => {
  const restore = await mountOverflow();
  try {
    const menu = root.querySelector(".agent-overflow")!;
    expect(menu).not.toBeNull();
    const rows = Array.from(menu.querySelectorAll(".agent-overflow-row"));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      // no "· running" style text fragment
      expect(row.textContent).not.toMatch(/·/);
      // icon present
      expect(row.querySelector(".status-dot")).not.toBeNull();
    }
  } finally {
    restore();
  }
});

it("overflow rows show the live process status, not the stale connection snapshot", async () => {
  const restore = await mountOverflow();
  try {
    const menu = root.querySelector(".agent-overflow")!;
    const errorDot = menu.querySelector('.agent-overflow-row .status-dot.error');
    expect(errorDot).not.toBeNull();
    expect(menu.textContent).not.toMatch(/b · running/);
  } finally {
    restore();
  }
});

it("overflow rows align label and close action in a neat row", async () => {
  const restore = await mountOverflow();
  try {
    const menu = root.querySelector(".agent-overflow")!;
    const row = menu.querySelector(".agent-overflow-row")!;
    // label truncates via dedicated span, close button keeps its accessible name
    expect(row.querySelector(".agent-overflow-label")).not.toBeNull();
    expect(
      row.querySelector('[aria-label^="Disconnect"]'),
    ).not.toBeNull();
    // selected row still exposes aria-selected on the select control
    expect(row.querySelector('[aria-selected]')).not.toBeNull();
  } finally {
    restore();
  }
});

it("overflow menu anchors to the left so it is not clipped", () => {
  const css = readFileSync("src/webview/styles/lifecycle.css", "utf8");
  const idx = css.indexOf(".agent-overflow .menu-content");
  expect(idx).toBeGreaterThan(-1);
  const block = css.slice(idx, css.indexOf("}", idx));
  expect(block).toMatch(/left\s*:\s*0/);
});

it("overflow disconnect control does not steal the row width from the label", () => {
  // Regression: `.menu-content button { width: 100% }` made the disconnect
  // button's flex base 100% of the row, squeezing the select button (and its
  // nowrap ellipsis label) to zero width so names rendered invisible.
  const css = readFileSync("src/webview/styles/lifecycle.css", "utf8");
  const idx = css.indexOf(".agent-overflow-row > button:last-child");
  expect(idx).toBeGreaterThan(-1);
  const block = css.slice(idx, css.indexOf("}", idx));
  expect(block).toMatch(/width\s*:\s*auto/);
});

it("leaves the tab strip empty when every connection overflows", async () => {
  const restore = await mountOverflow();
  try {
    const strip = root.querySelector(".agent-tab-budget .agent-tabs")!;
    expect(strip).not.toBeNull();
    expect(strip.childElementCount).toBe(0);
    // The overflow trigger must follow the (empty) strip directly so it can
    // sit at the start of the connection bar.
    expect(strip.nextElementSibling?.classList.contains("agent-overflow")).toBe(
      true,
    );
  } finally {
    restore();
  }
});

it("collapses the empty tab strip so the overflow trigger aligns left", () => {
  // When every tab folds into the menu, the flex:1 strip would otherwise keep
  // all the space and push the trigger to the right of a blank gap.
  const css = readFileSync("src/webview/styles/lifecycle.css", "utf8");
  const idx = css.indexOf(".agent-tabs:empty");
  expect(idx).toBeGreaterThan(-1);
  const block = css.slice(idx, css.indexOf("}", idx));
  expect(block).toMatch(/flex\s*:\s*0/);
});
