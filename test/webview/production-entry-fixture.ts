import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { act } from "preact/test-utils";
import { render } from "preact";
import { globalStore } from "../../src/webview/state/app-store";
import type { WebviewAction } from "../../src/shared/ipc-protocol";
import { snapshot } from "./preact-regression-fixtures";

type PromptAction = Extract<WebviewAction, { type: "SEND_PROMPT" }>;

export function productionEntryFixture() {
  let root: HTMLElement;
  const actions: WebviewAction[] = [];
  const capture = (event: Event) => {
    actions.push((event as CustomEvent<WebviewAction>).detail);
  };
  const host = async (type: string, payload: unknown) => {
    await act(() => {
      window.dispatchEvent(
        new MessageEvent("message", { data: { type, payload } }),
      );
    });
  };
  const input = () => root.querySelector("textarea") as HTMLTextAreaElement;
  const fill = async (value: string) => {
    await act(() => {
      input().value = value;
      input().dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const key = async (name: string, isComposing = false) => {
    await act(() => {
      input().dispatchEvent(
        new KeyboardEvent("keydown", {
          key: name,
          isComposing,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  };
  const click = async (selector: string) => {
    const button = root.querySelector(selector) as HTMLButtonElement;
    if (!button) throw new Error(`Missing button: ${selector}`);
    await act(() => button.click());
  };
  const submit = async (mode: "click" | "Enter" = "click") => {
    if (mode === "Enter") await key("Enter");
    else await click(".btn-toggle-action.send");
    const request = actions
      .filter((action): action is PromptAction => action.type === "SEND_PROMPT")
      .at(-1);
    if (!request) throw new Error("No SEND_PROMPT emitted");
    return request;
  };
  const result = (
    request: PromptAction,
    status: "accepted" | "completed" | "rejected",
    requestId = request.payload.requestId,
  ) =>
    host("PROMPT_RESULT", {
      requestId,
      sessionId: request.payload.sessionId,
      status,
    });

  beforeAll(async () => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.getElementById("app")!;
    window.addEventListener("vscode-post-message", capture);
    await act(async () => {
      // @ts-ignore -- Vitest must load the shipped TSX entry, not legacy main.ts.
      await import("../../src/webview/main.tsx");
    });
  });
  beforeEach(async () => {
    await host("STATE_SNAPSHOT", snapshot("reset"));
    await act(() => globalStore.dispatch({ type: "CLEAR_INPUT" }));
    await host("STATE_SNAPSHOT", { ...snapshot(), inputHistory: ["Original"] });
    actions.length = 0;
  });
  afterEach(async () => {
    for (const action of actions) {
      if (action.type === "SEND_PROMPT") await result(action, "completed");
    }
  });
  afterAll(() => {
    window.removeEventListener("vscode-post-message", capture);
    render(null, root);
  });

  return {
    actions,
    host,
    input,
    fill,
    key,
    click,
    submit,
    result,
    root: () => root,
  };
}
