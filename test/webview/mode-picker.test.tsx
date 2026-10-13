// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { ModePicker } from "../../src/webview/components/input/mode-picker";
import { AppStore } from "../../src/webview/state/app-store";
import { StoreProvider } from "../../src/webview/state/store-context";
import { ActionProvider } from "../../src/webview/state/action-context";
import { InputDock } from "../../src/webview/components/input/input-dock";

describe("ModePicker Component", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.innerHTML = "";
    document.body.appendChild(container);
  });

  it("renders null if availableModes is undefined or empty", () => {
    render(<ModePicker onModeChange={vi.fn()} />, container);
    expect(container.innerHTML).toBe("");

    render(<ModePicker availableModes={[]} onModeChange={vi.fn()} />, container);
    expect(container.innerHTML).toBe("");
  });

  it("renders trigger button with current mode and toggles menu on click", async () => {
    const onModeChange = vi.fn();
    const modes = [
      { id: "ask", name: "Ask", description: "Read-only Q&A mode" },
      { id: "code", name: "Code", description: "Autonomous coding mode" },
    ];

    render(
      <ModePicker
        currentModeId="ask"
        availableModes={modes}
        onModeChange={onModeChange}
      />,
      container,
    );

    const toggle = container.querySelector(".mode-picker-toggle") as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    expect(toggle.textContent).toContain("Ask");

    // Initially menu is closed
    expect(container.querySelector(".mode-picker-panel")).toBeNull();

    // Click to open
    await act(async () => {
      toggle.click();
    });

    const panel = container.querySelector(".mode-picker-panel");
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("Session Mode");

    const options = container.querySelectorAll(".mode-picker-option");
    expect(options).toHaveLength(2);
    expect(options[0]?.textContent).toContain("Ask");
    expect(options[0]?.classList.contains("active")).toBe(true);
    expect(options[1]?.textContent).toContain("Code");
    expect(options[1]?.classList.contains("active")).toBe(false);

    // Select code mode
    await act(async () => {
      (options[1] as HTMLButtonElement).click();
    });

    expect(onModeChange).toHaveBeenCalledWith("code");
    // Menu closes after selection
    expect(container.querySelector(".mode-picker-panel")).toBeNull();
  });

  it("closes panel on Escape key or outside click", async () => {
    const modes = [
      { id: "default", name: "Default" },
      { id: "expert", name: "Expert" },
    ];

    render(
      <ModePicker
        currentModeId="default"
        availableModes={modes}
        onModeChange={vi.fn()}
      />,
      container,
    );

    const toggle = container.querySelector(".mode-picker-toggle") as HTMLButtonElement;
    await act(async () => {
      toggle.click();
    });
    expect(container.querySelector(".mode-picker-panel")).not.toBeNull();

    // Press Escape
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(container.querySelector(".mode-picker-panel")).toBeNull();

    // Open again and click outside
    await act(async () => {
      toggle.click();
    });
    expect(container.querySelector(".mode-picker-panel")).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(container.querySelector(".mode-picker-panel")).toBeNull();
  });
});

describe("InputDock ModePicker Integration", () => {
  let container: HTMLElement;
  let store: AppStore;
  let onAction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.innerHTML = "";
    document.body.appendChild(container);
    store = new AppStore();
    onAction = vi.fn();

    store.dispatch({
      type: "APPLY_SNAPSHOT",
      payload: {
        activeSession: {
          id: "sess-modes",
          agentId: "agent-1",
          title: "Session with Modes",
          status: "idle",
          messages: [],
          modes: [
            { id: "ask", name: "Ask", description: "Ask permission for actions" },
            { id: "bypass", name: "Bypass", description: "Auto-approve all actions" },
          ],
          currentModeId: "ask",
        },
        agentConfigs: [
          {
            id: "agent-1",
            name: "Agent 1",
            command: "echo",
            args: [],
            env: {},
            transport: "stdio",
            enabled: true,
          },
        ],
        processStatuses: { "agent-1": "running" },
      },
    });
  });

  it("renders ModePicker in InputDock and selecting a mode dispatches SET_SESSION_MODE", async () => {
    render(
      <StoreProvider store={store}>
        <ActionProvider onAction={onAction}>
          <InputDock />
        </ActionProvider>
      </StoreProvider>,
      container,
    );

    const toggle = container.querySelector(".mode-picker-toggle") as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    expect(toggle.textContent).toContain("Ask");

    // Open mode picker
    await act(async () => {
      toggle.click();
    });

    const bypassOption = container.querySelectorAll(".mode-picker-option")[1] as HTMLButtonElement;
    expect(bypassOption.textContent).toContain("Bypass");

    // Click bypass mode
    await act(async () => {
      bypassOption.click();
    });

    // Check action dispatched
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_SESSION_MODE",
        payload: expect.objectContaining({
          sessionId: "sess-modes",
          modeId: "bypass",
        }),
      }),
    );

    // State is updated optimistically via local mode_change
    expect(store.getState().session.activeSession?.currentModeId).toBe("bypass");
  });

  it("does not render ModePicker if session has no modes", () => {
    store.dispatch({
      type: "APPLY_SNAPSHOT",
      payload: {
        activeSession: {
          id: "sess-no-modes",
          agentId: "agent-1",
          title: "No modes",
          status: "idle",
          messages: [],
        },
      },
    });

    render(
      <StoreProvider store={store}>
        <ActionProvider onAction={onAction}>
          <InputDock />
        </ActionProvider>
      </StoreProvider>,
      container,
    );

    expect(container.querySelector(".mode-picker-toggle")).toBeNull();
  });
});
