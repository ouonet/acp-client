import * as vscode from "vscode";
import type { IWorkspacePort, Disposable } from "../core/ports";
import { isWebviewAction, type WebviewAction, type ExtensionMessage } from "../shared/ipc-protocol";
import type { BridgeContext, AcpViewProviderOptions } from "./bridge/types";
import { getHtmlForWebview } from "./bridge/html-util";
import { PromptHandler } from "./bridge/prompt-handler";
import { SessionHandler } from "./bridge/session-handler";
import { ConfigHandler } from "./bridge/config-handler";
import { PermissionHandler } from "./bridge/permission-handler";
import { WorkspaceHandler } from "./bridge/workspace-handler";
import { SnapshotBroadcaster } from "./bridge/snapshot-broadcaster";
import { ActionRouter } from "./bridge/action-router";

export { AcpViewProviderOptions };

export class AcpViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "acpClient.chatView";
  private view?: vscode.WebviewView;
  private readonly disposables: Disposable[] = [];
  private activeSessionSubscription?: Disposable;
  public workspaceAdapter?: IWorkspacePort;

  private readonly promptHandler: PromptHandler;
  private readonly sessionHandler: SessionHandler;
  private readonly configHandler: ConfigHandler;
  private readonly permissionHandler: PermissionHandler;
  private readonly workspaceHandler: WorkspaceHandler;
  private readonly snapshotBroadcaster: SnapshotBroadcaster;
  private readonly router: ActionRouter;

  public get outputChannel(): vscode.OutputChannel | undefined {
    return this.options.outputChannel;
  }

  constructor(private readonly options: AcpViewProviderOptions) {
    this.workspaceAdapter = options.workspaceAdapter;
    const self = this;
    const ctx: BridgeContext = {
      sessionHub: options.sessionHub,
      processManager: options.processManager,
      storageManager: options.storageManager,
      get workspaceAdapter() { return self.workspaceAdapter; },
      get outputChannel() { return self.outputChannel; },
      postMessage: this.postMessage.bind(this),
      broadcastStateSnapshot: this.broadcastStateSnapshot.bind(this),
      bindActiveSessionEvents: this.bindActiveSessionEvents.bind(this),
      log: this.log.bind(this),
      getConfigRevisions: () => this.configHandler.getConfigRevisions(),
    };

    this.promptHandler = new PromptHandler(ctx);
    this.sessionHandler = new SessionHandler(ctx);
    this.configHandler = new ConfigHandler(ctx);
    this.permissionHandler = new PermissionHandler(ctx);
    this.workspaceHandler = new WorkspaceHandler(ctx);
    this.snapshotBroadcaster = new SnapshotBroadcaster(ctx);
    this.router = new ActionRouter(ctx, this.promptHandler, this.sessionHandler, this.configHandler, this.permissionHandler, this.workspaceHandler);

    this.disposables.push(
      options.sessionHub.onSessionListChange(() => this.broadcastStateSnapshot()),
      options.sessionHub.onActiveSessionChange(() => {
        this.bindActiveSessionEvents();
        this.broadcastStateSnapshot();
      }),
      options.processManager.onStatusChange((e) => this.postMessage({ type: "PROCESS_STATUS_CHANGE", payload: e })),
    );
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context?: vscode.WebviewViewResolveContext,
    _token?: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    this.bindActiveSessionEvents();
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [this.options.extensionUri] };
    webviewView.webview.html = getHtmlForWebview(webviewView.webview, this.options.extensionUri);
    webviewView.webview.onDidReceiveMessage(async (data: unknown) => {
      if (isWebviewAction(data)) {
        try {
          await this.handleAction(data);
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          this.log(`Error handling action ${data.type}: ${errMsg}`);
          vscode.window.showErrorMessage(`ACP Client: ${errMsg}`, "Show Output").then((c) => {
            if (c === "Show Output") this.outputChannel?.show(true);
          });
        }
      }
    });
    webviewView.onDidDispose(() => { this.view = undefined; this.configHandler.cancelTests(); });
  }

  public log(msg: string): void {
    this.outputChannel?.appendLine(`[${new Date().toISOString()}] [AcpViewProvider] ${msg}`);
  }

  public async postMessage(msg: ExtensionMessage): Promise<boolean> {
    return this.view ? this.view.webview.postMessage(msg) : false;
  }

  public async broadcastStateSnapshot(): Promise<void> {
    await this.snapshotBroadcaster.broadcast(!!this.view);
  }

  public dispose(): void {
    this.view = undefined;
    this.configHandler.dispose();
    for (const d of this.disposables) { try { d.dispose(); } catch {} }
    this.disposables.length = 0;
    this.activeSessionSubscription?.dispose();
  }

  public async waitForDisposal(): Promise<void> { await this.configHandler.waitForTests(); }

  private bindActiveSessionEvents(): void {
    this.activeSessionSubscription?.dispose();
    const active = this.options.sessionHub.getActiveSession();
    if (!active) return;
    this.activeSessionSubscription = active.onEvent((event) => {
      this.postMessage({ type: "SESSION_EVENT", payload: { sessionId: active.id, agentId: active.agentId, generation: this.options.sessionHub.getConnection?.(active.agentId)?.generation, runtimeRevision: active.serialize().runtimeRevision, event } });
    });
  }

  public async handleAction(action: WebviewAction): Promise<void> {
    return this.router.handle(action);
  }
}
