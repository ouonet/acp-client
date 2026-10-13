import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "../../src/core/types/config";

const spawn = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn }));
vi.mock("child_process", () => ({ spawn }));

import { agentCommandUsesShell } from "../../src/core/process/process-manager";
import { initializeTestProcess } from "../../src/vscode/bridge/connection-test-process";

describe("connection test spawn", () => {
  beforeEach(() => {
    spawn.mockReset();
    spawn.mockReturnValue({
      pid: 1,
      exitCode: 0,
      signalCode: null,
      stdout: undefined,
      stdin: undefined,
      stderr: { on() {}, off() {}, destroy() {} },
      once() {},
      off() {},
      kill() {},
      destroy() {},
    });
  });

  it("uses the same shell flag as a real agent launch for .cmd commands", async () => {
    const command = "C:\\Tools\\npx.cmd";
    const config = {
      id: "agent",
      name: "Agent",
      command,
      args: [],
      env: {},
      transport: "stdio",
      enabled: true,
    } as AgentConfig;

    await expect(initializeTestProcess(config, new AbortController().signal)).rejects.toThrow(/stdio/);

    expect(spawn).toHaveBeenCalled();
    expect(spawn.mock.calls[0][2]).toEqual(expect.objectContaining({
      shell: agentCommandUsesShell(command),
    }));
    if (process.platform === "win32") expect(spawn.mock.calls[0][2].shell).toBe(true);
  });
});
