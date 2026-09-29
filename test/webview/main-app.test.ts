// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebviewApp, vscodeApi } from '../../src/webview/main';
import type { WebviewStateSnapshot } from '../../src/shared/ipc-protocol';

describe('T7: WebviewApp End-to-End Orchestration & IPC Bridge', () => {
  let postMessageSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="app"></div>
    `;
    postMessageSpy = vi.spyOn(vscodeApi, 'postMessage');
  });

  it('should initialize DOM structure and emit READY action on mount', () => {
    new WebviewApp();

    expect(document.getElementById('header')).not.toBeNull();
    expect(document.getElementById('chat-container')).not.toBeNull();
    expect(document.getElementById('input-container')).not.toBeNull();
    expect(document.getElementById('config-drawer')).not.toBeNull();
    expect(document.getElementById('history-drawer')).not.toBeNull();

    expect(postMessageSpy).toHaveBeenCalledWith({ type: 'READY' });
  });

  it('should handle STATE_SNAPSHOT message and update header, chat, and drawers', () => {
    const app = new WebviewApp();

    const snapshot: WebviewStateSnapshot = {
      activeSession: {
        id: 'session-e2e',
        agentId: 'claude-code',
        title: 'End-to-End Test Session',
        model: 'claude-3-7-sonnet',
        thinkingLevel: 'high',
        status: 'idle',
        createdAt: 1000,
        updatedAt: 2000,
        messages: [
          { role: 'user', content: 'Can you refactor auth?' },
          { role: 'assistant', content: 'Sure, I will refactor it.', thinking: 'Analyzing auth...' },
        ],
      },
      sessions: [
        {
          id: 'session-e2e',
          agentId: 'claude-code',
          title: 'End-to-End Test Session',
          status: 'idle',
          messageCount: 2,
          createdAt: 1000,
          updatedAt: 2000,
        },
      ],
      agentConfigs: [
        {
          id: 'claude-code',
          name: 'Claude Code Agent',
          command: 'npx',
          args: [],
          env: {},
          enabled: true,
          transport: 'stdio',
        },
      ],
      inputHistory: ['previous prompt 1', 'previous prompt 2'],
      processStatuses: {
        'claude-code': 'running',
      },
    };

    app.handleExtensionMessage({
      type: 'STATE_SNAPSHOT',
      payload: snapshot,
    });

    // Verify Header was updated
    const header = document.getElementById('header') as HTMLElement;
    expect(header.textContent).toContain('Claude Code Agent');
    expect(header.textContent).toContain('claude-3-7-sonnet');

    // Verify Chat was updated
    const chat = document.getElementById('chat-container') as HTMLElement;
    expect(chat.textContent).toContain('Can you refactor auth?');
    expect(chat.textContent).toContain('Sure, I will refactor it.');

    // Verify InputBox status
    const sendBtn = document.querySelector('.btn-toggle-action') as HTMLButtonElement;
    expect(sendBtn.classList.contains('send')).toBe(true);
  });

  it('should stream chunks incrementally on SESSION_EVENT', () => {
    const app = new WebviewApp();

    app.handleExtensionMessage({
      type: 'SESSION_EVENT',
      payload: {
        sessionId: 'session-e2e',
        event: {
          type: 'chunk',
          sessionId: 'session-e2e',
          payload: {
            content: 'Streaming chunk 1... ',
          },
        },
      },
    });

    const chat = document.getElementById('chat-container') as HTMLElement;
    expect(chat.textContent).toContain('Streaming chunk 1...');

    app.handleExtensionMessage({
      type: 'SESSION_EVENT',
      payload: {
        sessionId: 'session-e2e',
        event: {
          type: 'chunk',
          sessionId: 'session-e2e',
          payload: {
            content: 'and chunk 2.',
          },
        },
      },
    });

    expect(chat.textContent).toContain('Streaming chunk 1... and chunk 2.');
  });
});
