import * as vscode from "vscode";
import { getNonce } from "./types";

export function getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const join = (base: vscode.Uri, ...parts: string[]) => {
    if ((vscode.Uri as any).joinPath) return (vscode.Uri as any).joinPath(base, ...parts);
    return vscode.Uri.file(`${base.fsPath}/${parts.join("/")}`);
  };
  const scriptUri = webview.asWebviewUri ? webview.asWebviewUri(join(extensionUri, "dist", "webview.js")) : "dist/webview.js";
  const styleUri = webview.asWebviewUri ? webview.asWebviewUri(join(extensionUri, "dist", "webview.css")) : "dist/webview.css";
  const nonce = getNonce();
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource} data:; img-src ${webview.cspSource} https: data:;"><link rel="stylesheet" href="${styleUri}"></head><body><div id="app"></div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
