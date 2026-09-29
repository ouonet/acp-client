/**
 * ProcessManager: Supervision & Zombie-Free Lifecycle Manager for ACP Agents
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type { IProcessPort, ProcessStatus, ProcessStatusEvent, ProcessLogCallback, Disposable } from '../ports';
import type { AgentConfig } from '../types/config';
import { ProcessError } from '../errors';

interface ManagedProcess {
  config: AgentConfig;
  child: ChildProcess;
  status: ProcessStatus;
  intentionalStop: boolean;
  exitPromise: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  resolveExit: (val: { code: number | null; signal: NodeJS.Signals | null }) => void;
  killTimeout?: NodeJS.Timeout;
}

export class ProcessManager implements IProcessPort {
  private readonly managed = new Map<string, ManagedProcess>();
  private readonly listeners = new Set<(event: ProcessStatusEvent) => void>();
  private readonly logListeners = new Set<ProcessLogCallback>();
  private readonly gracePeriodMs: number;
  private isDisposed = false;

  constructor(gracePeriodMs = 5000) {
    this.gracePeriodMs = gracePeriodMs;
  }

  onLog(listener: ProcessLogCallback): Disposable {
    this.logListeners.add(listener);
    return {
      dispose: () => {
        this.logListeners.delete(listener);
      },
    };
  }

  private log(agentId: string, text: string, stream: 'stdout' | 'stderr' | 'system'): void {
    for (const listener of this.logListeners) {
      try {
        listener(agentId, text, stream);
      } catch {
        // Prevent log listener error from disrupting process manager
      }
    }
  }

  private setStatus(agentId: string, status: ProcessStatus, pid?: number, error?: string): void {
    const entry = this.managed.get(agentId);
    if (entry) {
      entry.status = status;
    }
    const event: ProcessStatusEvent = {
      agentId,
      status,
      pid: pid ?? entry?.child.pid,
      error,
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Prevent listener error from disrupting process manager
      }
    }
  }

  getStatus(agentId: string): ProcessStatus {
    return this.managed.get(agentId)?.status ?? 'stopped';
  }

  onStatusChange(listener: (event: ProcessStatusEvent) => void): Disposable {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  async start(
    config: AgentConfig
  ): Promise<{
    pid: number;
    stdin: NodeJS.WritableStream;
    stdout: NodeJS.ReadableStream;
    stderr: NodeJS.ReadableStream;
  }> {
    if (this.isDisposed) {
      throw new ProcessError(config.id, 'ProcessManager has been disposed');
    }

    // Stop existing process for this agent if running
    if (this.managed.has(config.id)) {
      await this.stop(config.id, true);
    }

    this.setStatus(config.id, 'starting');

    const isWindows = process.platform === 'win32';
    const env = { ...process.env, ...config.env };

    if (process.platform === 'darwin' || process.platform === 'linux') {
      const extraPaths = [
        '/opt/homebrew/bin',
        '/opt/homebrew/sbin',
        '/usr/local/bin',
        '/usr/bin',
        '/bin',
        '/usr/sbin',
        '/sbin',
        process.env.HOME ? `${process.env.HOME}/.nvm/current/bin` : '',
        process.env.HOME ? `${process.env.HOME}/.cargo/bin` : '',
        process.env.HOME ? `${process.env.HOME}/.local/bin` : '',
      ].filter(Boolean);
      const currentPaths = (env.PATH || '').split(':');
      for (const p of extraPaths) {
        if (!currentPaths.includes(p)) {
          currentPaths.unshift(p);
        }
      }
      env.PATH = currentPaths.join(':');
    }

    this.log(
      config.id,
      `Spawning process: ${config.command} ${(config.args || []).join(' ')} (cwd: ${config.cwd || process.cwd()})`,
      'system'
    );

    return new Promise((resolve, reject) => {
      let child: ChildProcess;
      try {
        child = spawn(config.command, config.args, {
          env,
          cwd: config.cwd || process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: isWindows,
        });
      } catch (err: any) {
        this.log(config.id, `Failed to spawn: ${err?.message}`, 'system');
        this.setStatus(config.id, 'error', undefined, err?.message);
        return reject(new ProcessError(config.id, err?.message || 'Failed to spawn process'));
      }

      let resolveExit!: (val: { code: number | null; signal: NodeJS.Signals | null }) => void;
      const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
        (res) => {
          resolveExit = res;
        }
      );

      const managedEntry: ManagedProcess = {
        config,
        child,
        status: 'starting',
        intentionalStop: false,
        exitPromise,
        resolveExit,
      };

      this.managed.set(config.id, managedEntry);

      let hasSpawned = false;
      let stderrLog = '';

      child.stderr?.on('data', (chunk) => {
        const text = chunk.toString();
        stderrLog += text;
        if (stderrLog.length > 8000) {
          stderrLog = stderrLog.slice(-4000);
        }
        this.log(config.id, text, 'stderr');
      });

      child.stdout?.on('data', (chunk) => {
        this.log(config.id, chunk.toString(), 'stdout');
      });

      child.once('spawn', () => {
        hasSpawned = true;
        managedEntry.status = 'running';
        this.log(config.id, `Process spawned successfully (PID: ${child.pid})`, 'system');
        this.setStatus(config.id, 'running', child.pid);
        resolve({
          pid: child.pid!,
          stdin: child.stdin!,
          stdout: child.stdout!,
          stderr: child.stderr!,
        });
      });

      child.once('error', (err: any) => {
        managedEntry.status = 'error';
        this.log(config.id, `Process error: ${err.message}`, 'system');
        this.setStatus(config.id, 'error', undefined, err.message);
        if (!hasSpawned) {
          resolveExit({ code: null, signal: null });
          reject(new ProcessError(config.id, `Failed to spawn: ${err.message}`));
        }
      });

      child.once('exit', (code, signal) => {
        if (managedEntry.killTimeout) {
          clearTimeout(managedEntry.killTimeout);
          managedEntry.killTimeout = undefined;
        }

        resolveExit({ code, signal });

        if (!managedEntry.intentionalStop) {
          managedEntry.status = 'error';
          const trimmedErr = stderrLog.trim();
          const detail = trimmedErr ? `\nStderr output: ${trimmedErr}` : '';
          const errMsg = `Process exited unexpectedly with code ${code ?? 'null'}, signal ${signal ?? 'none'}${detail}`;
          this.log(config.id, errMsg, 'system');
          this.setStatus(config.id, 'error', child.pid, errMsg);
        } else {
          managedEntry.status = 'stopped';
          this.log(config.id, `Process stopped cleanly (code ${code ?? 'null'}, signal ${signal ?? 'none'})`, 'system');
          this.setStatus(config.id, 'stopped', child.pid);
        }
      });
    });
  }

  async stop(agentId: string, force = false): Promise<void> {
    const entry = this.managed.get(agentId);
    if (!entry || entry.status === 'stopped') {
      return;
    }

    entry.intentionalStop = true;
    const { child } = entry;

    // If the process never spawned (e.g. invalid command), clean up immediately
    if (!child.pid) {
      entry.status = 'stopped';
      this.managed.delete(agentId);
      return;
    }

    if (force) {
      try {
        child.kill('SIGKILL');
      } catch {
        // Ignore if already dead
      }
      await entry.exitPromise;
      this.managed.delete(agentId);
      return;
    }

    try {
      // 1. Try graceful SIGTERM
      child.kill('SIGTERM');

      // 2. Schedule SIGKILL timeout
      entry.killTimeout = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // Ignore
        }
      }, this.gracePeriodMs);

      // 3. Await process exit
      await entry.exitPromise;
    } catch {
      // Ignore errors on process kill
    } finally {
      if (entry.killTimeout) {
        clearTimeout(entry.killTimeout);
        entry.killTimeout = undefined;
      }
      this.managed.delete(agentId);
    }
  }

  async restart(agentId: string): Promise<{ pid: number }> {
    const entry = this.managed.get(agentId);
    if (!entry) {
      throw new ProcessError(agentId, 'Cannot restart unknown agent');
    }

    const { config } = entry;
    this.setStatus(agentId, 'restarting');
    await this.stop(agentId, true);
    const proc = await this.start(config);
    return { pid: proc.pid };
  }

  async dispose(): Promise<void> {
    this.isDisposed = true;
    const stopPromises = Array.from(this.managed.keys()).map((id) => this.stop(id, true));
    await Promise.allSettled(stopPromises);
    this.listeners.clear();
    this.managed.clear();
  }
}
