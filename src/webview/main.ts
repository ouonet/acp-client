/**
 * Main Webview Client SPA Entry Point
 * Orchestrates Header, ChatView, InputBox, ConfigPanel, and HistoryDrawer components.
 */

import { HeaderComponent } from './components/header';
import { ChatViewComponent } from './components/chat-view';
import { InputBoxComponent } from './components/input-box';
import { ConfigPanelComponent } from './components/config-panel';
import { HistoryDrawerComponent } from './components/history-drawer';
import type {
  WebviewAction,
  ExtensionMessage,
  WebviewStateSnapshot,
} from '../shared/ipc-protocol';
import type { SessionEvent, ThinkingLevel } from '../core/types/session';

declare function acquireVsCodeApi<T = unknown>(): {
  postMessage: (msg: unknown) => void;
  getState: () => T | undefined;
  setState: (state: T) => void;
};

// Acquire VS Code Webview API with fallback for headless/browser environments
export const vscodeApi =
  typeof acquireVsCodeApi === 'function'
    ? acquireVsCodeApi<WebviewStateSnapshot>()
    : {
        postMessage: (msg: unknown) => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('vscode-post-message', { detail: msg }));
          }
        },
        getState: () => undefined,
        setState: () => {},
      };

export class WebviewApp {
  private header!: HeaderComponent;
  private chatView!: ChatViewComponent;
  private inputBox!: InputBoxComponent;
  private configPanel!: ConfigPanelComponent;
  private historyDrawer!: HistoryDrawerComponent;

  private configDrawerEl!: HTMLElement;
  private historyDrawerEl!: HTMLElement;

  private currentSnapshot?: WebviewStateSnapshot;

  constructor() {
    this.mountDom();
    this.initComponents();
    this.bindWindowMessages();

    // Notify extension host that webview is mounted and ready
    vscodeApi.postMessage({ type: 'READY' } satisfies WebviewAction);
  }

  private mountDom(): void {
    let appRoot = document.getElementById('app');
    if (!appRoot && !document.getElementById('header')) {
      appRoot = document.createElement('div');
      appRoot.id = 'app';
      document.body.appendChild(appRoot);
    }

    if (appRoot && !document.getElementById('header')) {
      appRoot.innerHTML = `
        <div id="header"></div>
        <div class="main-content">
          <div id="chat-container" class="chat-scroll-area"></div>
          <div id="config-drawer" class="drawer-overlay"></div>
          <div id="history-drawer" class="drawer-overlay"></div>
        </div>
        <div id="input-container" class="input-dock"></div>
      `;
    }

    this.configDrawerEl = document.getElementById('config-drawer') as HTMLElement;
    this.historyDrawerEl = document.getElementById('history-drawer') as HTMLElement;
  }

  private initComponents(): void {
    const headerContainer = document.getElementById('header') as HTMLElement;
    const chatContainer = document.getElementById('chat-container') as HTMLElement;
    const inputContainer = document.getElementById('input-container') as HTMLElement;

    // 1. Header
    this.header = new HeaderComponent({
      container: headerContainer,
      onAction: (action) => {
        if (action.type === 'TOGGLE_CONFIG') {
          this.historyDrawerEl.classList.remove('open');
          this.configDrawerEl.classList.toggle('open');
        } else if (action.type === 'TOGGLE_HISTORY') {
          this.configDrawerEl.classList.remove('open');
          this.historyDrawerEl.classList.toggle('open');
        } else {
          vscodeApi.postMessage(action);
        }
      },
    });

    // 2. Chat View
    this.chatView = new ChatViewComponent({
      container: chatContainer,
      onAction: (action) => {
        vscodeApi.postMessage(action);
      },
    });

    // 3. Input Box
    this.inputBox = new InputBoxComponent({
      container: inputContainer,
      status: 'idle',
      onSend: (data) => {
        vscodeApi.postMessage({
          type: 'SEND_PROMPT',
          payload: {
            sessionId: data.sessionId,
            prompt: data.attachments && data.attachments.length > 0
              ? [
                  { type: 'text', text: data.text },
                  ...data.attachments.map((a) => ({
                    type: 'image' as const,
                    data: a.data,
                    mimeType: a.mimeType,
                  })),
                ]
              : data.text,
            options: {
              model: data.model,
              thinkingLevel: data.thinkingLevel,
            },
          },
        } satisfies WebviewAction);
      },
      onCancel: (sessionId) => {
        vscodeApi.postMessage({
          type: 'CANCEL_PROMPT',
          payload: { sessionId },
        } satisfies WebviewAction);
      },
      onModelChange: (model: string) => {
        if (this.currentSnapshot) {
          if (this.currentSnapshot.activeSession) {
            this.currentSnapshot.activeSession.model = model;
          }
          this.header.update(this.currentSnapshot);
        }
      },
      onThinkingLevelChange: (level: ThinkingLevel) => {
        if (this.currentSnapshot) {
          if (this.currentSnapshot.activeSession) {
            this.currentSnapshot.activeSession.thinkingLevel = level;
          }
          this.header.update(this.currentSnapshot);
        }
      },
    });

    // 4. Config Panel Drawer
    this.configPanel = new ConfigPanelComponent({
      container: this.configDrawerEl,
      configs: [],
      onAction: (action) => {
        vscodeApi.postMessage(action);
      },
      onClose: () => {
        this.configDrawerEl.classList.remove('open');
      },
    });

    // 5. History Drawer
    this.historyDrawer = new HistoryDrawerComponent({
      container: this.historyDrawerEl,
      sessions: [],
      onAction: (action) => {
        vscodeApi.postMessage(action);
      },
      onClose: () => {
        this.historyDrawerEl.classList.remove('open');
      },
    });
  }

