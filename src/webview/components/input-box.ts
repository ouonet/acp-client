/**
 * InputBoxComponent: Ergonomic input dock with dynamic Send/Stop toggle,
 * keyboard ↑/↓ history recall, model/thinking selectors, and multimodal attachments.
 */

import type { ProcessStatus } from "../../core/ports";
import type {
  SessionStatus,
  ThinkingLevel,
  AvailableCommand,
} from "../../core/types/session";
import { ICONS } from "./icons";

export interface AttachmentItem {
  id: string;
  type: "image";
  mimeType: string;
  data: string; // Base64 data string or URI
  name?: string;
  size?: number;
}

export interface SlashCommandItem {
  name: string;
  description: string;
  kind?: "client" | "agent" | "skill";
  inputHint?: string;
}

const DEFAULT_CLIENT_COMMANDS: SlashCommandItem[] = [
  {
    name: "clear",
    description: "Start a new session with empty context",
    kind: "client",
  },
  {
    name: "fork",
    description: "Fork current conversation into a new branch",
    kind: "client",
  },
  {
    name: "config",
    description: "Open Agent configuration drawer",
    kind: "client",
  },
  {
    name: "help",
    description: "Show available commands and skills",
    kind: "client",
  },
];

export interface InputBoxOptions {
  container: HTMLElement;
  sessionId?: string;
  history?: string[];
  models?: string[];
  currentModel?: string;
  thinkingLevel?: ThinkingLevel;
  status?: SessionStatus;
  capabilities?: any;
  onSend: (data: {
    requestId: string;
    sessionId: string;
    text: string;
    attachments?: AttachmentItem[];
    model?: string;
    thinkingLevel?: ThinkingLevel;
  }) => void;
  onCancel: (sessionId: string) => void;
  onModelChange?: (model: string) => void;
  onThinkingLevelChange?: (level: ThinkingLevel) => void;
  onClear?: () => void;
  onFork?: () => void;
  onConfig?: () => void;
  onCompact?: () => void;
  onUnsupportedCommand?: (command: string) => void;
  onHelp?: (commands: SlashCommandItem[]) => void;
  skills?: Array<{ id?: string; name: string; description: string }>;
  availableCommands?: AvailableCommand[];
}

export class InputBoxComponent {
  private container: HTMLElement;
  private options: InputBoxOptions;
  private sessionId: string;
  private history: string[];
  private historyIndex = -1;
  private tempDraft = "";
  private models: string[];
  private currentModel?: string;
  private thinkingLevel?: ThinkingLevel;
  private thinkingLevels: string[] = ["off", "low", "medium", "high"];
  private status: SessionStatus;
  private processStatus: ProcessStatus = "stopped";
  private attachments: AttachmentItem[] = [];
  private draftRevision = 0;
  private pendingSubmission?: { requestId: string; revision: number };
  private capabilities?: any;

  // Slash commands
  private clientCommands: SlashCommandItem[] = [...DEFAULT_CLIENT_COMMANDS];
  private agentCommands: SlashCommandItem[] = [];
  private skillCommands: SlashCommandItem[] = [];
  private filteredSlashCommands: SlashCommandItem[] = [];
  private activeSlashIndex = 0;

  // DOM Elements
  private previewArea!: HTMLElement;
  private modelSelect!: HTMLSelectElement;
  private thinkingSelect!: HTMLSelectElement;
  private textarea!: HTMLTextAreaElement;
  private toggleButton!: HTMLButtonElement;
  private fileInput!: HTMLInputElement;
  private slashPopup!: HTMLElement;

  constructor(options: InputBoxOptions) {
    this.container = options.container;
    this.options = options;
    this.sessionId = options.sessionId || "";
    this.history = options.history ? [...options.history] : [];
    this.models =
      options.models && options.models.length > 0 ? [...options.models] : [];
    this.currentModel = options.currentModel;
    this.thinkingLevel = options.thinkingLevel;
    this.capabilities = options.capabilities;
    if (options.skills) {
      this.setSkills(options.skills);
    }
    if (options.availableCommands) {
      this.setAvailableCommands(options.availableCommands);
    }
    this.status = options.status || "idle";

    this.render();
    this.bindEvents();
    this.updateAttachmentButtonState();
  }

