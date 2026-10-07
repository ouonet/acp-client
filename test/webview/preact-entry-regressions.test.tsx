// @vitest-environment happy-dom
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { act } from "preact/test-utils";
import { render } from "preact";
import { globalStore } from "../../src/webview/state/app-store";
import { snapshot } from "./preact-regression-fixtures";

let root: HTMLElement;
async function host(type: string, payload: unknown) {
  await act(() => { window.dispatchEvent(new MessageEvent("message", { data: { type, payload } })); });
}
async function event(type: string, payload: unknown, sessionId = "s1") {
  await host("SESSION_EVENT", { sessionId, event: { type, payload, sessionId } });
}
beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById("app")!;
  // @ts-ignore
  await act(async () => { await import("../../src/webview/main.tsx"); });
});
beforeEach(async () => {
  await host("STATE_SNAPSHOT", snapshot("reset"));
  await act(() => globalStore.dispatch({ type: "CLEAR_INPUT" }));
  await host("STATE_SNAPSHOT", snapshot());
});
afterAll(() => render(null, root));

describe("production Preact IPC regressions", () => {
  it("preserves streamed text through a stale same-session snapshot without duplicating it", async () => {
    const stale = snapshot("s1", "streaming", [{ role: "user", content: "Question" }, { role: "assistant", content: "", startedAt: 10 }]);
    await host("STATE_SNAPSHOT", stale);
    await event("chunk", { content: "Live answer", messageStartedAt: 10 });
    expect(root.textContent).toContain("Live answer");
    await host("STATE_SNAPSHOT", stale);
    expect(root.textContent?.match(/Live answer/g)).toHaveLength(1);
    await event("status_change", { status: "idle" });
    expect(root.textContent).toContain("Live answer");
  });

  it("discards another session's chunks and permissions", async () => {
    await event("chunk", { content: "foreign answer" }, "other-session");
    await event("permission_request", { requestId: "foreign", toolTitle: "Foreign tool", options: [] }, "other-session");
    expect(root.textContent).not.toContain("foreign answer");
    expect(root.textContent).not.toContain("Foreign tool");
  });

  it("renders tools and updates their output through actual window messages", async () => {
    await host("STATE_SNAPSHOT", snapshot("s1", "streaming"));
    await event("tool_call", { id: "tool-1", name: "Read file", input: { path: "README.md" }, status: "running", turnIndex: 0 });
    expect(root.textContent).toContain("Read file");
    await event("tool_result", { id: "tool-1", output: "File contents", status: "completed", turnIndex: 0 });
    const button = root.querySelector(".tool-call-header") as HTMLButtonElement;
    await act(() => button.click());
    expect(root.textContent).toContain("File contents");
  });

  it("renders agent permission options and clears the gate on completion", async () => {
    await event("permission_request", { requestId: "permission-1", toolTitle: "Run shell", options: [{ optionId: "permit", name: "Permit this", kind: "allow_once" }, { optionId: "reject", name: "Reject this", kind: "reject_once" }] });
    expect(root.textContent).toContain("Run shell");
    expect(root.textContent).toContain("Permit this");
    await event("status_change", { status: "idle" });
    expect(root.querySelector(".permission-gate")).toBeNull();
  });

  it("updates command menus and input history without requiring a snapshot", async () => {
    await event("available_commands_update", { availableCommands: [{ name: "new-command", description: "New" }] });
    await host("INPUT_HISTORY_UPDATE", { history: ["new history"] });
    expect(globalStore.getState().input.availableCommands[0].name).toBe("new-command");
    expect(globalStore.getState().input.history).toEqual(["new history"]);
  });

  it("retains a failed submission draft and accepts only its matching outcome", async () => {
    await act(() => globalStore.dispatch({ type: "SET_DRAFT", payload: "Keep my draft" }));
    let action: any;
    const capture = (e: Event) => { action = (e as CustomEvent).detail; };
    window.addEventListener("vscode-post-message", capture);
    await act(() => (root.querySelector(".btn-toggle-action.send") as HTMLButtonElement).click());
    window.removeEventListener("vscode-post-message", capture);
    expect(action.payload.requestId).toEqual(expect.any(String));
    expect(globalStore.getState().input.draft).toBe("Keep my draft");
    await host("PROMPT_RESULT", { requestId: action.payload.requestId, sessionId: "s1", status: "rejected", error: "Agent unavailable" });
    expect(globalStore.getState().input.draft).toBe("Keep my draft");
    expect(root.textContent).toContain("Agent unavailable");
  });
});
