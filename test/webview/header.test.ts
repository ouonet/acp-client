// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeaderComponent } from '../../src/webview/components/header';
import type { WebviewStateSnapshot } from '../../src/shared/ipc-protocol';

describe('T3: HeaderComponent & UI Shell Controls', () => {
  let container: HTMLElement;
  let onActionMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);
    onActionMock = vi.fn();
  });

  it('should render agent status dot, name, and action buttons', () => {
    const header = new HeaderComponent({
      container,
      onAction: onActionMock,
    });

    const snapshot: WebviewStateSnapshot = {
      activeSession: {
        id: 'sess-1',
        agentId: 'agent-1',
        title: 'Main Chat',
        status: 'idle',
        messages: [],
        createdAt: 1000,
        updatedAt: 1000,
        model: 'claude-3-7-sonnet',
        thinkingLevel: 'medium',
      },
      sessions: [],
      agentConfigs: [
        {
          id: 'agent-1',
          name: 'Claude Agent',
          command: 'node',
          args: [],
          env: {},
          transport: 'stdio',
          enabled: true,
        },
      ],
      inputHistory: [],
      processStatuses: {
        'agent-1': 'running',
      },
    };

    header.update(snapshot);

    // Verify status dot
    const statusDot = container.querySelector('.status-dot');
    expect(statusDot).not.toBeNull();
    expect(statusDot?.classList.contains('running')).toBe(true);

    // Verify agent name
    const agentName = container.querySelector('.agent-name');
    expect(agentName?.textContent).toContain('Claude Agent');

    // Verify model and thinking pill
    const modelPill = container.querySelector('.model-badge');
    expect(modelPill?.textContent).toContain('claude-3-7-sonnet');

    const thinkingPill = container.querySelector('.thinking-badge');
    expect(thinkingPill?.textContent).toContain('medium');
  });

  it('should update status dot class to error when process crashes', () => {
    const header = new HeaderComponent({
      container,
      onAction: onActionMock,
    });

    header.updateProcessStatus('agent-1', 'error');

    const statusDot = container.querySelector('.status-dot');
    expect(statusDot?.classList.contains('error')).toBe(true);
  });

  it('should render agent selector, connection button, and action controls without top fork button', () => {
    const header = new HeaderComponent({
      container,
      onAction: onActionMock,
    });

    header.update({
      activeSession: {
        id: 'sess-123',
        agentId: 'agent-1',
        title: 'Active Turn',
        status: 'idle',
        messages: [],
        createdAt: 1000,
        updatedAt: 1000,
      },
      sessions: [],
      agentConfigs: [
        {
          id: 'agent-1',
          name: 'Claude Agent',
          command: 'node',
          args: [],
          env: {},
          transport: 'stdio',
          enabled: true,
        },
      ],
      inputHistory: [],
      processStatuses: {
        'agent-1': 'stopped',
      },
    });

    // Top fork button must NOT exist
    const forkBtn = container.querySelector('[data-action="fork"]');
    expect(forkBtn).toBeNull();

    // Agent selector must exist
    const agentSelect = container.querySelector('select.header-agent-select') as HTMLSelectElement;
    expect(agentSelect).not.toBeNull();
    expect(agentSelect.value).toBe('agent-1');

    // Connect button must exist
    const connectBtn = container.querySelector('.btn-agent-connection') as HTMLButtonElement;
    expect(connectBtn).not.toBeNull();
    expect(connectBtn.textContent).toContain('Connect');

    // Click Connect button
    connectBtn.click();
    expect(onActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CREATE_SESSION',
        payload: expect.objectContaining({ agentId: 'agent-1' }),
      })
    );

    // Config and History buttons
    const configBtn = container.querySelector<HTMLButtonElement>('[data-action="toggle-config"]');
    configBtn?.click();
    expect(onActionMock).toHaveBeenCalledWith({ type: 'TOGGLE_CONFIG' });

    const historyBtn = container.querySelector<HTMLButtonElement>('[data-action="toggle-history"]');
    historyBtn?.click();
    expect(onActionMock).toHaveBeenCalledWith({ type: 'TOGGLE_HISTORY' });

    // Output logs button
    const outputBtn = container.querySelector<HTMLButtonElement>('[data-action="show-output"]');
    expect(outputBtn).not.toBeNull();
    outputBtn?.click();
    expect(onActionMock).toHaveBeenCalledWith({ type: 'SHOW_OUTPUT' });
  });

  it('should NOT render model or thinking badges when no agent is connected or running', () => {
    const header = new HeaderComponent({
      container,
      onAction: onActionMock,
    });

    header.update({
      activeSession: undefined,
      sessions: [],
      agentConfigs: [],
      inputHistory: [],
      processStatuses: {},
    });

    const modelBadge = container.querySelector('.model-badge');
    const thinkingBadge = container.querySelector('.thinking-badge');

    expect(modelBadge).toBeNull();
    expect(thinkingBadge).toBeNull();
    expect(container.textContent).toContain('No Agent');
    expect(container.textContent).not.toContain('default');
    expect(container.textContent).not.toContain('off');
  });
});