  private render(): void {
    const hasModels = this.models.length > 0 || !!this.currentModel;
    const modelOptionsHtml = hasModels
      ? (this.models.length > 0 ? this.models : [this.currentModel!])
          .map(
            (m) =>
              `<option value="${m}" ${m === this.currentModel ? "selected" : ""}>${m}</option>`,
          )
          .join("")
      : `<option value="" disabled selected>-- No Model --</option>`;

    const currentLvl = this.thinkingLevel || "off";
    const thinkingOptionsHtml = hasModels
      ? `
          <option value="off" ${currentLvl === "off" ? "selected" : ""}>Off</option>
          <option value="low" ${currentLvl === "low" ? "selected" : ""}>Low</option>
          <option value="medium" ${currentLvl === "medium" ? "selected" : ""}>Medium</option>
          <option value="high" ${currentLvl === "high" ? "selected" : ""}>High</option>
        `
      : `<option value="" disabled selected>--</option>`;

    this.container.innerHTML = `
      <div class="attachment-previews"></div>
      <div class="input-card">
        <div class="slash-commands-popup" style="display: none;"></div>
        <div class="input-box-wrapper">
          <textarea
            class="prompt-input"
            placeholder="Ask a question or describe a task... (↑/↓ for history, / for skills, Shift+Enter for newline)"
            rows="1"
          ></textarea>
        </div>
        <div class="input-toolbar">
          <div class="toolbar-left">
            <button class="btn-attach" type="button" title="Attach Image or File">
              ${ICONS.attach}
            </button>
            <input type="file" class="file-attach-input" accept="image/*" style="display: none;" />
            <div class="select-wrapper model-select-wrapper">
              <select class="model-select" ${hasModels ? "" : "disabled"} title="${hasModels ? "Select AI Model" : "No agent connected"}">
                ${modelOptionsHtml}
              </select>
              <span class="select-chevron">${ICONS.chevronDown}</span>
            </div>
            <div class="select-wrapper thinking-select-wrapper">
              <span class="select-icon">${ICONS.brain}</span>
              <select class="thinking-select" ${hasModels ? "" : "disabled"} title="${hasModels ? "Thinking Level / Reasoning Effort" : "No agent connected"}">
                ${thinkingOptionsHtml}
              </select>
              <span class="select-chevron">${ICONS.chevronDown}</span>
            </div>
          </div>
          <div class="toolbar-right">
            <button
              class="btn-toggle-action ${this.isBusy() ? "stop" : "send"}"
              type="button"
              title="${this.isBusy() ? "Stop agent generation" : "Send prompt"}"
            >
              ${this.isBusy() ? `${ICONS.stop} <span>Stop</span>` : `${ICONS.send} <span>Send</span>`}
            </button>
          </div>
        </div>
      </div>
    `;

    this.previewArea = this.container.querySelector(
      ".attachment-previews",
    ) as HTMLElement;
    this.modelSelect = this.container.querySelector(
      "select.model-select",
    ) as HTMLSelectElement;
    this.thinkingSelect = this.container.querySelector(
      "select.thinking-select",
    ) as HTMLSelectElement;
    this.textarea = this.container.querySelector(
      "textarea.prompt-input",
    ) as HTMLTextAreaElement;
    this.toggleButton = this.container.querySelector(
      ".btn-toggle-action",
    ) as HTMLButtonElement;
    this.fileInput = this.container.querySelector(
      ".file-attach-input",
    ) as HTMLInputElement;
    this.slashPopup = this.container.querySelector(
      ".slash-commands-popup",
    ) as HTMLElement;

    if (this.currentModel) {
      this.modelSelect.value = this.currentModel;
    }
    if (this.thinkingLevel) {
      this.thinkingSelect.value = this.thinkingLevel;
    }

    // Intercept programmatic value assignments so button state stays in sync
    const originalValueDescriptor = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    );
    if (originalValueDescriptor) {
      Object.defineProperty(this.textarea, "value", {
        get: () => originalValueDescriptor.get?.call(this.textarea) ?? "",
        set: (val: string) => {
          originalValueDescriptor.set?.call(this.textarea, val);
          this.draftRevision++;
          this.checkSlashCommands();
          this.updateButtonState();
        },
        configurable: true,
      });
    }

