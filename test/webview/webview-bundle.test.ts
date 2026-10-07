// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as esbuild from "esbuild";

describe("Regression: Webview Bundle Execution & Mounting", () => {
  it("scripts/build.mjs must configure webview with format: 'iife'", () => {
    const buildScript = fs.readFileSync(path.resolve(__dirname, "../../scripts/build.mjs"), "utf-8");
    expect(buildScript).toContain("format: 'iife'");
  });

  it("bundle does not contain unescaped export statements and executes cleanly in webview DOM", async () => {
    const entry = path.resolve(__dirname, "../../src/webview/main.tsx");
    const result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      platform: "browser",
      target: "es2022",
      format: "iife",
      globalName: "AcpWebview",
      jsx: "automatic",
      jsxImportSource: "preact",
      write: false,
    });

    const bundleCode = result.outputFiles[0].text;

    // 1. Must be IIFE, no top-level export statements
    expect(bundleCode).not.toMatch(/export\s*\{[^}]*mountApp/);
    expect(bundleCode).toMatch(/^\s*\(?\s*(\"use strict\";\s*)?var AcpWebview/);

    // 2. Execution test in Happy DOM
    document.body.innerHTML = '<div id="app"></div>';
    const postMessages: any[] = [];
    (window as any).acquireVsCodeApi = () => ({
      postMessage: (msg: any) => postMessages.push(msg),
      getState: () => undefined,
      setState: () => {},
    });

    // Execute bundle
    const runFn = new Function("window", "document", "CustomEvent", bundleCode);
    expect(() => runFn(window, document, window.CustomEvent)).not.toThrow();

    // 3. Verify DOM was mounted
    const appEl = document.getElementById("app");
    expect(appEl).not.toBeNull();
    expect(appEl?.innerHTML).toContain("acp-app");
    expect(appEl?.innerHTML).toContain("header-left");

    // 4. Verify READY message was dispatched
    expect(postMessages).toEqual(
      expect.arrayContaining([{ type: "READY" }]),
    );
  });
});
