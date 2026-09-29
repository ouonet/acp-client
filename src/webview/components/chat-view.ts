/**
 * Chat Stream View Component & Markdown Renderer
 * Renders user/assistant messages, incremental markdown, code blocks, thinking cards, and tool approval gates.
 */

import type { MessageChunk, ContentBlock, ToolCall } from '../../core/types/session';
import { ThinkingBlockComponent } from './thinking-block';
import { DiffViewerComponent } from './diff-viewer';

export interface ChatViewOptions {
  container: HTMLElement;
  onAction: (action: any) => void;
}

export interface PermissionPromptParams {
  sessionId: string;
  requestId: string;
  toolTitle: string;
  options: Array<{
    optionId: string;
    name: string;
    kind: string;
  }>;
}

export function renderMarkdown(markdown: string): string {
  if (!markdown) return '';

  const codeBlocks: string[] = [];
  // 1. Extract fenced code blocks to prevent nested replacements
  let processed = markdown.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const index = codeBlocks.length;
    const cleanLang = lang || 'text';
    const escapedCode = escapeHtml(code.trim());
    const blockHtml = `
      <pre class="code-block-wrapper">
        <div class="code-header">
          <span class="code-lang">${cleanLang}</span>
          <div class="code-header-actions">
            <button class="code-action-btn" data-action="copy-code">Copy</button>
            <button class="code-action-btn" data-action="insert-code">Insert</button>
          </div>
        </div>
        <code>${escapedCode}</code>
      </pre>
    `.trim();
    codeBlocks.push(blockHtml);
    return `__CODE_BLOCK_${index}__`;
  });

  // 2. Bold
  processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // 3. Inline code
  processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 4. Line breaks
  processed = processed.replace(/\n/g, '<br>');

  // 5. Restore code blocks
  processed = processed.replace(/__CODE_BLOCK_(\d+)__/g, (_match, id) => {
    return codeBlocks[parseInt(id, 10)] || '';
  });

  return processed;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class ChatViewComponent {
  private readonly container: HTMLElement;
  private readonly onAction: (action: any) => void;
  private currentAssistantBubble: HTMLElement | null = null;
  private currentThinkingContainer: HTMLElement | null = null;
  private currentRawContent = '';

  constructor(options: ChatViewOptions) {
    this.container = options.container;
    this.onAction = options.onAction;
    this.bindGlobalEvents();
  }

  public setMessages(messages: MessageChunk[]): void {
    this.currentAssistantBubble = null;
    this.currentThinkingContainer = null;
    this.currentRawContent = '';
    this.renderMessages(messages);
  }

  public appendAssistantChunk(chunk: string): void {
    if (!this.currentAssistantBubble) {
      const row = document.createElement('div');
      row.className = 'message-row assistant';
      this.currentAssistantBubble = document.createElement('div');
      this.currentAssistantBubble.className = 'message-bubble';
      row.appendChild(this.currentAssistantBubble);
      this.container.appendChild(row);
      this.currentRawContent = '';
    }

    this.currentRawContent += chunk;
    this.currentAssistantBubble.innerHTML = renderMarkdown(this.currentRawContent);
    this.scrollToBottom();
  }

  public appendThinkingChunk(thinking: string): void {
    let row = this.container.querySelector('.message-row.assistant:last-child') as HTMLElement;
    if (!row) {
      row = document.createElement('div');
      row.className = 'message-row assistant';
      this.container.appendChild(row);
    }

    if (!this.currentThinkingContainer) {
      this.currentThinkingContainer = document.createElement('div');
      row.insertBefore(this.currentThinkingContainer, row.firstChild);
    }

    new ThinkingBlockComponent({
      container: this.currentThinkingContainer,
      thinking,
    });
    this.scrollToBottom();
  }

  public appendToolCall(tc: ToolCall): void {
    let row = this.container.querySelector('.message-row.assistant:last-child') as HTMLElement;
    if (!row) {
      row = document.createElement('div');
      row.className = 'message-row assistant';
      this.container.appendChild(row);
    }
    const el = this.createToolCallElement(tc);
    el.setAttribute('data-tool-id', tc.id);
    row.appendChild(el);
    this.scrollToBottom();
  }

  public updateToolResult(id: string, output: any, status: string = 'completed'): void {
    const card = this.container.querySelector(`[data-tool-id="${id}"]`);
    if (card) {
      const statusSpan = card.querySelector('.tool-status');
      if (statusSpan) {
        statusSpan.textContent = status;
      }
      if (output) {
        const outPre = document.createElement('pre');
        outPre.style.cssText = 'font-size: 11px; color: var(--fg-muted); margin-top: 4px; overflow-x: auto;';
        outPre.textContent = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
        card.appendChild(outPre);
      }
    }
  }

  public handlePermissionRequest(params: PermissionPromptParams): void {
    this.renderPermissionPrompt(params);
  }

  public renderMessages(messages: MessageChunk[]): void {
    this.container.innerHTML = '';

    for (const msg of messages) {
      const row = document.createElement('div');
      row.className = `message-row ${msg.role}`;

      if (msg.role === 'user') {
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';

        if (typeof msg.content === 'string') {
          bubble.innerHTML = renderMarkdown(msg.content);
        } else if (Array.isArray(msg.content)) {
          bubble.innerHTML = this.renderContentBlocks(msg.content);
        }
        row.appendChild(bubble);
      } else if (msg.role === 'assistant') {
        // 1. Thinking block if present
        if (msg.thinking) {
          const thinkingContainer = document.createElement('div');
          new ThinkingBlockComponent({
            container: thinkingContainer,
            thinking: msg.thinking,
          });
          row.appendChild(thinkingContainer);
        }

        // 2. Tool calls if present
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            row.appendChild(this.createToolCallElement(tc));
          }
        }

        // 3. Text content bubble
        if (msg.content) {
          const bubble = document.createElement('div');
          bubble.className = 'message-bubble';
          if (typeof msg.content === 'string') {
            bubble.innerHTML = renderMarkdown(msg.content);
          } else if (Array.isArray(msg.content)) {
            bubble.innerHTML = this.renderContentBlocks(msg.content);
          }
          row.appendChild(bubble);
        }
      }

      this.container.appendChild(row);
    }

    this.scrollToBottom();
  }

  public renderPermissionPrompt(params: PermissionPromptParams): void {
    const card = document.createElement('div');
    card.className = 'tool-approval-card';
    card.style.cssText =
      'border: 1px solid var(--accent-color); background: rgba(137, 180, 250, 0.08); padding: 12px; border-radius: var(--radius-md); margin: 10px 0;';

    const optionsHtml = params.options
      .map(
        (opt) =>
          `<button class="btn-perm-action code-action-btn" data-option="${opt.optionId}" style="margin-right: 8px; font-weight: 600;">${escapeHtml(
            opt.name
          )}</button>`
      )
      .join('');

    card.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
        <span>🔐 Permission Required</span>
      </div>
      <div style="font-size: 12px; color: var(--fg-muted); margin-bottom: 10px;">
        Tool: <strong>${escapeHtml(params.toolTitle)}</strong>
      </div>
      <div class="perm-options-row">
        ${optionsHtml}
      </div>
    `;

    // Bind option click
    for (const opt of params.options) {
      const btn = card.querySelector(`[data-option="${opt.optionId}"]`);
      btn?.addEventListener('click', () => {
        const isAllow = opt.kind.startsWith('allow');
        this.onAction({
          type: 'RESPOND_PERMISSION',
          payload: {
            sessionId: params.sessionId,
            requestId: params.requestId,
            decision: isAllow ? 'allow' : 'deny',
            options: { optionId: opt.optionId },
          },
        });
        card.remove();
      });
    }

    this.container.appendChild(card);
    this.scrollToBottom();
  }

  public scrollToBottom(): void {
    this.container.scrollTop = this.container.scrollHeight;
  }

  private renderContentBlocks(blocks: ContentBlock[]): string {
    return blocks
      .map((b) => {
        if (b.type === 'text') {
          return renderMarkdown(b.text);
        } else if (b.type === 'image') {
          return `<div class="msg-image-wrap"><img src="data:${b.mimeType};base64,${b.data}" class="msg-image" style="max-width: 100%; border-radius: 6px; margin: 4px 0;" /></div>`;
        }
        return '';
      })
      .join('');
  }

  private createToolCallElement(tc: ToolCall): HTMLElement {
    const card = document.createElement('div');
    card.className = `tool-call-card ${tc.status}`;
    card.style.cssText =
      'border: 1px solid var(--border-subtle); background: rgba(0,0,0,0.15); padding: 8px 10px; border-radius: 6px; margin: 6px 0; font-size: 12px;';

    card.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
        <div>
          <span style="margin-right: 4px;">🔧</span>
          <span class="tool-name" style="font-weight: 600;">${escapeHtml(tc.name)}</span>
        </div>
        <span class="tool-status" style="font-size: 10px; text-transform: uppercase; color: var(--fg-muted);">${tc.status}</span>
      </div>
      ${tc.input && !tc.input.diff && !tc.input.patch ? `<pre style="font-size: 11px; color: var(--fg-muted); overflow-x: auto;">${escapeHtml(JSON.stringify(tc.input, null, 2))}</pre>` : ''}
    `;

    if (tc.input && (tc.input.diff || tc.input.patch)) {
      const diffContainer = document.createElement('div');
      new DiffViewerComponent({
        container: diffContainer,
        filePath: tc.input.filePath || tc.input.path || 'diff',
        diff: tc.input.diff || tc.input.patch,
        originalContent: tc.input.originalContent,
        modifiedContent: tc.input.modifiedContent || tc.input.content,
        onApply: (filePath, content) => {
          this.onAction({
            type: 'APPLY_FILE_DIFF',
            payload: { filePath, content },
          });
        },
        onOpenDiff: (filePath, originalContent, modifiedContent) => {
          this.onAction({
            type: 'OPEN_DIFF_EDITOR',
            payload: { filePath, originalContent, modifiedContent },
          });
        },
      });
      card.appendChild(diffContainer);
    }

    return card;
  }

  private bindGlobalEvents(): void {
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      if (target && target.getAttribute('data-action') === 'copy-code') {
        const codeEl = target.closest('.code-block-wrapper')?.querySelector('code');
        if (codeEl) {
          navigator.clipboard?.writeText(codeEl.textContent || '');
          const originalText = target.textContent;
          target.textContent = 'Copied!';
          setTimeout(() => {
            target.textContent = originalText;
          }, 1500);
        }
      } else if (target && target.getAttribute('data-action') === 'insert-code') {
        const codeEl = target.closest('.code-block-wrapper')?.querySelector('code');
        if (codeEl) {
          this.onAction({
            type: 'INSERT_CODE_TO_EDITOR',
            payload: { code: codeEl.textContent || '' },
          });
        }
      }
    });
  }
}