    this.updateButtonState();
  }

  private isBusy(): boolean {
    return this.status === "streaming" || this.status === "waiting_approval";
  }

  private bindEvents(): void {
    // Model Select
    this.modelSelect.addEventListener("change", () => {
      this.currentModel = this.modelSelect.value;
      this.options.onModelChange?.(this.currentModel);
    });

    // Thinking Select
    this.thinkingSelect.addEventListener("change", () => {
      this.thinkingLevel = this.thinkingSelect.value as ThinkingLevel;
      this.options.onThinkingLevelChange?.(this.thinkingLevel);
    });

    // Attach Button
    const attachBtn = this.container.querySelector(
      ".btn-attach",
    ) as HTMLButtonElement;
    attachBtn?.addEventListener("click", () => {
      this.fileInput.click();
    });

    // File Input change
    this.fileInput.addEventListener("change", () => {
      const files = this.fileInput.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          this.readFile(files[i]);
        }
      }
      this.fileInput.value = "";
    });

    // Paste handler on textarea
    this.textarea.addEventListener("paste", (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            this.readFile(file);
          }
        }
      }
    });

    // Drag & Drop
    this.container.addEventListener("dragover", (e: DragEvent) => {
      e.preventDefault();
    });

    this.container.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.type.startsWith("image/")) {
            this.readFile(file);
          }
        }
      }
    });

    // Auto-grow textarea & slash commands detection & button state
    this.textarea.addEventListener("input", () => {
      this.draftRevision++;
      this.adjustHeight();
      this.checkSlashCommands();
      this.updateButtonState();
    });

    this.textarea.addEventListener("keyup", (e: KeyboardEvent) => {
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "Enter" ||
        e.key === "Escape"
      ) {
        return;
      }
      this.checkSlashCommands();
    });

    this.textarea.addEventListener("focus", () => {
      this.checkSlashCommands();
    });

    // Click outside to dismiss slash popup
    document.addEventListener("click", (e: MouseEvent) => {
      if (this.slashPopup && this.slashPopup.style.display !== "none") {
        const target = e.target as Node;
        if (!this.container.contains(target)) {
          this.hideSlashPopup();
        }
      }
    });

    // Keydown handler
    this.textarea.addEventListener("keydown", (e: KeyboardEvent) => {
      // Handle slash popup navigation
      if (
        this.slashPopup &&
        this.slashPopup.style.display !== "none" &&
        this.filteredSlashCommands.length > 0
      ) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          this.activeSlashIndex =
            (this.activeSlashIndex + 1) % this.filteredSlashCommands.length;
          this.updateSlashActive();
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          this.activeSlashIndex =
            (this.activeSlashIndex - 1 + this.filteredSlashCommands.length) %
            this.filteredSlashCommands.length;
          this.updateSlashActive();
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const selected = this.filteredSlashCommands[this.activeSlashIndex];
          if (selected) {
            this.executeSlashCommand(selected);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          this.hideSlashPopup();
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        if (e.isComposing || (e as any).keyCode === 229) {
          return;
        }
        e.preventDefault();
        if (
          !this.isBusy() &&
          this.hasContent() &&
          this.processStatus !== "starting"
        ) {
          this.submit();
        }
        return;
      }

      if (e.key === "Escape" && this.isBusy()) {
        e.preventDefault();
        this.options.onCancel(this.sessionId);
        return;
      }

      if (e.key === "ArrowUp") {
        if (
          this.textarea.value.includes("\n") ||
          this.textarea.selectionStart !== this.textarea.selectionEnd ||
          (this.textarea.selectionStart !== 0 &&
            this.textarea.selectionStart !== this.textarea.value.length)
        )
          return;
        if (this.history.length === 0) return;

        if (this.historyIndex === -1) {
          this.tempDraft = this.textarea.value;
          this.historyIndex = this.history.length - 1;
        } else if (this.historyIndex > 0) {
          this.historyIndex--;
        }
        this.textarea.value = this.history[this.historyIndex];
        this.adjustHeight();
        e.preventDefault();
        return;
      }

      if (e.key === "ArrowDown") {
        if (
          this.textarea.value.includes("\n") ||
          this.textarea.selectionStart !== this.textarea.selectionEnd ||
          this.textarea.selectionEnd !== this.textarea.value.length
        )
          return;
        if (this.historyIndex === -1) return;

        if (this.historyIndex < this.history.length - 1) {
          this.historyIndex++;
          this.textarea.value = this.history[this.historyIndex];
        } else {
          // Reached bottom, restore WIP draft
          this.historyIndex = -1;
          this.textarea.value = this.tempDraft;
        }
        this.adjustHeight();
        e.preventDefault();
        return;
      }
    });

    // Dynamic Toggle button
    this.toggleButton.addEventListener("click", () => {
      if (this.isBusy()) {
        this.options.onCancel(this.sessionId);
      } else if (this.hasContent() && this.processStatus !== "starting") {
        this.submit();
      }
    });
  }

  public hasCompactionSupport(): boolean {
    const caps = this.capabilities;
    const hasAgentCapability =
      caps?.compaction != null ||
      caps?.sessionCapabilities?.compaction != null ||
      caps?.session_capabilities?.compaction != null;

    const hasAgentCommand = this.agentCommands.some(
      (c) => c.name.toLowerCase() === "compact",
    );

    return hasAgentCapability || hasAgentCommand;
  }

  public getAllSlashCommands(): SlashCommandItem[] {
    const map = new Map<string, SlashCommandItem>();
    for (const cmd of this.clientCommands) {
      if (cmd.name.toLowerCase() === "fork") {
        const isNative =
          (this.capabilities?.sessionCapabilities?.fork ??
            this.capabilities?.session_capabilities?.fork) != null;
        map.set("fork", {
          ...cmd,
          inputHint: isNative ? "(Native)" : "(Replay)",
        });
        continue;
      }
      map.set(cmd.name.toLowerCase(), cmd);
    }

    // Include /compact ONLY if agent advertises compaction capability or compact command
    if (this.hasCompactionSupport() && !map.has("compact")) {
      map.set("compact", {
        name: "compact",
        description: "Summarize and compress context to save tokens",
        kind: "agent",
      });
    }

    for (const cmd of this.agentCommands) {
      map.set(cmd.name.toLowerCase(), cmd);
    }
    for (const skill of this.skillCommands) {
      if (!map.has(skill.name.toLowerCase())) {
        map.set(skill.name.toLowerCase(), skill);
      }
    }
    return Array.from(map.values());
  }

  private checkSlashCommands(): void {
    const raw = this.textarea.value;
    const trimmedStart = raw.trimStart();
    if (trimmedStart.startsWith("/") || trimmedStart.startsWith("／")) {
      const match = trimmedStart.match(/^[\/／]([a-zA-Z0-9_-]*)$/);
      if (match) {
        const query = match[1].toLowerCase();
        const allCommands = this.getAllSlashCommands();
        this.filteredSlashCommands = allCommands.filter((c) =>
          c.name.toLowerCase().startsWith(query),
        );
        if (this.filteredSlashCommands.length > 0) {
          this.activeSlashIndex = 0;
          this.renderSlashPopup();
          this.slashPopup.style.display = "block";
          return;
        }
      }
    }
    this.hideSlashPopup();
  }

  private renderSlashPopup(): void {
    this.slashPopup.innerHTML = "";
    this.filteredSlashCommands.forEach((cmd, idx) => {
      const item = document.createElement("div");
      item.className = `slash-item ${idx === this.activeSlashIndex ? "active" : ""}`;
      const badgeKind = cmd.kind || "client";
      const badgeText =
        badgeKind === "agent"
          ? "Agent"
          : badgeKind === "skill"
          ? "Skill"
          : "Local";
      const hintHtml = cmd.inputHint
        ? `<span class="slash-hint">${this.escapeHtml(cmd.inputHint)}</span>`
        : "";

      item.innerHTML = `
        <div class="slash-item-header">
          <span class="slash-name">/${this.escapeHtml(cmd.name)}</span>
          ${hintHtml}
          <span class="slash-badge ${badgeKind}">${badgeText}</span>
        </div>
        <div class="slash-desc">${this.escapeHtml(cmd.description)}</div>
      `;
      item.addEventListener("click", () => {
        this.executeSlashCommand(cmd);
      });
      this.slashPopup.appendChild(item);
    });
  }

  private updateSlashActive(): void {
    const items = this.slashPopup.querySelectorAll(".slash-item");
    items.forEach((item, idx) => {
      if (idx === this.activeSlashIndex) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });
  }

  private hideSlashPopup(): void {
    if (this.slashPopup) {
      this.slashPopup.style.display = "none";
      this.slashPopup.innerHTML = "";
    }
    this.filteredSlashCommands = [];
    this.activeSlashIndex = 0;
  }

  private executeSlashCommand(cmd: SlashCommandItem): void {
    const name = cmd.name.toLowerCase();
    if (name === "clear" || name === "new") {
      if (this.isBusy() || this.pendingSubmission) return;
      this.options.onClear?.();
    } else if (name === "fork") {
      if (this.isBusy() || this.pendingSubmission) return;
      this.options.onFork?.();
    } else if (name === "config") {
      this.options.onConfig?.();
    } else if (name === "compact") {
      if (this.isBusy() || this.pendingSubmission) return;
      if (this.hasCompactionSupport()) {
        if (this.options.onCompact) {
          this.options.onCompact();
        } else {
          this.textarea.value = `/${cmd.name}`;
          this.submit();
        }
      } else {
        this.options.onUnsupportedCommand?.("compact");
      }
    } else if (name === "help") {
      if (this.options.onHelp) {
        this.options.onHelp(this.getAllSlashCommands());
      } else {
        this.textarea.value = `/${cmd.name} `;
      }
    } else {
      this.textarea.value = `/${cmd.name} `;
    }
    this.hideSlashPopup();
    this.adjustHeight();
    this.textarea.focus();
  }

  public setAvailableCommands(commands: AvailableCommand[]): void {
    this.agentCommands = (commands || [])
      .map((cmd) => {
        const cleanName = cmd.name.startsWith("/")
          ? cmd.name.slice(1)
          : cmd.name;
        return {
          name: cleanName,
          description: cmd.description || "",
          kind: "agent" as const,
          inputHint: cmd.input?.hint,
        };
      })
      .filter((c) => c.name.length > 0);
  }

  public setSkills(
    skills: Array<{ id?: string; name: string; description: string }>,
  ): void {
    this.skillCommands = (skills || [])
      .map((s) => {
        const cleanName = s.name.startsWith("/") ? s.name.slice(1) : s.name;
        return {
          name: cleanName,
          description: s.description || "",
          kind: "skill" as const,
        };
      })
      .filter((s) => s.name.length > 0);
  }

  private adjustHeight(): void {
    this.textarea.style.height = "auto";
    const targetHeight = Math.min(
      Math.max(this.textarea.scrollHeight, 36),
      240,
    );
    this.textarea.style.height = `${targetHeight}px`;
    this.textarea.style.overflowY =
      this.textarea.scrollHeight > 240 ? "auto" : "hidden";
  }

  private readFile(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1] || dataUrl;
      this.addAttachment({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: "image",
        mimeType: file.type || "image/png",
        data: base64,
        name: file.name,
        size: file.size,
      });
    };
    reader.readAsDataURL(file);
  }

  public addAttachment(attachment: AttachmentItem): void {
    this.draftRevision++;
    this.attachments.push(attachment);
    this.renderAttachments();
    this.updateButtonState();
  }

  public removeAttachment(id: string): void {
    this.draftRevision++;
    this.attachments = this.attachments.filter((a) => a.id !== id);
    this.renderAttachments();
    this.updateButtonState();
  }

  private renderAttachments(): void {
    this.previewArea.innerHTML = "";
    for (const att of this.attachments) {
      const chip = document.createElement("div");
      chip.className = "attachment-chip";
      chip.innerHTML = `
        <span class="attachment-icon">${ICONS.image}</span>
        <span class="attachment-name">${this.escapeHtml(att.name || "image")}</span>
        <button class="remove-attachment" type="button" data-id="${att.id}" title="Remove attachment">${ICONS.close}</button>
      `;

      chip
        .querySelector(".remove-attachment")
        ?.addEventListener("click", () => {
          this.removeAttachment(att.id);
        });

      this.previewArea.appendChild(chip);
    }
  }

  public submit(): void {
    if (
      this.pendingSubmission ||
      this.isBusy() ||
      this.processStatus === "starting"
    )
      return;
    const text = this.textarea.value.trim();
    if (!text && this.attachments.length === 0) {
      return;
    }

    if (text.startsWith("/") && this.attachments.length === 0) {
      const parts = text.split(/\s+/);
      const commandName = parts[0].slice(1).toLowerCase();
      if (commandName === "clear" || commandName === "new") {
        this.textarea.value = "";
        this.adjustHeight();
        this.options.onClear?.();
        return;
      }
      if (commandName === "fork") {
        this.textarea.value = "";
        this.adjustHeight();
        this.options.onFork?.();
        return;
      }
      if (commandName === "config") {
        this.textarea.value = "";
        this.adjustHeight();
        this.options.onConfig?.();
        return;
      }
      if (commandName === "compact") {
        this.textarea.value = "";
        this.adjustHeight();
        if (this.hasCompactionSupport()) {
          this.options.onCompact?.();
        } else {
          this.options.onUnsupportedCommand?.("compact");
        }
        return;
      }
      if (commandName === "help" && parts.length === 1) {
        this.textarea.value = "";
        this.adjustHeight();
        if (this.options.onHelp) {
          this.options.onHelp(this.getAllSlashCommands());
          return;
        }
      }
    }

    const requestId = `prompt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const payload = {
      requestId,
      sessionId: this.sessionId,
      text,
      attachments:
        this.attachments.length > 0 ? [...this.attachments] : undefined,
      model: this.currentModel,
      thinkingLevel: this.thinkingLevel,
    };

    this.pendingSubmission = { requestId, revision: this.draftRevision };
    this.updateButtonState();
    try {
      this.options.onSend(payload);
    } catch (error) {
      this.pendingSubmission = undefined;
      this.updateButtonState();
      throw error;
    }
  }

  public handlePromptResult(result: {
    requestId: string;
    sessionId?: string;
    status: "accepted" | "completed" | "rejected";
  }): void {
    const pending = this.pendingSubmission;
    if (!pending || pending.requestId !== result.requestId) return;
    if (result.status === "accepted") return;
    this.pendingSubmission = undefined;
    if (
      result.status === "completed" &&
      pending.revision === this.draftRevision
    ) {
      this.textarea.value = "";
      this.tempDraft = "";
      this.historyIndex = -1;
      this.attachments = [];
      this.renderAttachments();
      this.adjustHeight();
    }
    this.updateButtonState();
  }

  public setProcessStatus(status: ProcessStatus): void {
    this.processStatus = status;
    this.updateButtonState();
  }

  public hasContent(): boolean {
    return (
      !!(this.textarea && this.textarea.value.trim().length > 0) ||
      this.attachments.length > 0
    );
  }

  public updateButtonState(): void {
    if (!this.toggleButton) return;
    const busy = this.isBusy();

    if (busy) {
      this.toggleButton.disabled = false;
      this.toggleButton.classList.remove("send", "connecting", "disabled");
      this.toggleButton.classList.add("stop");
      this.toggleButton.innerHTML = `${ICONS.stop} <span>Stop</span>`;
      this.toggleButton.title = "Stop agent generation (Escape)";
    } else if (this.processStatus === "starting") {
      this.toggleButton.disabled = true;
      this.toggleButton.classList.remove("send", "stop");
      this.toggleButton.classList.add("connecting", "disabled");
      this.toggleButton.innerHTML = `${ICONS.spinner} <span>Connecting...</span>`;
      this.toggleButton.title = "Agent process is starting...";
    } else {
      this.toggleButton.classList.remove("stop", "connecting");
      this.toggleButton.classList.add("send");
      this.toggleButton.innerHTML = `${ICONS.send} <span>Send</span>`;

      const canSend = this.hasContent() && !this.pendingSubmission;
      this.toggleButton.disabled = !canSend;
      if (canSend) {
        this.toggleButton.classList.remove("disabled");
        this.toggleButton.title = "Send prompt (Enter)";
      } else {
        this.toggleButton.classList.add("disabled");
        this.toggleButton.title = "Please enter a message or attach a file";
      }
    }
  }

  public setStatus(status: SessionStatus): void {
    this.status = status;
    this.updateButtonState();
  }

  public setSessionId(id: string): void {
    this.sessionId = id;
  }

  public setHistory(history: string[]): void {
    this.history = [...history];
    this.historyIndex = -1;
    this.tempDraft = "";
  }

  public setModels(models: string[]): void {
    this.models = [...models];
    if (this.models.length > 0 && !this.currentModel) {
      this.currentModel = this.models[0];
    }
    this.updateModelSelect();
    this.updateThinkingSelect();
  }

  public setModel(model?: string): void {
    this.currentModel = model;
    if (model && !this.models.includes(model)) {
      this.models.push(model);
    }
    this.updateModelSelect();
    this.updateThinkingSelect();
  }

  public setThinkingLevel(level?: ThinkingLevel): void {
    this.thinkingLevel = level;
    this.updateThinkingSelect();
  }

  public setThinkingLevels(levels: string[]): void {
    if (levels && levels.length > 0) {
      this.thinkingLevels = [...levels];
      this.updateThinkingSelect();
    }
  }

  private updateModelSelect(): void {
    if (!this.modelSelect) return;
    const hasModels = this.models.length > 0 || !!this.currentModel;
    this.modelSelect.disabled = !hasModels;
    this.modelSelect.title = hasModels
      ? "Select AI Model"
      : "No agent connected";
    if (hasModels) {
      const list = this.models.length > 0 ? this.models : [this.currentModel!];
      this.modelSelect.innerHTML = list
        .map(
          (m) =>
            `<option value="${m}" ${m === this.currentModel ? "selected" : ""}>${this.escapeHtml(formatModelLabel(m))}</option>`,
        )
        .join("");
      if (this.currentModel) {
        this.modelSelect.value = this.currentModel;
      }
    } else {
      this.modelSelect.innerHTML =
        '<option value="" disabled selected>-- No Model --</option>';
      this.modelSelect.value = "";
    }
  }

  private updateThinkingSelect(): void {
    if (!this.thinkingSelect) return;
    const hasModels = this.models.length > 0 || !!this.currentModel;
    this.thinkingSelect.disabled = !hasModels;
    this.thinkingSelect.title = hasModels
      ? "Thinking Level / Reasoning Effort"
      : "No agent connected";
    if (hasModels) {
      const levels =
        this.thinkingLevels && this.thinkingLevels.length > 0
          ? this.thinkingLevels
          : ["off", "low", "medium", "high"];
      const lvl =
        this.thinkingLevel ||
        (levels.includes("medium") ? "medium" : levels[0]);
      this.thinkingSelect.innerHTML = levels
        .map(
          (l) =>
            `<option value="${l}" ${l === lvl ? "selected" : ""}>Thinking: ${this.escapeHtml(formatThinkingLabel(l))}</option>`,
        )
        .join("");
      this.thinkingSelect.value = lvl;
    } else {
      this.thinkingSelect.innerHTML =
        '<option value="" disabled selected>Thinking: --</option>';
      this.thinkingSelect.value = "";
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  public setCapabilities(capabilities: any): void {
    this.capabilities = capabilities;
    this.updateAttachmentButtonState();
  }

  private updateAttachmentButtonState(): void {
    const attachBtn = this.container?.querySelector(
      ".btn-attach",
    ) as HTMLButtonElement | null;
    if (!attachBtn) return;

    const promptCaps = this.capabilities?.promptCapabilities;
    const imageSupported = promptCaps?.image !== false;

    if (!imageSupported) {
      attachBtn.disabled = true;
      attachBtn.title = "Current agent does not support image attachments";
      attachBtn.classList.add("disabled");
    } else {
      attachBtn.disabled = false;
      attachBtn.title = "Attach Image or File";
      attachBtn.classList.remove("disabled");
    }
  }

  public focus(): void {
    this.textarea?.focus();
  }
}

export function formatModelLabel(model: string): string {
  if (!model) return "";
  if (model.includes(":")) {
    const [provider, name] = model.split(":", 2);
    return `${name} (${provider})`;
  }
  return model;
}

export function formatThinkingLabel(lvl: string): string {
  if (!lvl) return "";
  const nameMap: Record<string, string> = {
    off: "Off",
    minimal: "Minimal",
    low: "Low",
    medium: "Medium",
    high: "High",
    xhigh: "Extra High",
    max: "Max",
    ultra: "Ultra",
  };
  return (
    nameMap[lvl.toLowerCase()] || lvl.charAt(0).toUpperCase() + lvl.slice(1)
  );
}
