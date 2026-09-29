// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatViewComponent, renderMarkdown } from '../../src/webview/components/chat-view';
import { ThinkingBlockComponent } from '../../src/webview/components/thinking-block';
import type { MessageChunk } from '../../src/core/types/session';

describe('T4: ChatViewComponent & Collapsible ThinkingBlock', () => {
  let container: HTMLElement;
  let onActionMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);
    onActionMock = vi.fn();
  });

  describe('renderMarkdown', () => {
    it('should format code blocks with copy and insert buttons', () => {
      const markdown = 'Here is code:\n```typescript\nconst a = 1;\n```';
      const html = renderMarkdown(markdown);

      expect(html).toContain('class="code-block-wrapper"');
      expect(html).toContain('typescript');
      expect(html).toContain('const a = 1;');
      expect(html).toContain('data-action="copy-code"');
      expect(html).toContain('data-action="insert-code"');
    });

    it('should format bold, inline code, and line breaks', () => {
      const markdown = 'This is **bold** and `code`.\nNext line.';
      const html = renderMarkdown(markdown);

      expect(html).toContain('<strong>bold</strong>');
      expect(html).toContain('<code>code</code>');
      expect(html).toContain('<br>');
    });
  });

  describe('ThinkingBlockComponent', () => {
    it('should render collapsible thinking block and toggle expansion on header click', () => {
      new ThinkingBlockComponent({
        container,
        thinking: 'Step 1: Parse requirements.\nStep 2: Generate response.',
        durationSeconds: 3.5,
      });

      const card = container.querySelector('.thinking-card');
      expect(card).not.toBeNull();
      expect(card?.classList.contains('expanded')).toBe(false);

      const header = container.querySelector('.thinking-header') as HTMLElement;
      expect(header.textContent).toContain('Thinking (3.5s)');

      // Click to expand
      header.click();
      expect(card?.classList.contains('expanded')).toBe(true);

      // Verify thinking body content
      const body = container.querySelector('.thinking-body');
      expect(body?.textContent).toContain('Step 1: Parse requirements.');

      // Click again to collapse
      header.click();
      expect(card?.classList.contains('expanded')).toBe(false);
    });
  });

  describe('ChatViewComponent', () => {
    it('should render user and assistant messages with thinking blocks and tool call cards', () => {
      const chatView = new ChatViewComponent({
        container,
        onAction: onActionMock,
      });

      const messages: MessageChunk[] = [
        {
          role: 'user',
          content: 'Hello, please write a test function.',
        },
        {
          role: 'assistant',
          thinking: 'Planning the test function structure...',
          content: 'Here is the function:\n```javascript\nfunction test() {}\n```',
          toolCalls: [
            {
              id: 'call-1',
              name: 'writeFile',
              input: { path: '/tmp/test.js' },
              status: 'completed',
            },
          ],
        },
      ];

      chatView.renderMessages(messages);

      const userRow = container.querySelector('.message-row.user');
      expect(userRow?.textContent).toContain('Hello, please write a test function.');

      const assistantRow = container.querySelector('.message-row.assistant');
      expect(assistantRow?.textContent).toContain('function test()');
      expect(assistantRow?.querySelector('.thinking-card')).not.toBeNull();
      expect(assistantRow?.querySelector('.tool-call-card')).not.toBeNull();
      expect(assistantRow?.querySelector('.tool-name')?.textContent).toBe('writeFile');
    });

    it('should handle tool permission approval buttons', () => {
      const chatView = new ChatViewComponent({
        container,
        onAction: onActionMock,
      });

      chatView.renderPermissionPrompt({
        sessionId: 'sess-1',
        requestId: 'perm-1',
        toolTitle: 'Execute Terminal Command',
        options: [
          { optionId: 'opt-allow', name: 'Allow Once', kind: 'allow_once' },
          { optionId: 'opt-deny', name: 'Reject', kind: 'reject_once' },
        ],
      });

      const allowBtn = container.querySelector<HTMLButtonElement>('[data-option="opt-allow"]');
      expect(allowBtn).not.toBeNull();
      allowBtn?.click();

      expect(onActionMock).toHaveBeenCalledWith({
        type: 'RESPOND_PERMISSION',
        payload: {
          sessionId: 'sess-1',
          requestId: 'perm-1',
          decision: 'allow',
          options: { optionId: 'opt-allow' },
        },
      });
    });
  });
});