  private bindWindowMessages(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      const msg = event.data as ExtensionMessage;
      if (!msg || typeof msg !== 'object') return;

      this.handleExtensionMessage(msg);
    });
  }

  public handleExtensionMessage(msg: ExtensionMessage): void {
    switch (msg.type) {
      case 'STATE_SNAPSHOT': {
        this.applyStateSnapshot(msg.payload);
        break;
      }

      case 'SESSION_EVENT': {
        const { event } = msg.payload;
        this.handleSessionEvent(event);
        break;
      }

      case 'PROCESS_STATUS_CHANGE': {
        const { agentId, status } = msg.payload;
        this.header.updateProcessStatus(agentId, status);
        if (this.currentSnapshot) {
          this.currentSnapshot.processStatuses[agentId] = status as any;
          this.header.update(this.currentSnapshot);
          if (this.currentSnapshot.activeSession?.agentId === agentId) {
            const isRunning = status === 'running';
            this.inputBox.setModel(isRunning ? this.currentSnapshot.activeSession.model : undefined);
            this.inputBox.setThinkingLevel(
              isRunning ? this.currentSnapshot.activeSession.thinkingLevel : undefined
            );
          }
        }
        break;
      }

      case 'TEST_CONNECTION_RESULT': {
        this.configPanel.showTestResult(msg.payload);
        break;
      }

      case 'INPUT_HISTORY_UPDATE': {
        this.inputBox.setHistory(msg.payload.history);
        break;
      }
    }
  }

  private applyStateSnapshot(snapshot: WebviewStateSnapshot): void {
    this.currentSnapshot = snapshot;

    // 1. Header
    this.header.update(snapshot);

    // 2. Active Session & Messages
    const activeAgentId = snapshot.activeSession?.agentId || snapshot.agentConfigs[0]?.id;
    this.chatView.setAgentContext(
      snapshot.agentConfigs || [],
      snapshot.processStatuses || {},
      activeAgentId
    );

    if (snapshot.activeSession) {
      const s = snapshot.activeSession;
      const isRunning = snapshot.processStatuses[s.agentId] === 'running';
      this.inputBox.setSessionId(s.id);
      this.inputBox.setStatus(s.status);
      this.inputBox.setModel(isRunning ? s.model : undefined);
      this.inputBox.setThinkingLevel(isRunning ? s.thinkingLevel : undefined);

      this.chatView.setSessionId(s.id);
      this.chatView.setMessages(s.messages);
    } else {
      this.chatView.setSessionId('');
      this.chatView.setMessages([]);
      this.inputBox.setStatus('idle');
      this.inputBox.setSessionId('');
      this.inputBox.setModel(undefined);
      this.inputBox.setThinkingLevel(undefined);
    }

    // 3. Input History
    this.inputBox.setHistory(snapshot.inputHistory || []);

    // 4. Config Panel
    this.configPanel.setConfigs(
      snapshot.agentConfigs || [],
      snapshot.activeSession?.agentId
    );

    // 5. History Drawer
    this.historyDrawer.setSessions(
      snapshot.sessions || [],
      snapshot.activeSession?.id
    );
  }

  private handleSessionEvent(event: SessionEvent): void {
    if (event.type === 'status_change') {
      this.inputBox.setStatus(event.payload.status);
    } else if (event.type === 'chunk') {
      this.chatView.appendAssistantChunk(event.payload.content);
    } else if (event.type === 'thinking') {
      this.chatView.appendThinkingChunk(event.payload.thinking);
    } else if (event.type === 'tool_call') {
      this.chatView.appendToolCall(event.payload);
    } else if (event.type === 'tool_result') {
      this.chatView.updateToolResult(event.payload.id, event.payload.output, event.payload.status);
    } else if (event.type === 'permission_request') {
      this.chatView.handlePermissionRequest(event.payload);
    }
  }
}

// Auto-initialize when running in browser/webview environment (not under test)
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const isTest = typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test';
  if (!isTest) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        new WebviewApp();
      });
    } else {
      new WebviewApp();
    }
  }
}
