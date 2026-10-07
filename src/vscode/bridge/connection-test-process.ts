import { spawn, type ChildProcess } from "child_process";
import type { AgentConfig } from "../../core/types/config";
import { AcpClientAdapter } from "../../core/protocol/acp-client-adapter";
import { resolveConfigCwd } from "./types";

function exited(child: ChildProcess): boolean { return child.exitCode !== null || child.signalCode !== null; }
export async function reapTestProcess(child: ChildProcess): Promise<void> {
  if (exited(child)) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onExit: () => void = () => {};
  const exit = new Promise<void>(resolve => { onExit = resolve; child.once("exit", onExit); });
  try {
    child.kill("SIGTERM");
    if (exited(child)) return;
    await Promise.race([exit, new Promise<void>(resolve => { timer = setTimeout(resolve, 5000); })]);
    if (!exited(child)) {
      if (timer) clearTimeout(timer);
      child.kill("SIGKILL");
      if (!exited(child)) await Promise.race([exit, new Promise<void>((_, reject) => { timer = setTimeout(() => reject(new Error("Agent process did not exit after SIGKILL")), 5000); })]);
    }
  } finally {
    if (timer) clearTimeout(timer);
    child.off("exit", onExit);
  }
}
export async function initializeTestProcess(config: AgentConfig, signal: AbortSignal): Promise<{ protocolVersion: number; capabilities: unknown }> {
  let child: ChildProcess | undefined;
  let adapter: AcpClientAdapter | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let diagnostics = "";
  let spawnFailed = false;
  let onError: (error: Error) => void = () => {};
  let onExit: () => void = () => {};
  let onAbort: () => void = () => {};
  const drain = (chunk: Buffer | string) => { diagnostics = (diagnostics + String(chunk)).slice(-4096); };
  try {
    if (signal.aborted) throw new Error("Connection test cancelled");
    child = spawn(config.command, config.args ?? [], {
      env: { ...process.env, ...config.env }, cwd: resolveConfigCwd(config.cwd), stdio: ["pipe", "pipe", "pipe"], shell: false,
    });
    const failure = new Promise<never>((_, reject) => {
      onError = error => { spawnFailed = true; reject(error); };
      onExit = () => reject(new Error(`Agent exited before initialization${diagnostics ? `: ${diagnostics}` : ""}`));
      onAbort = () => reject(new Error("Connection test cancelled"));
      child!.once("error", onError); child!.once("exit", onExit); signal.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => reject(new Error("Connection test timed out after 10000ms")), 10000);
    });
    child.stderr?.on("data", drain);
    if (!child.stdout || !child.stdin) throw new Error("Failed to open process stdio");
    adapter = new AcpClientAdapter({ input: child.stdout, output: child.stdin, clientInfo: { name: "vscode-acp-client-test", version: "0.1.0" } });
    const initialized = await Promise.race([adapter.initialize(), failure]);
    if (signal.aborted) throw new Error("Connection test cancelled");
    return { protocolVersion: initialized.protocolVersion, capabilities: initialized.agentCapabilities };
  } finally {
    if (timer) clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
    try { adapter?.close(); } finally {
      if (child) {
        child.off("exit", onExit);
        child.stdout?.resume();
        try { if (!spawnFailed || child.pid !== undefined) await reapTestProcess(child); } finally {
          child.off("error", onError); child.stderr?.off("data", drain);
          child.stdin?.destroy(); child.stdout?.destroy(); child.stderr?.destroy();
        }
      }
    }
  }
}
