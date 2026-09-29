/**
 * InputBoxComponent: Ergonomic input dock with dynamic Send/Stop toggle,
 * keyboard ↑/↓ history recall, model/thinking selectors, and multimodal attachments.
 */

import type { SessionStatus, ThinkingLevel } from '../../core/types/session';

export interface AttachmentItem {
  id: string;
  type: 'image';
  mimeType: string;
  data: string; // Base64 data string or URI
  name?: string;
  size?: number;
}

export interface SlashCommandItem {
  name: string;
  description: string;
}

export interface InputBoxOptions {
  container: HTMLElement;
  sessionId?: string;
  history?: string[];
  models?: string[];
  currentModel?: string;
  thinkingLevel?: ThinkingLevel;
  status?: SessionStatus;
  onSend: (data: {
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
  skills?: SlashCommandItem[];
}

export class InputBoxComponent {
  private container: HTMLElement;
  private options: InputBoxOptions;
  private sessionId: string;
  private history: string[];
  private historyIndex = -1;
  private tempDraft = '';
  private models: string[];
  private currentModel?: string;
  private thinkingLevel?: ThinkingLevel;
  private status: SessionStatus;
  private attachments: AttachmentItem[] = [];

  // Slash commands
  private slashCommands: SlashCommandItem[] = [
    { name: 'clear', description: 'Clear active chat session history' },
    { name: 'tdd', description: 'Test-Driven Development workflow (Red-Green-Refactor)' },
    { name: 'review', description: 'Rigorous code review against spec and guidelines' },
    { name: 'design', description: 'Architectural and spec design before coding' },
    { name: 'plan', description: 'Create milestone-driven execution plan' },
  ];
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
    this.sessionId = options.sessionId || '';
    this.history = options.history ? [...options.history] : [];
    this.models = options.models && options.models.length > 0 ? [...options.models] : [];
    this.currentModel = options.currentModel;
    this.thinkingLevel = options.thinkingLevel;
    this.status = options.status || 'idle';

    if (options.skills && options.skills.length > 0) {
      for (const skill of options.skills) {
        if (!this.slashCommands.some((c) => c.name === skill.name)) {
          this.slashCommands.push(skill);
        }
      }
    }

    this.render();
    this.bindEvents();
  }

  private render(): void {
    const hasModels = this.models.length > 0 || !!this.currentModel;
    const modelOptionsHtml = hasModels
      ? (this.models.length > 0 ? this.models : [this.currentModel!])
          .map(
            (m) =>
              `<option value="${m}" ${m === this.currentModel ? 'selected' : ''}>${m}</option>`
          )
          .join('')
      : `<option value="" disabled selected>-- No Model --</option>`;

    const currentLvl = this.thinkingLevel || 'off';
    const thinkingOptionsHtml = hasModels
      ? `
          <option value="off" ${currentLvl === 'off' ? 'selected' : ''}>🧠 Thinking: Off</option>
          <option value="low" ${currentLvl === 'low' ? 'selected' : ''}>🧠 Thinking: Low</option>
          <option value="medium" ${currentLvl === 'medium' ? 'selected' : ''}>🧠 Thinking: Medium</option>
          <option value="high" ${currentLvl === 'high' ? 'selected' : ''}>🧠 Thinking: High</option>
        `
      : `<option value="" disabled selected>🧠 Thinking: --</option>`;

    this.container.innerHTML = `
      <div class="attachment-previews"></div>
      <div class="input-top-bar">
        <div class="input-selectors">
          <select class="model-select" ${hasModels ? '' : 'disabled'} title="${hasModels ? 'Select AI Model' : 'No agent connected'}">
            ${modelOptionsHtml}
          </select>
          <select class="thinking-select" ${hasModels ? '' : 'disabled'} title="${hasModels ? 'Thinking Level / Reasoning Effort' : 'No agent connected'}">
            ${thinkingOptionsHtml}
          </select>
        </div>
        <div class="input-top-actions">
          <button class="btn-attach" type="button" title="Attach Image or File">📎 Attach</button>
          <input type="file" class="file-attach-input" accept="image/*" style="display: none;" />
        </div>
      </div>
      <div class="input-box-wrapper" style="position: relative;">
        <div class="slash-commands-popup" style="display: none;"></div>
        <textarea
          class="prompt-input"
          placeholder="Ask a question or describe a task... (↑/↓ to recall history, / for commands)"
          rows="1"
        ></textarea>
        <div class="input-actions">
          <button
            class="btn-toggle-action ${this.isBusy() ? 'stop' : 'send'}"
            type="button"
            title="${this.isBusy() ? 'Stop agent generation' : 'Send prompt'}"
          >${this.isBusy() ? '⏹ Stop' : '⏎ Send'}</button>
        </div>
      </div>
    `;

    this.previewArea = this.container.querySelector('.attachment-previews') as HTMLElement;
    this.modelSelect = this.container.querySelector('select.model-select') as HTMLSelectElement;
    this.thinkingSelect = this.container.querySelector('select.thinking-select') as HTMLSelectElement;
    this.textarea = this.container.querySelector('textarea.prompt-input') as HTMLTextAreaElement;
    this.toggleButton = this.container.querySelector('.btn-toggle-action') as HTMLButtonElement;
    this.fileInput = this.container.querySelector('.file-attach-input') as HTMLInputElement;
    this.slashPopup = this.container.querySelector('.slash-commands-popup') as HTMLElement;

    if (this.currentModel) {
      this.modelSelect.value = this.currentModel;
    }
    if (this.thinkingLevel) {
      this.thinkingSelect.value = this.thinkingLevel;
    }
  }

  private isBusy(): boolean {
    return this.status === 'streaming' || this.status === 'waiting_approval';
  }

  private bindEvents(): void {
    // Model Select
    this.modelSelect.addEventListener('change', () => {
      this.currentModel = this.modelSelect.value;
      this.options.onModelChange?.(this.currentModel);
    });

    // Thinking Select
    this.thinkingSelect.addEventListener('change', () => {
      this.thinkingLevel = this.thinkingSelect.value as ThinkingLevel;
      this.options.onThinkingLevelChange?.(this.thinkingLevel);
    });

    // Attach Button
    const attachBtn = this.container.querySelector('.btn-attach') as HTMLButtonElement;
    attachBtn?.addEventListener('click', () => {
      this.fileInput.click();
    });

    // File Input change
    this.fileInput.addEventListener('change', () => {
      const files = this.fileInput.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          this.readFile(files[i]);
        }
      }
      this.fileInput.value = '';
    });

