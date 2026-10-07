// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { PromptTextarea } from "../../src/webview/components/input/prompt-textarea";

let root: HTMLDivElement;
const onChange = vi.fn();
const onKeyDown = vi.fn();
const editCommand = vi.fn(() => true);
const originalCommand = Object.getOwnPropertyDescriptor(document, "execCommand");

beforeEach(() => {
  vi.clearAllMocks();
  root = document.createElement("div");
  document.body.append(root);
  Object.defineProperty(document, "execCommand", { configurable: true, value: editCommand });
});
afterEach(() => {
  act(() => render(null, root));
  root.remove();
  if (originalCommand) Object.defineProperty(document, "execCommand", originalCommand);
  else Reflect.deleteProperty(document, "execCommand");
});

function mount(value = "draft") {
  act(() => render(<PromptTextarea value={value} onChange={onChange} onKeyDown={onKeyDown} />, root));
  return root.querySelector("textarea")!;
}
function key(input: HTMLTextAreaElement, options: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...options });
  act(() => { input.dispatchEvent(event); });
  return event;
}

describe("Prompt textarea editing", () => {
  it("allows vertical scrolling when a long draft reaches the height cap", () => {
    const input = mount();
    Object.defineProperty(input, "scrollHeight", { configurable: true, value: 1200 });
    mount("long line\n".repeat(80));
    expect(input.style.height).toBe("240px");
    expect(input.style.overflowY).toBe("auto");
  });

  it.each([
    { key: "z", ctrlKey: true, command: "undo" },
    { key: "z", metaKey: true, command: "undo" },
    { key: "Z", ctrlKey: true, shiftKey: true, command: "redo" },
    { key: "Z", metaKey: true, shiftKey: true, command: "redo" },
    { key: "y", ctrlKey: true, command: "redo" },
  ])("routes $command from $key to the browser editor", ({ command, ...options }) => {
    const event = key(mount(), options);
    expect(editCommand).toHaveBeenCalledExactlyOnceWith(command);
    expect(event.defaultPrevented).toBe(true);
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it.each([
    { key: "z" },
    { key: "z", metaKey: true, altKey: true },
    { key: "z", metaKey: true, isComposing: true },
    { key: "z", ctrlKey: true, keyCode: 229 },
    { key: "Enter" },
  ])("preserves ordinary and composing key handling: %j", (options) => {
    const event = key(mount(), options);
    expect(editCommand).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(onKeyDown).toHaveBeenCalledOnce();
  });

  it("propagates native history input events to the draft", () => {
    const input = mount();
    input.value = "restored draft";
    act(() => { input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "historyUndo" })); });
    expect(onChange).toHaveBeenCalledWith("restored draft");
  });
});
