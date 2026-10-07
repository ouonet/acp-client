/**
 * Main Webview Client SPA Entry Point
 * Orchestrates Header, ChatView, InputBox, ConfigPanel, and HistoryDrawer components.
 */

import { HeaderComponent } from "./components/header";
import { ChatViewComponent } from "./components/chat-view";
import { InputBoxComponent } from "./components/input-box";
import { ConfigPanelComponent } from "./components/config-panel";
import { HistoryDrawerComponent } from "./components/history-drawer";
import type {
  WebviewAction,
  ExtensionMessage,
  WebviewStateSnapshot,
} from "../shared/ipc-protocol";
import type { SessionEvent, ThinkingLevel } from "../core/types/session";

declare function acquireVsCodeApi<T = unknown>(): {
  postMessage: (msg: unknown) => void;
  getState: () => T | undefined;
  setState: (state: T) => void;
};

// Acquire VS Code Webview API with fallback for headless/browser environments
export const vscodeApi =
  typeof acquireVsCodeApi === "function"
    ? acquireVsCodeApi<WebviewStateSnapshot>()
    : {
        postMessage: (msg: unknown) => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("vscode-post-message", { detail: msg }),
            );
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
    vscodeApi.postMessage({ type: "READY" } satisfies WebviewAction);
  }

  private mountDom(): void {
    let appRoot = document.getElementById("app");
    if (!appRoot && !document.getElementById("header")) {
      appRoot = document.createElement("div");
      appRoot.id = "app";
      document.body.appendChild(appRoot);
    }

    if (appRoot && !document.getElementById("header")) {
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

    this.configDrawerEl = document.getElementById(
      "config-drawer",
    ) as HTMLElement;
    this.historyDrawerEl = document.getElementById(
      "history-drawer",
    ) as HTMLElement;
  }

  private initComponents(): void {
    const headerContainer = document.getElementById("header") as HTMLElement;
    const chatContainer = document.getElementById(
      "chat-container",
    ) as HTMLElement;
    const inputContainer = document.getElementById(
      "input-container",
    ) as HTMLElement;

    // 1. Header
    this.header = new HeaderComponent({
      container: headerContainer,
      onAction: (action) => {
        if (action.type === "TOGGLE_CONFIG") {
          this.historyDrawerEl.classList.remove("open");
          this.configDrawerEl.classList.toggle("open");
        } else if (action.type === "TOGGLE_HISTORY") {
          this.configDrawerEl.classList.remove("open");
          const willOpen = !this.historyDrawerEl.classList.contains("open");
          this.historyDrawerEl.classList.toggle("open");
          if (willOpen) {
            vscodeApi.postMessage({ type: "REFRESH_SESSIONS" });
          }
        } else {
          vscodeApi.postMessage(action);
        }
      },
    });

    headerContainer.addEventListener("change", (event) => {
      if (!(event.target as HTMLElement).matches(".header-agent-select"))
        return;
      this.inputBox.setModel(undefined);
      this.inputBox.setModels([]);
      this.inputBox.setThinkingLevel(undefined);
      const agentId = this.header.getSelectedAgentId();
      const session = this.currentSnapshot?.activeSession;
      this.inputBox.setSessionId(
        session && agentId === session.agentId ? session.id : "",
      );
      this.inputBox.setProcessStatus(
        (agentId && this.currentSnapshot?.processStatuses[agentId]) ||
          "stopped",
      );
      this.inputBox.setStatus(
        session && agentId === session.agentId ? session.status : "idle",
      );
      if (session && agentId === session.agentId) {
        this.inputBox.setModels(session.availableModels || []);
        this.inputBox.setModel(session.model);
        this.inputBox.setThinkingLevels(session.availableThinkingLevels || []);
        this.inputBox.setThinkingLevel(session.thinkingLevel);
      }
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
      status: "idle",
      onSend: (data) => {
        vscodeApi.postMessage({
          type: "SEND_PROMPT",
          payload: {
            requestId: data.requestId,
            agentId: this.header.getSelectedAgentId(),
            sessionId:
              this.header.getSelectedAgentId() ===
              this.currentSnapshot?.activeSession?.agentId
                ? data.sessionId
                : "",
            prompt:
              data.attachments && data.attachments.length > 0
                ? [
                    { type: "text", text: data.text },
                    ...data.attachments.map((a) => ({
                      type: "image" as const,
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
      onClear: () => {
        const session = this.currentSnapshot?.activeSession;
        if (session && session.status !== "idle") return;
        const agentId =
          this.header.getSelectedAgentId() ||
          session?.agentId ||
          this.currentSnapshot?.agentConfigs[0]?.id;
        if (agentId)
          vscodeApi.postMessage({
            type: "CREATE_SESSION",
            payload: { agentId, title: "New Session" },
          } satisfies WebviewAction);
      },
      onFork: () => {
        const session = this.currentSnapshot?.activeSession;
        if (!session) return;
        vscodeApi.postMessage({
          type: "FORK_SESSION",
          payload: { sourceSessionId: session.id },
        } satisfies WebviewAction);
      },
      onConfig: () => {
        this.historyDrawerEl.classList.remove("open");
        this.configDrawerEl.classList.add("open");
      },
      onCompact: () => {
        const session = this.currentSnapshot?.activeSession;
        if (!session || session.status !== "idle") return;
        const agentId = this.header.getSelectedAgentId() || session.agentId;
        vscodeApi.postMessage({
          type: "SEND_PROMPT",
          payload: {
            requestId: `compact-${Date.now()}`,
            agentId,
            sessionId: session.id,
            prompt: "/compact",
          },
        } satisfies WebviewAction);
      },
      onUnsupportedCommand: (cmd) => {
        this.chatView.appendAssistantChunk(
          `\n\n> ⚠️ Command \`/${cmd}\` is not supported by the current agent.\n\n`,
        );
      },
      onHelp: (commands) => {
        const lines = commands.map((c) => {
          const badge =
            c.kind === "agent"
              ? "[Agent]"
              : c.kind === "skill"
              ? "[Skill]"
              : "[Local]";
          const hint = c.inputHint ? ` ${c.inputHint}` : "";
          return `- **\`/${c.name}${hint}\`** ${badge}: ${c.description}`;
        });
        const helpText = `### Available Slash Commands & Skills\n\n${lines.join("\n")}`;
        this.chatView.appendAssistantChunk(`\n\n${helpText}\n\n`);
      },
      onCancel: (sessionId) => {
        vscodeApi.postMessage({
          type: "CANCEL_PROMPT",
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
        vscodeApi.postMessage({
          type: "SET_CONFIG_OPTION",
          payload: {
            sessionId: this.currentSnapshot?.activeSession?.id,
            configId: "model",
            value: model,
          },
        } satisfies WebviewAction);
      },
      onThinkingLevelChange: (level: ThinkingLevel) => {
        if (this.currentSnapshot) {
          if (this.currentSnapshot.activeSession) {
            this.currentSnapshot.activeSession.thinkingLevel = level;
          }
          this.header.update(this.currentSnapshot);
        }
        vscodeApi.postMessage({
          type: "SET_CONFIG_OPTION",
          payload: {
            sessionId: this.currentSnapshot?.activeSession?.id,
            configId: "thought_level",
            value: level,
          },
        } satisfies WebviewAction);
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
        this.configDrawerEl.classList.remove("open");
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
        this.historyDrawerEl.classList.remove("open");
      },
    });
  }

  private bindWindowMessages(): void {
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape") return;
        const openDrawer = [this.configDrawerEl, this.historyDrawerEl].find(
          (drawer) => drawer.isConnected && drawer.classList.contains("open"),
        );
        if (!openDrawer) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        openDrawer.classList.remove("open");
      },
      true,
    );
    window.addEventListener("message", (event: MessageEvent) => {
      const msg = event.data as ExtensionMessage;
      if (!msg || typeof msg !== "object") return;

      this.handleExtensionMessage(msg);
    });
  }

  public handleExtensionMessage(msg: ExtensionMessage): void {
    switch (msg.type) {
      case "STATE_SNAPSHOT": {
        this.applyStateSnapshot(msg.payload);
        break;
      }

      case "SESSION_EVENT": {
        const { event } = msg.payload;
        this.handleSessionEvent(event);
        break;
      }

      case "PROCESS_STATUS_CHANGE": {
        const { agentId, status } = msg.payload;
        this.header.updateProcessStatus(agentId, status);
        if (this.currentSnapshot) {
          this.currentSnapshot.processStatuses[agentId] = status as any;
          this.header.update(this.currentSnapshot);
          const activeAgentId =
            this.currentSnapshot.activeSession?.agentId ||
            this.currentSnapshot.agentConfigs[0]?.id;
          if (activeAgentId === agentId) {
            this.inputBox.setProcessStatus(status as any);
            const s = this.currentSnapshot.activeSession;
            if (s?.availableModels && s.availableModels.length > 0) {
              this.inputBox.setModels(s.availableModels);
            }
            if (
              s?.availableThinkingLevels &&
              s.availableThinkingLevels.length > 0
            ) {
              this.inputBox.setThinkingLevels(s.availableThinkingLevels);
            }
            if (s?.model) {
              this.inputBox.setModel(s.model);
            }
            if (s?.thinkingLevel) {
              this.inputBox.setThinkingLevel(s.thinkingLevel);
            }
          }
        }
        break;
      }

      case "TEST_CONNECTION_RESULT": {
        this.configPanel.showTestResult(msg.payload);
        break;
      }

      case "PROMPT_RESULT": {
        this.inputBox.handlePromptResult(msg.payload);
        break;
      }

      case "INPUT_HISTORY_UPDATE": {
        this.inputBox.setHistory(msg.payload.history);
        break;
      }
    }
  }

  private applyStateSnapshot(snapshot: WebviewStateSnapshot): void {
    const sameSession =
      this.currentSnapshot?.activeSession?.id === snapshot.activeSession?.id;
    this.currentSnapshot = snapshot;

    // 1. Header
    this.header.update(snapshot);

    // 2. Active Session & Messages
    const activeAgentId =
      this.header.getSelectedAgentId() ||
      snapshot.activeSession?.agentId ||
      snapshot.agentConfigs[0]?.id;
    this.chatView.setAgentContext(
      snapshot.agentConfigs || [],
      snapshot.processStatuses || {},
      activeAgentId,
    );

    const currentAgentStatus = activeAgentId
      ? snapshot.processStatuses[activeAgentId] || "stopped"
      : "stopped";
    this.inputBox.setProcessStatus(currentAgentStatus as any);

    if (snapshot.activeSession) {
      const s = snapshot.activeSession;
      const selectedSession = activeAgentId === s.agentId;
      this.inputBox.setSessionId(selectedSession ? s.id : "");
      this.inputBox.setStatus(selectedSession ? s.status : "idle");
      this.inputBox.setModel(undefined);
      this.inputBox.setModels(selectedSession ? s.availableModels || [] : []);
      this.inputBox.setModel(selectedSession ? s.model : undefined);
      this.inputBox.setThinkingLevels(
        selectedSession ? s.availableThinkingLevels || [] : [],
      );
      this.inputBox.setThinkingLevel(
        selectedSession ? s.thinkingLevel : undefined,
      );
      this.inputBox.setAvailableCommands(s.availableCommands || []);
      if (snapshot.skills) {
        this.inputBox.setSkills(snapshot.skills);
      }

      this.chatView.setSessionId(s.id);
      this.chatView.setCompactions(s.compactions || []);
      this.chatView.reconcileMessages(
        s.messages,
        sameSession &&
          (s.status === "streaming" || s.status === "waiting_approval"),
      );
      this.chatView.setPendingPermission(
        snapshot.pendingPermission
          ? {
              ...snapshot.pendingPermission,
              sessionId: s.id,
              options: [...snapshot.pendingPermission.options],
            }
          : undefined,
      );
    } else {
      this.chatView.setSessionId("");
      this.chatView.setCompactions([]);
      this.chatView.reconcileMessages([], false);
      this.chatView.setPendingPermission();
      this.inputBox.setStatus("idle");
      this.inputBox.setSessionId("");
      this.inputBox.setModels([]);
      this.inputBox.setModel(undefined);
      this.inputBox.setThinkingLevel(undefined);
    }

    // 3. Input History & Capabilities
    this.inputBox.setHistory(snapshot.inputHistory || []);
    const capabilities =
      snapshot.activeAgentCapabilities || snapshot.activeSession?.capabilities;
    this.inputBox.setCapabilities(capabilities);

    // 4. Config Panel
    this.configPanel.setConfigs(
      snapshot.agentConfigs || [],
      snapshot.activeSession?.agentId,
    );

    // 5. History Drawer
    const isRunning =
      !!activeAgentId && snapshot.processStatuses[activeAgentId] === "running";
    const agentConfig = snapshot.agentConfigs?.find(
      (c) => c.id === activeAgentId,
    );
    this.historyDrawer.setSessions(
      snapshot.sessions || [],
      snapshot.activeSession?.id,
      {
        currentAgentId: activeAgentId,
        agentName: agentConfig?.name,
        isRunning,
      },
    );
  }

  private handleSessionEvent(event: SessionEvent): void {
    if (event.type === "status_change") {
      this.inputBox.setStatus(event.payload.status);
      if (event.payload.status === "idle" || event.payload.status === "error") {
        this.chatView.finishExecution();
      }
    } else if (event.type === "chunk") {
      const text =
        typeof event.payload === "string"
          ? event.payload
          : (typeof event.payload?.content === "string"
              ? event.payload.content
              : event.payload?.content?.text) ||
            event.payload?.text ||
            "";
      this.chatView.appendAssistantChunk(text);
    } else if (event.type === "thinking") {
      const text =
        typeof event.payload === "string"
          ? event.payload
          : event.payload?.thinking ||
            event.payload?.text ||
            (typeof event.payload?.content === "string"
              ? event.payload.content
              : event.payload?.content?.text) ||
            "";
      this.chatView.appendThinkingChunk(
        text,
        event.payload?.turnIndex,
        event.payload?.startedAt,
        event.payload?.messageStartedAt,
      );
    } else if (event.type === "tool_call") {
      this.chatView.appendToolCall(
        event.payload,
        event.payload?.turnIndex,
        event.payload?.messageStartedAt,
      );
    } else if (event.type === "tool_result") {
      const id = event.payload?.id || event.payload?.toolCallId;
      this.chatView.updateToolResult(
        id,
        event.payload?.output,
        event.payload?.status,
        event.payload?.input,
        event.payload?.name,
        event.payload?.completedAt,
      );
    } else if (event.type === "permission_request") {
      this.chatView.handlePermissionRequest({
        ...event.payload,
        sessionId:
          event.payload?.sessionId ||
          event.sessionId ||
          this.currentSnapshot?.activeSession?.id ||
          "",
      });
    } else if (event.type === "available_commands_update") {
      this.inputBox.setAvailableCommands(event.payload?.availableCommands || []);
    } else if (event.type === "compaction") {
      this.chatView.addCompaction(event.payload);
    } else if (event.type === "compaction_chunk") {
      this.chatView.appendCompactionChunk(event.payload);
    }
  }
}

// Auto-initialize when running in browser/webview environment (not under test)
if (typeof window !== "undefined" && typeof document !== "undefined") {
  const isTest =
    typeof process !== "undefined" &&
    process.env &&
    process.env.NODE_ENV === "test";
  if (!isTest) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        new WebviewApp();
      });
    } else {
      new WebviewApp();
    }
  }
}