    // Paste handler on textarea
    this.textarea.addEventListener('paste', (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            this.readFile(file);
          }
        }
      }
    });

    // Drag & Drop
    this.container.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
    });

    this.container.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.type.startsWith('image/')) {
            this.readFile(file);
          }
        }
      }
    });

    // Auto-grow textarea & slash commands detection
    this.textarea.addEventListener('input', () => {
      this.adjustHeight();
      this.checkSlashCommands();
    });

    // Click outside to dismiss slash popup
    document.addEventListener('click', (e: MouseEvent) => {
      if (this.slashPopup && this.slashPopup.style.display !== 'none') {
        const target = e.target as Node;
        if (!this.container.contains(target)) {
          this.hideSlashPopup();
        }
      }
    });

    // Keydown handler
    this.textarea.addEventListener('keydown', (e: KeyboardEvent) => {
      // Handle slash popup navigation
      if (
        this.slashPopup &&
        this.slashPopup.style.display !== 'none' &&
        this.filteredSlashCommands.length > 0
      ) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.activeSlashIndex = (this.activeSlashIndex + 1) % this.filteredSlashCommands.length;
          this.updateSlashActive();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.activeSlashIndex =
            (this.activeSlashIndex - 1 + this.filteredSlashCommands.length) %
            this.filteredSlashCommands.length;
          this.updateSlashActive();
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const selected = this.filteredSlashCommands[this.activeSlashIndex];
          if (selected) {
            this.executeSlashCommand(selected);
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          this.hideSlashPopup();
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!this.isBusy()) {
          this.submit();
        }
        return;
      }

      if (e.key === 'ArrowUp') {
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

      if (e.key === 'ArrowDown') {
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
    this.toggleButton.addEventListener('click', () => {
      if (this.isBusy()) {
        this.options.onCancel(this.sessionId);
      } else {
        this.submit();
      }
    });
  }

  private checkSlashCommands(): void {
    const val = this.textarea.value;
    if (val.startsWith('/')) {
      const match = val.match(/^\/([a-zA-Z0-9_-]*)$/);
      if (match) {
        const query = match[1].toLowerCase();
        this.filteredSlashCommands = this.slashCommands.filter((c) =>
          c.name.toLowerCase().startsWith(query)
        );
        if (this.filteredSlashCommands.length > 0) {
          this.activeSlashIndex = 0;
          this.renderSlashPopup();
          this.slashPopup.style.display = 'block';
          return;
        }
      }
    }
    this.hideSlashPopup();
  }

  private renderSlashPopup(): void {
    this.slashPopup.innerHTML = '';
    this.filteredSlashCommands.forEach((cmd, idx) => {
      const item = document.createElement('div');
      item.className = `slash-item ${idx === this.activeSlashIndex ? 'active' : ''}`;
      item.innerHTML = `
        <span class="slash-name">/${cmd.name}</span>
        <span class="slash-desc">${cmd.description}</span>
      `;
      item.addEventListener('click', () => {
        this.executeSlashCommand(cmd);
      });
      this.slashPopup.appendChild(item);
    });
  }

  private updateSlashActive(): void {
    const items = this.slashPopup.querySelectorAll('.slash-item');
    items.forEach((item, idx) => {
      if (idx === this.activeSlashIndex) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  private hideSlashPopup(): void {
    if (this.slashPopup) {
      this.slashPopup.style.display = 'none';
      this.slashPopup.innerHTML = '';
    }
    this.filteredSlashCommands = [];
    this.activeSlashIndex = 0;
  }

  private executeSlashCommand(cmd: SlashCommandItem): void {
    if (cmd.name === 'clear') {
      this.options.onClear?.();
      this.textarea.value = '';
    } else {
      this.textarea.value = `/${cmd.name} `;
    }
    this.hideSlashPopup();
    this.adjustHeight();
    this.textarea.focus();
  }

  public setSkills(skills: SlashCommandItem[]): void {
    for (const skill of skills) {
      if (!this.slashCommands.some((c) => c.name === skill.name)) {
        this.slashCommands.push(skill);
      }
    }
  }

  private adjustHeight(): void {
    this.textarea.style.height = 'auto';
    this.textarea.style.height = `${Math.min(this.textarea.scrollHeight, 160)}px`;
  }

  private readFile(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] || dataUrl;
      this.addAttachment({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'image',
        mimeType: file.type || 'image/png',
        data: base64,
        name: file.name,
        size: file.size,
      });
    };
    reader.readAsDataURL(file);
  }

  public addAttachment(attachment: AttachmentItem): void {
    this.attachments.push(attachment);
    this.renderAttachments();
  }

  public removeAttachment(id: string): void {
    this.attachments = this.attachments.filter((a) => a.id !== id);
    this.renderAttachments();
  }

  private renderAttachments(): void {
    this.previewArea.innerHTML = '';
    for (const att of this.attachments) {
      const chip = document.createElement('div');
      chip.className = 'attachment-chip';
      chip.innerHTML = `
        <span class="attachment-name">🖼 ${att.name || 'image'}</span>
        <button class="remove-attachment" type="button" data-id="${att.id}" title="Remove attachment">✕</button>
      `;

      chip.querySelector('.remove-attachment')?.addEventListener('click', () => {
        this.removeAttachment(att.id);
      });

      this.previewArea.appendChild(chip);
    }
  }

  public submit(): void {
    const text = this.textarea.value.trim();
    if (!text && this.attachments.length === 0) {
      return;
    }

    const payload = {
      sessionId: this.sessionId,
      text,
      attachments: this.attachments.length > 0 ? [...this.attachments] : undefined,
      model: this.currentModel,
      thinkingLevel: this.thinkingLevel,
    };

    this.options.onSend(payload);

    // Clear after send
    this.textarea.value = '';
    this.tempDraft = '';
    this.historyIndex = -1;
    this.attachments = [];
    this.renderAttachments();
    this.adjustHeight();
  }

  public setStatus(status: SessionStatus): void {
    this.status = status;
    const busy = this.isBusy();

    if (busy) {
      this.toggleButton.classList.remove('send');
      this.toggleButton.classList.add('stop');
      this.toggleButton.textContent = '⏹ Stop';
      this.toggleButton.title = 'Stop agent generation';
    } else {
      this.toggleButton.classList.remove('stop');
      this.toggleButton.classList.add('send');
      this.toggleButton.textContent = '⏎ Send';
      this.toggleButton.title = 'Send prompt';
    }
  }

  public setSessionId(id: string): void {
    this.sessionId = id;
  }

  public setHistory(history: string[]): void {
    this.history = [...history];
    this.historyIndex = -1;
    this.tempDraft = '';
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

  private updateModelSelect(): void {
    if (!this.modelSelect) return;
    const hasModels = this.models.length > 0 || !!this.currentModel;
    this.modelSelect.disabled = !hasModels;
    this.modelSelect.title = hasModels ? 'Select AI Model' : 'No agent connected';
    if (hasModels) {
      const list = this.models.length > 0 ? this.models : [this.currentModel!];
      this.modelSelect.innerHTML = list
        .map(
          (m) =>
            `<option value="${m}" ${m === this.currentModel ? 'selected' : ''}>${m}</option>`
        )
        .join('');
      if (this.currentModel) {
        this.modelSelect.value = this.currentModel;
      }
    } else {
      this.modelSelect.innerHTML = '<option value="" disabled selected>-- No Model --</option>';
      this.modelSelect.value = '';
    }
  }

  private updateThinkingSelect(): void {
    if (!this.thinkingSelect) return;
    const hasModels = this.models.length > 0 || !!this.currentModel;
    this.thinkingSelect.disabled = !hasModels;
    this.thinkingSelect.title = hasModels ? 'Thinking Level / Reasoning Effort' : 'No agent connected';
    if (hasModels) {
      const lvl = this.thinkingLevel || 'off';
      this.thinkingSelect.innerHTML = `
        <option value="off" ${lvl === 'off' ? 'selected' : ''}>🧠 Thinking: Off</option>
        <option value="low" ${lvl === 'low' ? 'selected' : ''}>🧠 Thinking: Low</option>
        <option value="medium" ${lvl === 'medium' ? 'selected' : ''}>🧠 Thinking: Medium</option>
        <option value="high" ${lvl === 'high' ? 'selected' : ''}>🧠 Thinking: High</option>
      `;
      this.thinkingSelect.value = lvl;
    } else {
      this.thinkingSelect.innerHTML = '<option value="" disabled selected>🧠 Thinking: --</option>';
      this.thinkingSelect.value = '';
    }
  }

  public focus(): void {
    this.textarea?.focus();
  }
}
