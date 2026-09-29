import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProcessManager } from '../../src/core/process/process-manager';
import type { AgentConfig } from '../../src/core/types/config';
import type { ProcessStatusEvent } from '../../src/core/ports';

describe('T4: ProcessManager (Lifecycle Supervision & Zombie Protection)', () => {
  let processManager: ProcessManager;

  beforeEach(() => {
    // Instantiate with shorter grace period (200ms) for fast test execution
    processManager = new ProcessManager(200);
  });

  afterEach(async () => {
    await processManager.dispose();
  });

  it('should start a process, report running status, and provide stdio streams', async () => {
    const config: AgentConfig = {
      id: 'agent-echo',
      name: 'Echo Agent',
      command: 'node',
      args: ['-e', 'process.stdin.on("data", (d) => process.stdout.write(d)); setInterval(() => {}, 1000)'],
      env: {},
      transport: 'stdio',
      enabled: true,
    };

    const statusEvents: ProcessStatusEvent[] = [];
    processManager.onStatusChange((e) => statusEvents.push(e));

    const proc = await processManager.start(config);
    expect(proc.pid).toBeGreaterThan(0);
    expect(processManager.getStatus('agent-echo')).toBe('running');

    expect(statusEvents.some((e) => e.status === 'starting')).toBe(true);
    expect(statusEvents.some((e) => e.status === 'running')).toBe(true);

    // Verify stdout write/read
    const outputPromise = new Promise<string>((resolve) => {
      proc.stdout.once('data', (chunk) => resolve(chunk.toString()));
    });
    proc.stdin.write('ping\n');
    const output = await outputPromise;
    expect(output).toContain('ping');

    await processManager.stop('agent-echo');
    expect(processManager.getStatus('agent-echo')).toBe('stopped');
  });

  it('should detect abnormal process crash and transition to error status', async () => {
    const config: AgentConfig = {
      id: 'agent-crash',
      name: 'Crashing Agent',
      command: 'node',
      args: ['-e', 'setTimeout(() => process.exit(42), 50)'],
      env: {},
      transport: 'stdio',
      enabled: true,
    };

    const crashPromise = new Promise<ProcessStatusEvent>((resolve) => {
      const sub = processManager.onStatusChange((e) => {
        if (e.agentId === 'agent-crash' && e.status === 'error') {
          sub.dispose();
          resolve(e);
        }
      });
    });

    await processManager.start(config);
    const errEvent = await crashPromise;

    expect(processManager.getStatus('agent-crash')).toBe('error');
    expect(errEvent.error).toContain('42');
  });

  it('should escalate to SIGKILL if process does not exit on SIGTERM within timeout', async () => {
    // Process that ignores SIGTERM once ready
    const config: AgentConfig = {
      id: 'agent-stubborn',
      name: 'Stubborn Agent',
      command: 'node',
      args: [
        '-e',
        'process.on("SIGTERM", () => {}); process.stdout.write("ready\\n"); setInterval(() => {}, 1000);',
      ],
      env: {},
      transport: 'stdio',
      enabled: true,
    };

    const proc = await processManager.start(config);
    // Wait until JS signal handler is actively running
    await new Promise<void>((resolve) => {
      proc.stdout.once('data', () => resolve());
    });
    expect(processManager.getStatus('agent-stubborn')).toBe('running');

    // stop() will trigger SIGTERM, then timeout (200ms), then SIGKILL
    const startStop = Date.now();
    await processManager.stop('agent-stubborn');
    const duration = Date.now() - startStop;

    expect(duration).toBeGreaterThanOrEqual(180);
    expect(processManager.getStatus('agent-stubborn')).toBe('stopped');
  });

  it('should restart a running process cleanly with a new PID', async () => {
    const config: AgentConfig = {
      id: 'agent-restart',
      name: 'Restartable Agent',
      command: 'node',
      args: ['-e', 'setInterval(() => {}, 1000)'],
      env: {},
      transport: 'stdio',
      enabled: true,
    };

    const proc1 = await processManager.start(config);
    const pid1 = proc1.pid;

    const proc2 = await processManager.restart('agent-restart');
    expect(proc2.pid).toBeGreaterThan(0);
    expect(proc2.pid).not.toBe(pid1);
    expect(processManager.getStatus('agent-restart')).toBe('running');
  });

  it('should handle non-existent commands by transitioning to error', async () => {
    const config: AgentConfig = {
      id: 'agent-invalid',
      name: 'Invalid Agent',
      command: 'non_existent_binary_xyz_123',
      args: [],
      env: {},
      transport: 'stdio',
      enabled: true,
    };

    await expect(processManager.start(config)).rejects.toThrow();
    expect(processManager.getStatus('agent-invalid')).toBe('error');
  });

  it('should terminate all running processes when disposed', async () => {
    const config1: AgentConfig = {
      id: 'agent-1',
      name: 'Agent 1',
      command: 'node',
      args: ['-e', 'setInterval(() => {}, 1000)'],
      env: {},
      transport: 'stdio',
      enabled: true,
    };
    const config2: AgentConfig = {
      id: 'agent-2',
      name: 'Agent 2',
      command: 'node',
      args: ['-e', 'setInterval(() => {}, 1000)'],
      env: {},
      transport: 'stdio',
      enabled: true,
    };

    await processManager.start(config1);
    await processManager.start(config2);

    expect(processManager.getStatus('agent-1')).toBe('running');
    expect(processManager.getStatus('agent-2')).toBe('running');

    await processManager.dispose();

    expect(processManager.getStatus('agent-1')).toBe('stopped');
    expect(processManager.getStatus('agent-2')).toBe('stopped');
  });

  it('should stream stdout and stderr to onLog listener', async () => {
    const config: AgentConfig = {
      id: 'agent-logging',
      name: 'Logging Agent',
      command: 'node',
      args: ['-e', 'console.log("hello stdout"); console.error("hello stderr");'],
      env: {},
      transport: 'stdio',
      enabled: true,
    };

    const logs: Array<{ agentId: string; text: string; stream: string }> = [];
    processManager.onLog((agentId, text, stream) => {
      logs.push({ agentId, text, stream });
    });

    await processManager.start(config);
    await new Promise((r) => setTimeout(r, 100));

    expect(logs.some((l) => l.agentId === 'agent-logging' && l.text.includes('hello stdout'))).toBe(true);
    expect(logs.some((l) => l.agentId === 'agent-logging' && l.text.includes('hello stderr'))).toBe(true);
  });
});
