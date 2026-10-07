// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { InputBoxComponent } from "../../src/webview/components/input-box";

describe("T4: Slash Commands Menu in InputBox", () => {
  let container: HTMLElement;
  let onSendMock: ReturnType<typeof vi.fn>;
  let onClearMock: ReturnType<typeof vi.fn>;
  let onForkMock: ReturnType<typeof vi.fn>;
  let onConfigMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.innerHTML = "";
    document.body.appendChild(container);
    onSendMock = vi.fn();
    onClearMock = vi.fn();
    onForkMock = vi.fn();
    onConfigMock = vi.fn();
  });

  it("should show default client slash commands popup when user types / at the beginning", () => {
    new InputBoxComponent({
      container,
      onSend: onSendMock,
      onCancel: vi.fn(),
      onClear: onClearMock,
      onFork: onForkMock,
      onConfig: onConfigMock,
    });

    const textarea = container.querySelector(
      "textarea.prompt-input",
    ) as HTMLTextAreaElement;
    textarea.value = "/";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    const popup = container.querySelector(
      ".slash-commands-popup",
    ) as HTMLElement;
    expect(popup).not.toBeNull();
    expect(popup.style.display).not.toBe("none");

    const items = popup.querySelectorAll(".slash-item");
    expect(items.length).toBe(4);
    expect(popup.textContent).toContain("/clear");
    expect(popup.textContent).toContain("/fork");
    expect(popup.textContent).toContain("/config");
    expect(popup.textContent).toContain("/help");
    expect(popup.textContent).not.toContain("/compact");
  });

  it("should NOT show /compact when agent lacks compaction capability even if onCompact is provided", () => {
    const onCompactMock = vi.fn();
    new InputBoxComponent({
      container,
      onSend: onSendMock,
      onCancel: vi.fn(),
      onCompact: onCompactMock,
    });
    const textarea = container.querySelector(
      "textarea.prompt-input",
    ) as HTMLTextAreaElement;
    textarea.value = "/";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    const popup = container.querySelector(
      ".slash-commands-popup",
    ) as HTMLElement;
    expect(popup.textContent).not.toContain("/compact");
  });

  it("should show /compact and trigger onCompact when agent advertises compaction capability or compact command", () => {
    // 1. With agent capability sessionCapabilities.compaction
    const onCompactMock = vi.fn();
    new InputBoxComponent({
      container,
      onSend: onSendMock,
      onCancel: vi.fn(),
      onCompact: onCompactMock,
      capabilities: { sessionCapabilities: { compaction: {} } },
    });
    const textarea = container.querySelector(
      "textarea.prompt-input",
    ) as HTMLTextAreaElement;
    textarea.value = "/";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    const popup = container.querySelector(
      ".slash-commands-popup",
    ) as HTMLElement;
    expect(popup.textContent).toContain("/compact");

    // Click /compact executes onCompact
    const compactItem = Array.from(popup.querySelectorAll(".slash-item")).find(
      (el) => el.textContent?.includes("/compact"),
    ) as HTMLElement;
    expect(compactItem).toBeDefined();
    compactItem.click();
    expect(onCompactMock).toHaveBeenCalledTimes(1);

    // 2. With agent command "compact"
    document.body.innerHTML = "";
    const container2 = document.createElement("div");
    document.body.appendChild(container2);
    const box2 = new InputBoxComponent({
      container: container2,
      onSend: onSendMock,
      onCancel: vi.fn(),
    });
    box2.setAvailableCommands([
      { name: "compact", description: "Agent compact command" },
    ]);
    const textarea2 = container2.querySelector(
      "textarea.prompt-input",
    ) as HTMLTextAreaElement;
    textarea2.value = "/compact";
    textarea2.dispatchEvent(new Event("input", { bubbles: true }));
    const popup2 = container2.querySelector(
      ".slash-commands-popup",
    ) as HTMLElement;
    expect(popup2.textContent).toContain("/compact");
  });

  it("should call onUnsupportedCommand and NOT dispatch prompt when user submits /compact without agent capability", () => {
    const onUnsupportedMock = vi.fn();
    new InputBoxComponent({
      container,
      onSend: onSendMock,
      onCancel: vi.fn(),
      onUnsupportedCommand: onUnsupportedMock,
    });

    const textarea = container.querySelector(
      "textarea.prompt-input",
    ) as HTMLTextAreaElement;
    textarea.value = "/compact";
    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(onUnsupportedMock).toHaveBeenCalledWith("compact");
    expect(onSendMock).not.toHaveBeenCalled();
    expect(textarea.value).toBe("");
  });

  it("should show Native hint for fork when agent supports sessionCapabilities.fork, else Replay", () => {
    const box1 = new InputBoxComponent({
      container,
      onSend: onSendMock,
      onCancel: vi.fn(),
      capabilities: { sessionCapabilities: { fork: {} } },
    });
    const textarea = container.querySelector(
      "textarea.prompt-input",
    ) as HTMLTextAreaElement;
    textarea.value = "/fork";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    const popup = container.querySelector(
      ".slash-commands-popup",
    ) as HTMLElement;
    expect(popup.textContent).toContain("(Native)");

    // Replay when fork capability is missing
    box1.setCapabilities({});
    textarea.value = "/fork";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    expect(popup.textContent).toContain("(Replay)");
  });

  it("should dynamically include agent available commands and workspace skills", () => {
    const inputBox = new InputBoxComponent({
      container,
      onSend: onSendMock,
      onCancel: vi.fn(),
    });

    inputBox.setAvailableCommands([
      {
        name: "model",
        description: "Switch current model",
        input: { hint: "<model_id>" },
      },
    ]);
    inputBox.setSkills([
      {
        id: "custom-skill",
        name: "custom-skill",
        description: "Custom workspace skill",
      },
    ]);

    const textarea = container.querySelector(
      "textarea.prompt-input",
    ) as HTMLTextAreaElement;
    textarea.value = "/";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    const popup = container.querySelector(
      ".slash-commands-popup",
    ) as HTMLElement;
    expect(popup.textContent).toContain("/model");
    expect(popup.textContent).toContain("<model_id>");
    expect(popup.textContent).toContain("Agent");
    expect(popup.textContent).toContain("/custom-skill");
    expect(popup.textContent).toContain("Skill");
  });

  it("should filter slash commands by typed query", () => {
    const inputBox = new InputBoxComponent({
      container,
      onSend: onSendMock,
      onCancel: vi.fn(),
    });
    inputBox.setAvailableCommands([
      { name: "test-cmd", description: "Test command" },
    ]);

    const textarea = container.querySelector(
      "textarea.prompt-input",
    ) as HTMLTextAreaElement;
    textarea.value = "/test";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    const popup = container.querySelector(
      ".slash-commands-popup",
    ) as HTMLElement;
    const items = popup.querySelectorAll(".slash-item");
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain("/test-cmd");
  });

  it("should select command and fill textarea on item click or Enter key", () => {
    const inputBox = new InputBoxComponent({
      container,
      onSend: onSendMock,
      onCancel: vi.fn(),
    });
    inputBox.setAvailableCommands([
      { name: "review", description: "Review code" },
    ]);

    const textarea = container.querySelector(
      "textarea.prompt-input",
    ) as HTMLTextAreaElement;
    textarea.value = "/rev";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    const popup = container.querySelector(
      ".slash-commands-popup",
    ) as HTMLElement;
    const item = popup.querySelector(".slash-item") as HTMLElement;
    item.click();

    expect(textarea.value).toBe("/review ");
    expect(popup.style.display).toBe("none");
  });

  it("should trigger onClear when /clear command is executed", () => {
    new InputBoxComponent({
      container,
      onSend: onSendMock,
      onCancel: vi.fn(),
      onClear: onClearMock,
    });

    const textarea = container.querySelector(
      "textarea.prompt-input",
    ) as HTMLTextAreaElement;
    textarea.value = "/clear";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    const popup = container.querySelector(
      ".slash-commands-popup",
    ) as HTMLElement;
    const clearItem = Array.from(popup.querySelectorAll(".slash-item")).find(
      (el) => el.textContent?.includes("/clear"),
    ) as HTMLElement;

    clearItem.click();
    expect(onClearMock).toHaveBeenCalled();
    expect(textarea.value).toBe("/clear");
  });

  it("should trigger onFork when /fork command is executed", () => {
    new InputBoxComponent({
      container,
      onSend: onSendMock,
      onCancel: vi.fn(),
      onFork: onForkMock,
    });

    const textarea = container.querySelector(
      "textarea.prompt-input",
    ) as HTMLTextAreaElement;
    textarea.value = "/fork";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    const popup = container.querySelector(
      ".slash-commands-popup",
    ) as HTMLElement;
    const forkItem = Array.from(popup.querySelectorAll(".slash-item")).find(
      (el) => el.textContent?.includes("/fork"),
    ) as HTMLElement;

    forkItem.click();
    expect(onForkMock).toHaveBeenCalled();
  });

  it("should show slash popup when typing full-width slash ／ or with leading whitespace", () => {
    new InputBoxComponent({
      container,
      onSend: onSendMock,
      onCancel: vi.fn(),
    });

    const textarea = container.querySelector(
      "textarea.prompt-input",
    ) as HTMLTextAreaElement;
    const popup = container.querySelector(
      ".slash-commands-popup",
    ) as HTMLElement;

    // Full-width slash
    textarea.value = "／";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    expect(popup.style.display).not.toBe("none");

    // Full-width slash with command name
    textarea.value = "／clear";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    expect(popup.style.display).not.toBe("none");
    expect(popup.textContent).toContain("/clear");

    // Leading space
    textarea.value = "  /";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    expect(popup.style.display).not.toBe("none");
  });

  it("should trigger slash popup on keyup event and programmatic value set", () => {
    new InputBoxComponent({
      container,
      onSend: onSendMock,
      onCancel: vi.fn(),
    });

    const textarea = container.querySelector(
      "textarea.prompt-input",
    ) as HTMLTextAreaElement;
    const popup = container.querySelector(
      ".slash-commands-popup",
    ) as HTMLElement;

    // Programmatic value assignment triggers popup
    textarea.value = "/";
    expect(popup.style.display).not.toBe("none");

    // Keyup event
    textarea.value = "/he";
    textarea.dispatchEvent(new KeyboardEvent("keyup", { key: "e", bubbles: true }));
    expect(popup.style.display).not.toBe("none");
    expect(popup.textContent).toContain("/help");
  });

  it("should place slash-commands-popup directly inside input-card without being clipped", () => {
    new InputBoxComponent({
      container,
      onSend: onSendMock,
      onCancel: vi.fn(),
    });

    const inputCard = container.querySelector(".input-card") as HTMLElement;
    const popup = container.querySelector(".slash-commands-popup") as HTMLElement;

    expect(inputCard).not.toBeNull();
    expect(popup).not.toBeNull();
    // Popup should be a direct child of input-card
    expect(popup.parentElement).toBe(inputCard);
  });
});
