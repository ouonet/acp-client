// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { AppStore } from "../../src/webview/state/app-store";
import { StoreProvider } from "../../src/webview/state/store-context";
import { ActionProvider } from "../../src/webview/state/action-context";
import { InputDock } from "../../src/webview/components/input/input-dock";
import { snapshot } from "./preact-regression-fixtures";

let root: HTMLElement, store: AppStore;
let send: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  root = document.createElement("div");
  document.body.appendChild(root);
  store = new AppStore();
  send = vi.fn();
  store.dispatch({ type: "APPLY_SNAPSHOT", payload: snapshot() });
  await act(() =>
    render(
      <StoreProvider store={store}>
        <ActionProvider onAction={send}>
          <InputDock />
        </ActionProvider>
      </StoreProvider>,
      root,
    ),
  );
});
afterEach(() => {
  render(null, root);
  root.remove();
});
async function draft(text: string) {
  await act(() => store.dispatch({ type: "SET_DRAFT", payload: text }));
}
async function submit() {
  await act(() =>
    (
      root.querySelector(".btn-toggle-action.send") as HTMLButtonElement
    ).click(),
  );
  return send.mock.calls.at(-1)![0];
}
async function result(request: any, status: string) {
  await act(() =>
    store.dispatch({
      type: "PROMPT_RESULT",
      payload: {
        requestId: request.payload.requestId,
        sessionId: "s1",
        status,
      },
    } as any),
  );
}
describe("Preact input reliability", () => {
  it("clears the visible input as soon as the host accepts the prompt", async () => {
    await draft("Original");
    const request = await submit();
    expect(request.payload.prompt).toBe("Original");
    await result(request, "accepted");
    expect(store.getState().input.draft).toBe("");
    expect((root.querySelector("textarea") as HTMLTextAreaElement).value).toBe(
      "",
    );
    expect(store.getState().input.isSubmitting).toBe(true);
    await result(request, "completed");
    expect(store.getState().input.isSubmitting).toBe(false);
  });
  it("preserves edits made before acceptance", async () => {
    await draft("Original");
    const request = await submit();
    await draft("New draft");
    await result(request, "accepted");
    expect((root.querySelector("textarea") as HTMLTextAreaElement).value).toBe(
      "New draft",
    );
  });
  it("preserves a new identical draft when the accepted request completes", async () => {
    await draft("Original");
    const request = await submit();
    await result(request, "accepted");
    await draft("Original");
    await result(request, "completed");
    expect((root.querySelector("textarea") as HTMLTextAreaElement).value).toBe(
      "Original",
    );
  });
  it("retains the draft when submission is rejected", async () => {
    await draft("Original");
    const request = await submit();
    await result(request, "rejected");
    expect((root.querySelector("textarea") as HTMLTextAreaElement).value).toBe(
      "Original",
    );
    expect(store.getState().input.isSubmitting).toBe(false);
  });
  it("clears submitted attachments on acceptance but keeps newly added attachments on completion", async () => {
    await draft("Original");
    const attachment = {
      id: "image-1",
      type: "image" as const,
      name: "image.png",
      data: "aW1hZ2U=",
      mimeType: "image/png",
    };
    await act(() =>
      store.dispatch({ type: "ADD_ATTACHMENT", payload: attachment }),
    );
    const request = await submit();
    expect(request.payload.prompt).toEqual([
      { type: "text", text: "Original" },
      { type: "image", data: attachment.data, mimeType: attachment.mimeType },
    ]);
    await result(request, "accepted");
    expect(store.getState().input.attachments).toEqual([]);
    expect(root.querySelector(".attachment-chip")).toBeNull();
    await act(() =>
      store.dispatch({
        type: "ADD_ATTACHMENT",
        payload: { ...attachment, id: "image-2" },
      }),
    );
    await result(request, "completed");
    expect(store.getState().input.attachments[0].id).toBe("image-2");
  });
  it("preserves newer edits when an older request completes", async () => {
    await draft("Original");
    const request = await submit();
    await draft("New draft");
    await result(request, "completed");
    expect(store.getState().input.draft).toBe("New draft");
  });
  it("ignores a stale request outcome", async () => {
    await draft("Original");
    await submit();
    await result({ payload: { requestId: "unrelated" } }, "completed");
    expect(store.getState().input.draft).toBe("Original");
    expect(store.getState().input.isSubmitting).toBe(true);
  });
  it("blocks sending while waiting for permission", async () => {
    await draft("Blocked");
    await act(() =>
      store.dispatch({
        type: "SESSION_STATUS_CHANGE",
        payload: { status: "waiting_approval" },
      }),
    );
    const button = root.querySelector(
      ".btn-toggle-action.send",
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    button.click();
    expect(send).not.toHaveBeenCalled();
  });
  it("sends model changes to the host configuration API", async () => {
    await act(() => (root.querySelector(".model-picker-toggle") as HTMLButtonElement).click());
    await act(() => (root.querySelector('[data-model="model-b"]') as HTMLButtonElement).click());
    expect(send).toHaveBeenCalledWith({
      type: "SET_CONFIG_OPTION",
      payload: expect.objectContaining({ sessionId: "s1", configId: "model", value: "model-b", requestId: expect.any(String) }),
    });
    expect(store.getState().input.selectedModel).toBe("model-a");
  });
  it("provides image attachment input when the agent supports images", async () => {
    const input = root.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.accept).toContain("image");
    const file = new File(["image"], "image.png", { type: "image/png" });
    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(store.getState().input.attachments[0].mimeType).toBe("image/png");
  });
  function pasteClipboard(
    files: File[],
    items: Array<{
      kind: string;
      type: string;
      getAsFile: () => File | null;
    }> = [],
  ) {
    const textarea = root.querySelector("textarea") as HTMLTextAreaElement;
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { files, items } });
    return { textarea, event };
  }
  it("adds each pasted image and keeps text paste unchanged", async () => {
    const image = new File(["image"], "shot.png", { type: "image/png" });
    const pasted = pasteClipboard([image]);
    await act(async () => {
      pasted.textarea.dispatchEvent(pasted.event);
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(pasted.event.defaultPrevented).toBe(true);
    expect(store.getState().input.attachments.map((item) => item.name)).toEqual(
      ["shot.png"],
    );
    expect(
      root.querySelector(".attachment-chip img, .chip-thumbnail"),
    ).toBeNull();
    expect(root.querySelector(".chip-open")?.textContent).toBe("shot.png");
    const text = pasteClipboard(
      [],
      [{ kind: "string", type: "text/plain", getAsFile: () => null }],
    );
    text.textarea.dispatchEvent(text.event);
    expect(text.event.defaultPrevented).toBe(false);
    expect(store.getState().input.attachments).toHaveLength(1);
  });
  it("lists an attachment by name, enlarges it on click, and removes it", async () => {
    const attachment = {
      id: "image-1",
      type: "image" as const,
      name: "image.png",
      data: "aW1hZ2U=",
      mimeType: "image/png",
    };
    await act(() =>
      store.dispatch({ type: "ADD_ATTACHMENT", payload: attachment }),
    );
    expect(
      root.querySelector(".attachment-chip img, .chip-thumbnail"),
    ).toBeNull();
    await act(() =>
      (root.querySelector(".chip-open") as HTMLButtonElement).click(),
    );
    const preview = root.querySelector(
      ".attachment-lightbox img",
    ) as HTMLImageElement;
    expect(preview.getAttribute("src")).toBe("data:image/png;base64,aW1hZ2U=");
    await act(() =>
      (root.querySelector(".attachment-lightbox") as HTMLElement).click(),
    );
    expect(root.querySelector(".attachment-lightbox")).toBeNull();
    await act(() =>
      (root.querySelector(".chip-remove") as HTMLButtonElement).click(),
    );
    expect(root.querySelector(".attachment-chip")).toBeNull();
    expect(store.getState().input.attachments).toEqual([]);
  });
  it("does not hijack arrow navigation inside multiline drafts", async () => {
    await draft("line one\nline two");
    const textarea = root.querySelector("textarea") as HTMLTextAreaElement;
    textarea.setSelectionRange(4, 4);
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(store.getState().input.draft).toBe("line one\nline two");
  });
});
