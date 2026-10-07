// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { ExecutionTimeline } from "../../src/webview/components/chat/execution-timeline";
import type { ToolCall } from "../../src/core/types/session";

const container = document.createElement("div");
const thinking =
  "Inspect the source.\nKeep the original line breaks.\nVerify the complete result.";
const call: ToolCall = {
  id: "c1",
  name: "readFile",
  input: {},
  output: "Done",
  status: "completed",
};
function mount(calls: ToolCall[] = [call], text = thinking, live = false) {
  act(() =>
    render(
      <ExecutionTimeline
        isStreaming={live}
        message={{ turns: [{ thinking: text, toolCalls: calls }] }}
      />,
      container,
    ),
  );
}
afterEach(() => act(() => render(null, container)));

describe("inline turn thinking", () => {
  it.each([0, 1, 2])(
    "replaces the turn ordinal with its %i call count",
    (count) => {
      mount(
        Array.from({ length: count }, (_, index) => ({
          ...call,
          id: `c${index}`,
        })),
      );
      const header = container.querySelector(".internal-turn-header")!;
      expect(header.textContent).toContain(
        `${count} ${count === 1 ? "call" : "calls"}`,
      );
      expect(header.textContent).not.toMatch(/Turn \d/);
      expect(header.querySelector(".turn-thinking-preview")?.textContent).toBe(
        thinking,
      );
    },
  );
  it("expands thinking in the same element without a duplicate thinking section", () => {
    mount();
    const header = container.querySelector<HTMLButtonElement>(
      ".internal-turn-header",
    )!;
    const preview = header.querySelector(".turn-thinking-preview")!;
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelectorAll(".turn-thinking-preview")).toHaveLength(
      1,
    );
    expect(
      container.querySelector(
        ".thinking-body, .thinking-label, .thinking-text",
      ),
    ).toBeNull();
    expect(container.querySelector(".turn-tools")).toBeNull();
    act(() => header.click());
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(header.querySelector(".turn-thinking-preview")).toBe(preview);
    expect(preview.textContent).toBe(thinking);
    const body = container.querySelector(".internal-turn-body")!;
    expect(
      Array.from(body.children).map((node) =>
        node.getAttribute("data-tool-id"),
      ),
    ).toEqual(["c1"]);
    act(() => header.click());
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(preview.textContent).toBe(thinking);
  });
  it("retains unavailable thinking and live default expansion without a separate body", () => {
    mount([], "", true);
    expect(
      container
        .querySelector(".internal-turn-header")
        ?.getAttribute("aria-expanded"),
    ).toBe("true");
    expect(container.querySelector(".turn-thinking-preview")?.textContent).toBe(
      "Thinking unavailable",
    );
    expect(container.querySelector(".thinking-body")).toBeNull();
  });
});
