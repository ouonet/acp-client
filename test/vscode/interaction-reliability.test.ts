import { describe, it, expect, vi } from "vitest";
import { PassThrough, Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import * as vscode from "vscode";
import { AcpClientAdapter } from "../../src/core/protocol/acp-client-adapter";
import { Session } from "../../src/core/session/session";
import { createPermissionHandler } from "../../src/vscode/extension";
import { AcpViewProvider } from "../../src/vscode/acp-view-provider";
import { VsCodeWorkspaceAdapter } from "../../src/vscode/ports/vscode-workspace-adapter";

describe("host permission bridge", () => {
  it("completes a real ACP request through Session approval and the selected option", async () => {
    const clientToAgent = new PassThrough();
    const agentToClient = new PassThrough();
    const request = {
      sessionId: "remote",
      toolCall: { toolCallId: "call", title: "Write" },
      options: [
        { optionId: "once", name: "Allow", kind: "allow_once" as const },
      ],
    };
    let permissionResponse: any;
    const app = acp
      .agent({ name: "test" })
      .onRequest(acp.methods.agent.initialize, () => ({
        protocolVersion: 1,
        agentCapabilities: {},
      }))
      .onRequest(acp.methods.agent.session.prompt, async (ctx) => {
        permissionResponse = await ctx.client.request(
          acp.methods.client.session.requestPermission,
          request,
        );
        return { stopReason: "end_turn" as const };
      });
    const connection = app.connect(
      acp.ndJsonStream(
        Writable.toWeb(agentToClient) as WritableStream<Uint8Array>,
        Readable.toWeb(clientToAgent) as ReadableStream<Uint8Array>,
      ),
    );
    let session: Session | undefined;
    const handler = createPermissionHandler(
      () =>
        ({
          getSession: (id: string) => (id === "remote" ? session : undefined),
        }) as any,
    );
    const adapter = new AcpClientAdapter({
      input: agentToClient,
      output: clientToAgent,
      onRequestPermission: handler,
    });
    try {
      await adapter.initialize();
      session = new Session({ id: "remote", agentId: "agent", adapter } as any);
      let receive: (action: any) => Promise<void> = async () => {};
      const posted: any[] = [];
      const dispose = () => ({ dispose: () => {} });
      const hub = {
        getSession: () => session,
        getActiveSession: () => session,
        listSessions: () => [],
        onSessionListChange: dispose,
        onActiveSessionChange: dispose,
      };
      const provider = new AcpViewProvider({
        extensionUri: vscode.Uri.file("/ext"),
        sessionHub: hub,
        storageManager: {
          getAgentConfigs: async () => [],
          getInputHistory: async () => [],
        },
        processManager: { onStatusChange: dispose, getStatus: () => "running" },
      } as any);
      provider.resolveWebviewView(
        {
          webview: {
            postMessage: async (message: any) => {
              posted.push(message);
              return true;
            },
            onDidReceiveMessage: (callback: any) => {
              receive = callback;
              return dispose();
            },
          },
          onDidDispose: dispose,
        } as any,
        {} as any,
        {} as any,
      );
      let replyError: unknown;
      const reply = vi.fn(async (event: any) => {
        if (event.type === "permission_request") {
          try {
            await provider.broadcastStateSnapshot();
            expect(posted).toContainEqual(
              expect.objectContaining({
                type: "STATE_SNAPSHOT",
                payload: expect.objectContaining({
                  pendingPermission: expect.objectContaining({
                    requestId: event.payload.requestId,
                  }),
                }),
              }),
            );
            await receive({
              type: "RESPOND_PERMISSION",
              payload: {
                sessionId: session!.id,
                requestId: event.payload.requestId,
                decision: "allow",
                optionId: "once",
              },
            });
            expect(session!.pendingApproval).toBeUndefined();
          } catch (error) {
            replyError = error;
            await session!.cancel();
          }
        }
      });
      session.onEvent(reply);
      await session.prompt("edit");
      expect(replyError).toBeUndefined();
      expect(reply).toHaveBeenCalledWith(
        expect.objectContaining({ type: "permission_request" }),
      );
      expect(permissionResponse).toEqual({
        outcome: { outcome: "selected", optionId: "once" },
      });
    } finally {
      session?.dispose();
      await adapter.close();
      await connection.close();
      clientToAgent.destroy();
      agentToClient.destroy();
    }
  });

  it("cancels requests for missing hubs and wrong Agent sessions", async () => {
    const params = {
      sessionId: "missing",
      toolCall: { title: "Write" },
      options: [],
    };
    expect(await createPermissionHandler(() => undefined)(params)).toEqual({
      outcome: { outcome: "cancelled" },
    });
    expect(
      await createPermissionHandler(
        () => ({ getSession: () => undefined }) as any,
      )(params),
    ).toEqual({ outcome: { outcome: "cancelled" } });
    const requestApproval = vi.fn();
    expect(
      await createPermissionHandler(
        () =>
          ({
            getSession: () => ({ agentId: "other", requestApproval }),
          }) as any,
        "expected",
      )(params),
    ).toEqual({ outcome: { outcome: "cancelled" } });
    expect(requestApproval).not.toHaveBeenCalled();
  });
});

describe("safe editor edit adapter", () => {
  it.each(["complete", "stale", "version-conflict"])(
    "handles %s without overwriting newer content",
    async (scenario) => {
      let version = 1;
      let content = scenario === "stale" ? "newer" : "original";
      const doc = {
        uri: vscode.Uri.file("/a.ts"),
        get version() {
          return version;
        },
        getText: () => content,
        positionAt: (offset: number) => ({ line: 0, character: offset }),
      };
      vi.spyOn(vscode.workspace, "openTextDocument").mockResolvedValue(
        doc as any,
      );
      const replace = vi.fn();
      const edit = vi.fn(async (callback: any) => {
        callback({ replace });
        if (scenario === "version-conflict") {
          version++;
          content = "newer";
          return false;
        }
        content = "modified";
        return true;
      });
      vi.spyOn(vscode.window, "showTextDocument").mockResolvedValue({
        document: doc,
        edit,
      } as any);
      const result = await new VsCodeWorkspaceAdapter().applyFileEdit(
        "/a.ts",
        "original",
        "modified",
      );
      expect(result).toBe(scenario === "complete");
      expect(content).toBe(scenario === "complete" ? "modified" : "newer");
      if (scenario === "stale") expect(edit).not.toHaveBeenCalled();
    },
  );
});
