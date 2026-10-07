// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  InputBoxComponent,
  type InputBoxOptions,
  type AttachmentItem,
} from "../../src/webview/components/input-box";

describe("T5: InputBoxComponent (Ergonomics, Dynamic Toggle, History, Multimodal)", () => {
  let container: HTMLElement;
  let onSendMock: ReturnType<typeof vi.fn>;
  let onCancelMock: ReturnType<typeof vi.fn>;
  let onModelChangeMock: ReturnType<typeof vi.fn>;
  let onThinkingLevelChangeMock: ReturnType<typeof vi.fn>;

  const defaultProps: InputBoxOptions = {
    container: null as any,
    sessionId: "session-123",
    history: ["first prompt", "second prompt", "third prompt"],
    models: ["claude-3-7-sonnet", "claude-3-5-sonnet", "gpt-4o"],
    currentModel: "claude-3-7-sonnet",
    thinkingLevel: "high",
    status: "idle",
    onSend: (data) => onSendMock(data),
    onCancel: (id) => onCancelMock(id),
    onModelChange: (model) => onModelChangeMock(model),
    onThinkingLevelChange: (lvl) => onThinkingLevelChangeMock(lvl),
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.innerHTML = "";
    document.body.appendChild(container);
    defaultProps.container = container;

    onSendMock = vi.fn();
    onCancelMock = vi.fn();
    onModelChangeMock = vi.fn();
    onThinkingLevelChangeMock = vi.fn();
  });

  describe("Dynamic Send / Stop Toggle Button", () => {
    it("should render Send button when status is idle", () => {
      new InputBoxComponent(defaultProps);
      const button = container.querySelector(
        ".btn-toggle-action",
      ) as HTMLButtonElement;

      expect(button).not.toBeNull();
      expect(button.classList.contains("send")).toBe(true);
      expect(button.classList.contains("stop")).toBe(false);
      expect(button.textContent).toContain("Send");
    });

    it("should call onSend with text and clear input on button click or Enter key", () => {
      const inputBox = new InputBoxComponent(defaultProps);
      const textarea = container.querySelector(
        "textarea.prompt-input",
      ) as HTMLTextAreaElement;
      const button = container.querySelector(
        ".btn-toggle-action",
      ) as HTMLButtonElement;

      textarea.value = "Hello world";
      button.click();

      expect(onSendMock).toHaveBeenCalledTimes(1);
      expect(onSendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-123",
          text: "Hello world",
          model: "claude-3-7-sonnet",
          thinkingLevel: "high",
        }),
      );
      inputBox.handlePromptResult({
        requestId:
          onSendMock.mock.calls[onSendMock.mock.calls.length - 1][0].requestId,
        status: "completed",
      });
      expect(textarea.value).toBe("");

      // Test Enter key sends prompt
      textarea.value = "Second message";
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );

      expect(onSendMock).toHaveBeenCalledTimes(2);
      expect(onSendMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          text: "Second message",
        }),
      );
      inputBox.handlePromptResult({
        requestId:
          onSendMock.mock.calls[onSendMock.mock.calls.length - 1][0].requestId,
        status: "completed",
      });
      expect(textarea.value).toBe("");
    });

    it("should NOT call onSend if Shift+Enter is pressed or input is empty", () => {
      new InputBoxComponent(defaultProps);
      const textarea = container.querySelector(
        "textarea.prompt-input",
      ) as HTMLTextAreaElement;
      const button = container.querySelector(
        ".btn-toggle-action",
      ) as HTMLButtonElement;

      // Empty input click
      textarea.value = "   ";
      button.click();
      expect(onSendMock).not.toHaveBeenCalled();
      expect(button.disabled).toBe(true);

      // Shift + Enter should not send
      textarea.value = "Multi\nline";
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: true,
          bubbles: true,
        }),
      );
      expect(onSendMock).not.toHaveBeenCalled();
    });

    it("should disable Send button when empty and enable when text or attachment added", () => {
      const inputBox = new InputBoxComponent(defaultProps);
      const textarea = container.querySelector(
        "textarea.prompt-input",
      ) as HTMLTextAreaElement;
      const button = container.querySelector(
        ".btn-toggle-action",
      ) as HTMLButtonElement;

      // Initially empty -> disabled
      expect(button.disabled).toBe(true);
      expect(button.classList.contains("disabled")).toBe(true);

      // Typing text -> enabled
      textarea.value = "Hello";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      expect(button.disabled).toBe(false);
      expect(button.classList.contains("disabled")).toBe(false);

      // Clear text -> disabled again
      textarea.value = "";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      expect(button.disabled).toBe(true);

      // Add attachment without text -> enabled
      inputBox.addAttachment({
        id: "att-1",
        type: "image",
        mimeType: "image/png",
        data: "abc",
        name: "test.png",
      });
      expect(button.disabled).toBe(false);

      // Remove attachment -> disabled
      inputBox.removeAttachment("att-1");
      expect(button.disabled).toBe(true);
    });

    it("should disable button and show Connecting... when process status is starting", () => {
      const inputBox = new InputBoxComponent(defaultProps);
      const textarea = container.querySelector(
        "textarea.prompt-input",
      ) as HTMLTextAreaElement;
      const button = container.querySelector(
        ".btn-toggle-action",
      ) as HTMLButtonElement;

      textarea.value = "Some message";
      expect(button.disabled).toBe(false);

      inputBox.setProcessStatus("starting");
      expect(button.disabled).toBe(true);
      expect(button.textContent).toContain("Connecting");

      inputBox.setProcessStatus("running");
      expect(button.disabled).toBe(false);
      expect(button.textContent).toContain("Send");
    });

    it("should switch to Stop button when status is streaming or waiting_approval and dispatch onCancel", () => {
      const inputBox = new InputBoxComponent(defaultProps);
      const button = container.querySelector(
        ".btn-toggle-action",
      ) as HTMLButtonElement;

      // Switch to streaming
      inputBox.setStatus("streaming");
      expect(button.classList.contains("stop")).toBe(true);
      expect(button.classList.contains("send")).toBe(false);
      expect(button.textContent).toContain("Stop");

      // Click button should trigger onCancel
      button.click();
      expect(onCancelMock).toHaveBeenCalledWith("session-123");
      expect(onSendMock).not.toHaveBeenCalled();

      // Switch to waiting_approval
      inputBox.setStatus("waiting_approval");
      expect(button.classList.contains("stop")).toBe(true);

      // Return to idle
      inputBox.setStatus("idle");
      expect(button.classList.contains("send")).toBe(true);
      expect(button.classList.contains("stop")).toBe(false);
    });
  });

  describe("Keyboard History Recall (↑ / ↓)", () => {
    it("should cycle backwards on ArrowUp and restore draft on ArrowDown", () => {
      new InputBoxComponent(defaultProps);
      const textarea = container.querySelector(
        "textarea.prompt-input",
      ) as HTMLTextAreaElement;

      textarea.value = "my WIP draft";

      // First ArrowUp recalls the most recent prompt ('third prompt')
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
      );
      expect(textarea.value).toBe("third prompt");

      // Second ArrowUp recalls 'second prompt'
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
      );
      expect(textarea.value).toBe("second prompt");

      // Third ArrowUp recalls 'first prompt'
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
      );
      expect(textarea.value).toBe("first prompt");

      // Fourth ArrowUp stays at earliest item
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
      );
      expect(textarea.value).toBe("first prompt");

      // ArrowDown moves forward towards newer items
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
      expect(textarea.value).toBe("second prompt");

      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
      expect(textarea.value).toBe("third prompt");

      // ArrowDown past the newest item restores the WIP draft
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
      expect(textarea.value).toBe("my WIP draft");
    });

    it("should update history dynamically when setHistory is called", () => {
      const inputBox = new InputBoxComponent({
        ...defaultProps,
        history: [],
      });
      const textarea = container.querySelector(
        "textarea.prompt-input",
      ) as HTMLTextAreaElement;

      inputBox.setHistory(["newly recorded prompt"]);
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
      );
      expect(textarea.value).toBe("newly recorded prompt");
    });
  });

  describe("Model & Thinking Level Selector", () => {
    it("should render model and thinking level dropdowns and trigger callbacks", () => {
      new InputBoxComponent(defaultProps);
      const modelSelect = container.querySelector(
        "select.model-select",
      ) as HTMLSelectElement;
      const thinkingSelect = container.querySelector(
        "select.thinking-select",
      ) as HTMLSelectElement;

      expect(modelSelect).not.toBeNull();
      expect(modelSelect.value).toBe("claude-3-7-sonnet");
      expect(thinkingSelect).not.toBeNull();
      expect(thinkingSelect.value).toBe("high");

      // Change model
      modelSelect.value = "gpt-4o";
      modelSelect.dispatchEvent(new Event("change", { bubbles: true }));
      expect(onModelChangeMock).toHaveBeenCalledWith("gpt-4o");

      // Change thinking level
      thinkingSelect.value = "medium";
      thinkingSelect.dispatchEvent(new Event("change", { bubbles: true }));
      expect(onThinkingLevelChangeMock).toHaveBeenCalledWith("medium");
    });

    it("should disable dropdowns and show placeholder when no agent models provided", () => {
      const box = new InputBoxComponent({
        container,
        onSend: vi.fn(),
        onCancel: vi.fn(),
      });

      const modelSelect = container.querySelector(
        "select.model-select",
      ) as HTMLSelectElement;
      const thinkingSelect = container.querySelector(
        "select.thinking-select",
      ) as HTMLSelectElement;

      expect(modelSelect.disabled).toBe(true);
      expect(modelSelect.textContent).toContain("No Model");
      expect(thinkingSelect.disabled).toBe(true);
      expect(thinkingSelect.textContent).toContain("--");
      expect(thinkingSelect.textContent).not.toContain("Thinking:");

      // Now set model dynamically when agent connects
      box.setModel("gemini-2.0-flash");
      expect(modelSelect.disabled).toBe(false);
      expect(modelSelect.value).toBe("gemini-2.0-flash");
      expect(thinkingSelect.disabled).toBe(false);
    });
  });

  describe("Multimodal Attachments", () => {
    it("should add image attachment and remove it when remove button is clicked", () => {
      const inputBox = new InputBoxComponent(defaultProps);
      const previewArea = container.querySelector(
        ".attachment-previews",
      ) as HTMLElement;

      const mockAttachment: AttachmentItem = {
        id: "att-1",
        type: "image",
        mimeType: "image/png",
        data: "base64imagedata==",
        name: "screenshot.png",
      };

      inputBox.addAttachment(mockAttachment);
      expect(previewArea.children.length).toBe(1);
      expect(previewArea.textContent).toContain("screenshot.png");

      // Remove attachment
      const removeBtn = previewArea.querySelector(
        ".remove-attachment",
      ) as HTMLElement;
      removeBtn.click();
      expect(previewArea.children.length).toBe(0);
    });

    it("should include attachments in onSend and clear them afterwards", () => {
      const inputBox = new InputBoxComponent(defaultProps);
      const textarea = container.querySelector(
        "textarea.prompt-input",
      ) as HTMLTextAreaElement;
      const button = container.querySelector(
        ".btn-toggle-action",
      ) as HTMLButtonElement;

      const mockAttachment: AttachmentItem = {
        id: "att-2",
        type: "image",
        mimeType: "image/jpeg",
        data: "data:image/jpeg;base64,...",
        name: "diagram.jpg",
      };

      inputBox.addAttachment(mockAttachment);
      textarea.value = "Analyze this diagram";
      button.click();

      expect(onSendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Analyze this diagram",
          attachments: [mockAttachment],
        }),
      );

      inputBox.handlePromptResult({
        requestId: onSendMock.mock.calls[0][0].requestId,
        status: "completed",
      });
      const previewArea = container.querySelector(
        ".attachment-previews",
      ) as HTMLElement;
      expect(previewArea.children.length).toBe(0);
    });
  });

  describe("Ergonomic Layout & SVG Iconography (M4)", () => {
    it("should position textarea on top and toolbar on bottom with attach on far left, models in toolbar, and send on far right", () => {
      new InputBoxComponent(defaultProps);

      const inputCard = container.querySelector(".input-card") as HTMLElement;
      expect(inputCard).not.toBeNull();

      const textareaWrapper = inputCard.querySelector(
        ".input-box-wrapper",
      ) as HTMLElement;
      const toolbar = inputCard.querySelector(".input-toolbar") as HTMLElement;
      expect(textareaWrapper).not.toBeNull();
      expect(toolbar).not.toBeNull();

      // Check vertical order: textarea wrapper is before toolbar
      expect(
        textareaWrapper.compareDocumentPosition(toolbar) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      // Check toolbar-left contains attach button and model/thinking selectors
      const toolbarLeft = toolbar.querySelector(".toolbar-left") as HTMLElement;
      const toolbarRight = toolbar.querySelector(
        ".toolbar-right",
      ) as HTMLElement;
      expect(toolbarLeft).not.toBeNull();
      expect(toolbarRight).not.toBeNull();

      const attachBtn = toolbarLeft.querySelector(
        ".btn-attach",
      ) as HTMLButtonElement;
      const modelSelect = toolbarLeft.querySelector(
        "select.model-select",
      ) as HTMLSelectElement;
      const thinkingSelect = toolbarLeft.querySelector(
        "select.thinking-select",
      ) as HTMLSelectElement;
      expect(attachBtn).not.toBeNull();
      expect(modelSelect).not.toBeNull();
      expect(thinkingSelect).not.toBeNull();

      // Attach button is the first child in toolbar-left (far left)
      expect(toolbarLeft.firstElementChild).toBe(attachBtn);

      // Check toolbar-right contains the Send/Stop button (far right)
      const toggleBtn = toolbarRight.querySelector(
        ".btn-toggle-action",
      ) as HTMLButtonElement;
      expect(toggleBtn).not.toBeNull();
    });

    it("should use professional SVG icons instead of emojis", () => {
      new InputBoxComponent(defaultProps);

      // No emojis in toggle button or attach button
      const attachBtn = container.querySelector(".btn-attach") as HTMLElement;
      const sendBtn = container.querySelector(
        ".btn-toggle-action",
      ) as HTMLElement;

      expect(attachBtn.querySelector("svg.svg-icon")).not.toBeNull();
      expect(attachBtn.textContent).not.toContain("📎");
      // Attach button is icon-only, no "Attach" text label
      expect(attachBtn.textContent?.trim()).toBe("");

      // Thinking dropdown options must directly display level without "Thinking: " prefix
      const thinkingSelect = container.querySelector(
        "select.thinking-select",
      ) as HTMLSelectElement;
      const optionTexts = Array.from(thinkingSelect.options).map((o) => o.text);
      expect(optionTexts).toContain("Off");
      expect(optionTexts).toContain("Medium");
      expect(optionTexts).toContain("High");
      expect(optionTexts).not.toContain("Thinking: Medium");

      expect(sendBtn.querySelector("svg.svg-icon")).not.toBeNull();
      expect(sendBtn.textContent).not.toContain("⏎");
      expect(sendBtn.textContent).not.toContain("⏹");
    });

    it("should adjust textarea height when multiline content is entered and reset on send", () => {
      const inputBox = new InputBoxComponent(defaultProps);
      const textarea = container.querySelector(
        "textarea.prompt-input",
      ) as HTMLTextAreaElement;

      // Mock scrollHeight
      Object.defineProperty(textarea, "scrollHeight", {
        configurable: true,
        get: () => (textarea.value.includes("\n") ? 96 : 36),
      });

      textarea.value = "Single line";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      expect(textarea.style.height).toBe("36px");

      textarea.value = "Line 1\nLine 2\nLine 3\nLine 4";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      expect(textarea.style.height).toBe("96px");

      // Submit resets height
      const button = container.querySelector(
        ".btn-toggle-action",
      ) as HTMLButtonElement;
      button.click();
      inputBox.handlePromptResult({
        requestId:
          onSendMock.mock.calls[onSendMock.mock.calls.length - 1][0].requestId,
        status: "completed",
      });
      expect(textarea.value).toBe("");
      expect(textarea.style.height).toBe("36px");
    });

    it("should disable attachment button when agent explicitly does not support image capabilities", () => {
      const inputBox = new InputBoxComponent({
        ...defaultProps,
        capabilities: {
          promptCapabilities: { image: false },
        },
      });

      const attachBtn = container.querySelector(
        ".btn-attach",
      ) as HTMLButtonElement;
      expect(attachBtn.disabled).toBe(true);
      expect(attachBtn.title).toContain(
        "Current agent does not support image attachments",
      );

      // Dynamically re-enable when capabilities update
      inputBox.setCapabilities({
        promptCapabilities: { image: true },
      });
      expect(attachBtn.disabled).toBe(false);
      expect(attachBtn.title).toBe("Attach Image or File");
    });
  });
});
